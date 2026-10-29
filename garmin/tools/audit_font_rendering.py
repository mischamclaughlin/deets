"""Compile the production native-font exporter on representative watch scenes.

This audits current production output, not the retired coloured-glyph prototype.
Historical comparison results remain historical evidence. No simulator pixels or
runtime-memory measures are taken by this compile-only tool.
"""

import argparse
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
            p.stat().st_size for p in (project / "resources").glob("designer-fonts/*")
        ),
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
        "method": __doc__,
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
            resource_estimate = exporter._resource_cost(
                scene, pack, catalog, needed, pairs, False
            )
            project = scenepath / "native-fonts"
            project_for(scene, project)
            result = {
                "device": device,
                "scene": name,
                "variant": "native-fonts",
                **compile_project(project, device),
                "conservative_resource_guard_estimate": resource_estimate,
            }
            report["results"].append(result)
            (out / "results.json").write_text(json.dumps(report, indent=2))
            print(json.dumps(result), flush=True)
    return report


if __name__ == "__main__":
    main()
