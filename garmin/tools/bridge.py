"""JSON-in/JSON-out boundary for native-pixel rendering and Garmin compilation."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

import designer_model as model
from designer_charts import chart_ops, device_colour, ring_tick_radius, ring_tick_inner_radius
from designer_export import prepare_scene_project

ROOT = Path(__file__).resolve().parent.parent
ET.register_namespace("iq", "http://www.garmin.com/xml/connectiq")


def mapping(scene):
    digest = hashlib.sha256(b"deets-native-pixels-v1")
    digest.update(json.dumps(scene, sort_keys=True).encode())
    for filename in ("designer_model.py", "designer_export.py", "designer_charts.py", "designer_typography.py", "designer_seconds.py", "designer_actions.py"):
        digest.update((ROOT / "tools" / filename).read_bytes())
    pack = model.scene_font_pack(scene)
    for font in sorted({e["font"] for e in scene["elements"] if model.SOURCES[e["source"]]["kind"] == "text"}):
        digest.update(pack["images"][font])
        digest.update(json.dumps(pack["fonts"][font], sort_keys=True).encode())
    return digest.hexdigest()


def layout(payload):
    scene = model.validate_scene(payload.get("scene"))
    night = payload.get("night", False)
    if type(night) is not bool:
        raise ValueError("Night mode must be a boolean.")
    operations, areas = [], []
    fonts = set()
    for element in scene["elements"]:
        if element["visible"] == ("day" if night else "night"):
            continue
        info = model.SOURCES[element["source"]]
        areas.append({"id": element["id"], "source": element["source"], "label": info["label"],
                      **{key: element[key] for key in ("x", "y", "width", "height")}})
        if info["kind"] == "text":
            operations.extend(model.render_text_ops({**scene, "elements": [element]}, night=night))
            fonts.add(element["font"])
        else:
            operations.extend(chart_ops(element, night=night, ring_radius=ring_tick_radius(scene, element),
                                        ring_inner_radius=ring_tick_inner_radius(scene, element)))
    pack = model.scene_font_pack(scene)
    return {"scene": scene, "size": model.DEVICES[scene["device"]], "mapping": mapping(scene),
            "background": device_colour(0 if night else scene["background"]), "areas": areas,
            "ops": [{**operation, "colour": device_colour(operation["colour"])} for operation in operations],
            "assets": {font: "data:image/png;base64," + base64.b64encode(pack["images"][font]).decode() for font in sorted(fonts)}}


def compiler_config():
    sdk_parent = Path.home() / "Library/Application Support/Garmin/ConnectIQ/Sdks"
    def version(directory):
        match = re.match(r"connectiq-sdk-mac-(\d+)\.(\d+)\.(\d+)", directory.name)
        return (*map(int, match.groups()), directory.name) if match else (-1, -1, -1, directory.name)
    candidates = sorted(sdk_parent.glob("connectiq-sdk-mac-*"), key=version, reverse=True)
    sdk = Path(os.environ["SDK_ROOT"]).expanduser() if os.environ.get("SDK_ROOT") else (candidates[0] if candidates else None)
    key = Path(os.environ.get("DEVELOPER_KEY", str(Path.home() / "Library/Application Support/Garmin/ConnectIQ/developer_key.der"))).expanduser()
    java = Path(os.environ.get("JAVA_HOME", "/opt/homebrew/opt/openjdk@17"))
    compiler = sdk / "bin/monkeyc" if sdk else None
    available = bool(compiler and compiler.is_file() and key.is_file() and (java / "bin/java").is_file())
    return compiler, key, java, available


def compile_scene(payload):
    scene = model.validate_scene(payload.get("scene"))
    if payload.get("mapping") != mapping(scene):
        raise ValueError("The scene or font resources changed; render the canvas again before exporting.")
    proof = payload.get("proof", False)
    night = payload.get("night", False)
    if type(proof) is not bool or type(night) is not bool:
        raise ValueError("Proof and night mode must be booleans.")
    compiler, key, java, available = compiler_config()
    if not available:
        raise RuntimeError("Garmin SDK, Java 17 or signing key is unavailable.")
    with tempfile.TemporaryDirectory(prefix="deets-garmin-") as temporary:
        project = Path(temporary)
        for name in ("manifest.xml", "monkey.jungle"):
            shutil.copy2(ROOT / name, project / name)
        for name in ("source", "resources"):
            shutil.copytree(ROOT / name, project / name)
        prepare_scene_project(project, scene, proof=proof, preview_night=night if proof else None)
        output = project / "Deets.prg"
        result = subprocess.run([str(compiler), "-f", "monkey.jungle", "-d", scene["device"],
                                 "-o", str(output), "-y", str(key), "-w"], cwd=project,
                                env=dict(os.environ, JAVA_HOME=str(java)), capture_output=True, text=True, timeout=120)
        if result.returncode or "WARNING:" in (result.stdout + result.stderr).upper() or not output.is_file():
            raise RuntimeError("Garmin compilation failed or reported warnings.")
        return {"application": base64.b64encode(output.read_bytes()).decode(), "device": scene["device"], "mapping": payload["mapping"]}


def dispatch(request):
    if not isinstance(request, dict) or set(request) != {"operation", "payload"} or not isinstance(request["payload"], dict):
        raise ValueError("A supported bridge request is required.")
    operation, payload = request["operation"], request["payload"]
    if operation == "layout":
        return layout(payload)
    if operation == "typography":
        from designer_typography import apply
        if set(payload) != {"scene", "elementId", "typography"}:
            raise ValueError("Choose a scene, element and typography settings.")
        return layout({"scene": apply(payload["scene"], payload["elementId"], payload["typography"])})
    if operation == "watch-font":
        from designer_typography import set_watch_font
        if set(payload) != {"scene", "family"}:
            raise ValueError("Choose a scene and watch font.")
        return layout({"scene": set_watch_font(payload["scene"], payload["family"])})
    if operation == "inherit-font":
        from designer_typography import set_inheritance
        if set(payload) != {"scene", "elementId", "inherit"}:
            raise ValueError("Choose a scene, element and font inheritance.")
        return layout({"scene": set_inheritance(payload["scene"], payload["elementId"], payload["inherit"])})
    if operation in {"copy-element", "delete-element", "apply-text-defaults"}:
        from designer_actions import copy_element, delete_element, apply_text_defaults
        if set(payload) != {"scene", "elementId"}:
            raise ValueError("Choose a scene and element.")
        action = {"copy-element": copy_element, "delete-element": delete_element,
                  "apply-text-defaults": apply_text_defaults}[operation]
        return layout({"scene": action(payload["scene"], payload["elementId"])})
    if operation == "text-presets":
        from designer_actions import set_text_presets
        if set(payload) != {"scene", "presets", "defaultPresetId"}:
            raise ValueError("Choose a scene, named text presets and a default preset.")
        return layout({"scene": set_text_presets(payload["scene"], payload["presets"], payload["defaultPresetId"])})
    if operation == "apply-text-preset":
        from designer_actions import apply_text_preset
        if set(payload) != {"scene", "elementId", "presetId"}:
            raise ValueError("Choose a scene, text element and named preset.")
        return layout({"scene": apply_text_preset(payload["scene"], payload["elementId"], payload["presetId"])})
    if operation == "text-defaults":
        from designer_actions import set_text_defaults
        if set(payload) != {"scene", "defaults"}:
            raise ValueError("Choose a scene and text defaults.")
        return layout({"scene": set_text_defaults(payload["scene"], payload["defaults"])})
    if operation == "add":
        from designer_typography import add_time, add_divider
        if set(payload) != {"scene", "source"} or not isinstance(payload["source"], str) or payload["source"] not in {"time", "divider"}:
            raise ValueError("Choose a scene and a supported element to add.")
        return layout({"scene": (add_divider if payload["source"] == "divider" else add_time)(payload["scene"])})
    if operation == "divider":
        from designer_typography import set_divider_symbol
        if set(payload) != {"scene", "elementId", "symbol"}:
            raise ValueError("Choose a scene, divider element and symbol.")
        return layout({"scene": set_divider_symbol(payload["scene"], payload["elementId"], payload["symbol"])})
    if operation == "seconds-size":
        from designer_typography import set_seconds_size
        if set(payload) != {"scene", "elementId", "size"}:
            raise ValueError("Choose a scene, element and seconds size.")
        return layout({"scene": set_seconds_size(payload["scene"], payload["elementId"], payload["size"])})
    if operation == "clock":
        from designer_typography import set_clock_source
        if set(payload) != {"scene", "elementId", "source"}:
            raise ValueError("Choose a scene, element and clock display.")
        return layout({"scene": set_clock_source(payload["scene"], payload["elementId"], payload["source"])})
    if operation == "export":
        return compile_scene(payload)
    if operation == "health":
        return {"compilerAvailable": compiler_config()[3]}
    raise ValueError("Unknown Garmin bridge operation.")


if __name__ == "__main__":
    try:
        data = sys.stdin.buffer.read(65537)
        if len(data) > 65536:
            raise ValueError("The scene exceeds the request limit.")
        print(json.dumps({"ok": True, "result": dispatch(json.loads(data))}))
    except ValueError as error:
        print(json.dumps({"ok": False, "error": str(error)}))
    except (OSError, RuntimeError, subprocess.SubprocessError):
        print(json.dumps({"ok": False, "error": "The local Garmin toolchain could not complete the request."}))
