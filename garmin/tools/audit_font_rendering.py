"""Compile-only comparison: canonical glyph bitmaps vs native .fnt resources.

No simulator pixels or runtime-memory measures are taken. Native .fnt drawText
placement is a prototype requiring simulator proof before production adoption.
Native variants use distinct application IDs to avoid simulator cache crossover.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import xml.etree.ElementTree as ET

REPO = Path(__file__).resolve().parent.parent.parent
import bridge
import designer_export as exporter
import designer_model as model
import designer_typography as typo


def base(device):
    return {
        "version": 2,
        "name": "Font architecture audit",
        "device": device,
        "background": 0,
        "edgeInset": 16,
        "elements": [],
    }


def scenes(device):
    simple = typo.add_time(base(device))
    simple = typo.apply(
        simple,
        "time",
        {
            "family": "time",
            "size": 70,
            "thickness": 0,
            "width": 100,
            "letterSpacing": 1,
        },
    )
    mixed = typo.add_date(simple)
    mixed = typo.set_date_source(mixed, "date", "weekday")
    mixed = typo.add_date(mixed)
    mixed["elements"][1]["colour"] = 0x9BC5FF
    mixed["elements"][1]["nightColour"] = 0x335577
    stress = base(device)
    for i in range(8):
        stress = typo.add_time(stress)
        el = stress["elements"][-1]
        stress = typo.apply(
            stress,
            el["id"],
            {
                "family": "time",
                "size": 24 + (i % 4) * 8,
                "thickness": 0,
                "width": 100,
                "letterSpacing": 1,
            },
        )
        stress["elements"][-1]["colour"] = [
            0xFFFFFF,
            0x9BC5FF,
            0x97E5B2,
            0xFFC98E,
            0xFF9E9E,
            0xA5ADFF,
            0x66CCDD,
            0xFFFF99,
        ][i]
        stress["elements"][-1]["nightColour"] = 0x667788 + i * 0x010101
    return {
        "simple": simple,
        "mixed": model.validate_scene(mixed),
        "stress": model.validate_scene(stress),
    }


def native_fonts(project, scene):
    if not (project / ".deets-font-audit").is_file():
        raise ValueError("Native font conversion requires a fresh audit project.")
    manifest_path = project / "manifest.xml"
    manifest = ET.parse(manifest_path)
    app = manifest.find("{http://www.garmin.com/xml/connectiq}application")
    app.set(
        "id",
        hashlib.md5(
            (app.get("id") + "native-fonts-prototype-v2").encode(),
            usedforsecurity=False,
        ).hexdigest(),
    )
    manifest.write(manifest_path, encoding="utf-8", xml_declaration=True)
    pack = model.scene_font_pack(scene)
    catalog = exporter._catalogue()
    fonts = sorted(
        {e["font"] for e in scene["elements"] if catalog[e["source"]]["kind"] == "text"}
    )
    needed = {key: set() for key in fonts}
    for el in scene["elements"]:
        if el["font"] in needed:
            needed[el["font"]].update(exporter._element_codes(el, catalog, False))
    shutil.rmtree(project / "resources/designer")
    (project / "resources/designer.xml").unlink()
    assets = project / "resources/native-fonts"
    assets.mkdir()
    resources = ET.Element("fonts")
    for i, key in enumerate(fonts):
        font = pack["fonts"][key]
        png = assets / f"font{i}.png"
        # Native .fnt compiler consumes a greyscale coverage image.
        png.write_bytes(
            typo._magick(
                ["png:-", "-alpha", "extract", "-type", "Grayscale", "png:-"],
                pack["images"][key],
            )
        )
        # Zero-area glyphs retain their canonical layout advance, but never
        # produce a draw operation and do not need a native font bitmap.
        glyphs = [
            (code, g)
            for code, g in font["glyphs"].items()
            if int(code) in needed[key] and g["width"] > 0 and g["height"] > 0
        ]
        lines = [
            f'info face="Audit font {i}" size={font["height"]} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=0,0 outline=0',
            f'common lineHeight={font["height"]} base={font["height"]} scaleW={font["atlasWidth"]} scaleH={font["atlasHeight"]} pages=1 packed=0',
            f'page id=0 file="font{i}.png"',
            f"chars count={len(glyphs)}",
        ]
        for code, g in glyphs:
            # Existing layout gives the exact visible glyph origin. yoffset=0
            # makes each native character originate at that explicit position.
            lines.append(
                f'char id={code} x={g["x"]} y={g["y"]} width={g["width"]} height={g["height"]} xoffset=0 yoffset=0 xadvance={g["xadvance"]} page=0 chnl=15'
            )
        (assets / f"font{i}.fnt").write_text("\n".join(lines) + "\n")
        ET.SubElement(
            resources,
            "font",
            {
                "id": f"AuditFont{i}",
                "filename": f"native-fonts/font{i}.fnt",
                "antialias": "false",
            },
        )
    ET.ElementTree(resources).write(
        project / "resources/audit-fonts.xml", encoding="utf-8", xml_declaration=True
    )
    p = project / "source/DesignerView.mc"
    text = p.read_text()
    a = text.index("    private var _bitmaps ")
    b = text.index("    private var _atlasNight", a)
    text = (
        text[:a]
        + "    private var _nativeFonts as Dictionary<Number, WatchUi.FontResource> = {};\n    private var _nativeResources as Array<ResourceId> = ["
        + ", ".join(f"Rez.Fonts.AuditFont{i}" for i in range(len(fonts)))
        + "];\n"
        + text[b:]
    )
    a = text.index("    private function loadAtlases(")
    b = text.index("    private function glyphFor(", a)
    text = (
        text[:a]
        + "    private function loadAtlases(night as Boolean) {}\n\n"
        + text[b:]
    )
    a = text.index(
        "        var atlasIndex =", text.index("    private function drawTextElement")
    )
    b = text.index("        dc.clearClip();", a)
    text = (
        text[:a]
        + """        var fontIndex = element[1];
        if (!_nativeFonts.hasKey(fontIndex)) {
            _nativeFonts[fontIndex] = WatchUi.loadResource(_nativeResources[fontIndex]) as WatchUi.FontResource;
        }
        var nativeFont = _nativeFonts[fontIndex];
        dc.setColor(night ? element[7] : element[6], Graphics.COLOR_TRANSPARENT);
        dc.setClip(element[2], element[3], element[4], _fontHeights[fontIndex]);
        for (var i = 0; i < operations.size(); i += 1) {
            var operation = operations[i];
            dc.drawText(operation[0], operation[1], nativeFont,
                        operation[2].toChar().toString(), Graphics.TEXT_JUSTIFY_LEFT);
        }
"""
        + text[b:]
    )
    text = text.replace("    private var _atlasNight = null;\n", "")
    p.write_text(text)


def project_for(scene, path):
    path.mkdir(parents=True, exist_ok=False)
    (path / ".deets-font-audit").write_text("Isolated experimental font project.\n")
    for name in ("manifest.xml", "monkey.jungle"):
        shutil.copy2(REPO / "garmin" / name, path / name)
    for name in ("source", "resources"):
        shutil.copytree(REPO / "garmin" / name, path / name, dirs_exist_ok=True)
    exporter.prepare_scene_project(path, scene)


def compile_project(project, device):
    compiler, key, java, available = bridge.compiler_config()
    if not available:
        raise RuntimeError("Compiler unavailable")
    started = time.monotonic()
    result = subprocess.run(
        [
            str(compiler),
            "-f",
            "monkey.jungle",
            "-d",
            device,
            "-o",
            "Audit.prg",
            "-y",
            str(key),
            "-w",
        ],
        cwd=project,
        env=dict(os.environ, JAVA_HOME=str(java)),
        capture_output=True,
        text=True,
        timeout=120,
    )
    # Never report compiler argv or key path.
    logs = (result.stdout + result.stderr).replace(str(key), "<signing-key-path>")
    (project / "compiler.log").write_text(logs)
    if result.returncode or "WARNING:" in logs.upper():
        raise RuntimeError(
            f'Compile failed or warned for {device}; see {project / "compiler.log"}.'
        )
    xmls = list((project / "resources").rglob("*.xml"))
    counts = {"bitmap": 0, "font": 0}
    for p in xmls:
        tree = ET.parse(p)
        for e in tree.iter():
            if e.tag in counts:
                counts[e.tag] += 1
    source = (project / "source/DesignerView.mc").read_text()
    return {
        "prg_bytes": (project / "Audit.prg").stat().st_size,
        "font_resources": counts["font"],
        "bitmap_resources": counts["bitmap"],
        "designer_source_bytes": len(source.encode()),
        "generated_asset_file_bytes": sum(
            p.stat().st_size for p in (project / "resources").glob("native-fonts/*")
        )
        + sum(p.stat().st_size for p in (project / "resources").glob("designer/*")),
        "compile_seconds": round(time.monotonic() - started, 3),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="New dedicated output directory; existing paths are refused.",
    )
    parser.add_argument(
        "--device",
        choices=tuple(model.DEVICES),
        action="append",
        help="Device to compile; repeat to select several. Defaults to all supported devices.",
    )
    args = parser.parse_args(argv)
    out = args.out.expanduser().resolve()
    try:
        out.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        parser.error(
            "The output directory already exists; choose a new dedicated directory."
        )
    report = {
        "method": "Compile-only native-font resource storage/tinting comparison. Both variants retain canonical per-glyph layout; native drawText pixel alignment, runtime RAM, CPU and power are unverified.",
        "results": [],
    }
    for device in dict.fromkeys(args.device or model.DEVICES):
        for name, scene in scenes(device).items():
            scenepath = out / device / name
            scenepath.mkdir(parents=True, exist_ok=True)
            (scenepath / "scene.json").write_text(json.dumps(scene, indent=2))
            pack = model.scene_font_pack(scene)
            catalog = exporter._catalogue()
            fonts = {e["font"] for e in scene["elements"]}
            needed = {k: set() for k in fonts}
            pairs = {}
            for e in scene["elements"]:
                codes = exporter._element_codes(e, catalog, False)
                needed[e["font"]].update(codes)
                for colourkey in ("colour", "nightColour"):
                    pairs.setdefault((e["font"], e[colourkey]), set()).update(codes)
            baseline_est = exporter._resource_cost(
                scene, pack, catalog, needed, pairs, False
            )
            for variant in ("glyph-bitmaps", "native-fonts"):
                project = scenepath / variant
                project_for(scene, project)
                if variant == "native-fonts":
                    native_fonts(project, scene)
                result = {
                    "device": device,
                    "scene": name,
                    "variant": variant,
                    **compile_project(project, device),
                }
                if variant == "glyph-bitmaps":
                    result["existing_conservative_vm_guard_estimate"] = baseline_est
                report["results"].append(result)
                (out / "results.json").write_text(json.dumps(report, indent=2))
                print(json.dumps(result), flush=True)
    return report


if __name__ == "__main__":
    main()
