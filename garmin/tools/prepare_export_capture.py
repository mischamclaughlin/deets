"""Compile through the production bridge with a test-only frame-ready message.

Drawing uses the unchanged generated renderer. A wrapper logs a per-run nonce
after onUpdate returns, so an old simulator screen cannot satisfy capture.
Only isolated fixed-frame proof projects may be instrumented.
"""
import base64
import json
from pathlib import Path
import re
import sys
from unittest.mock import patch

import bridge


def instrument(project, marker):
    if not re.fullmatch(r"DEETS_CAPTURE_READY:[a-f0-9-]{36}", marker):
        raise ValueError("A unique capture marker is required.")
    path = project / "source/DesignerView.mc"
    source = path.read_text()
    target = "    function onUpdate(dc) {"
    if source.count(target) != 1:
        raise ValueError("The generated view no longer matches the capture instrumentation.")
    wrapper = ("    function onUpdate(dc) {\n"
               "        renderExportFrame(dc);\n"
               f'        System.println("{marker}");\n'
               "    }\n\n")
    path.write_text(source.replace(target, wrapper + "    function renderExportFrame(dc) {", 1))


def prepare(payload, output, marker):
    if payload.get("proof") is not True:
        raise ValueError("Capture instrumentation requires a fixed-frame proof export.")
    original = bridge.prepare_scene_project

    def prepare_project(project, scene, **options):
        result = original(project, scene, **options)
        instrument(project, marker)
        return result

    # The hook exists only in this testing process, never in the HTTP bridge.
    with patch.object(bridge, "prepare_scene_project", prepare_project):
        result = bridge.compile_scene(payload)
    with Path(output).open("xb") as destination:
        destination.write(base64.b64decode(result["application"], validate=True))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Use prepare_export_capture.py <new-output.prg> <capture-marker> with a bridge payload on stdin.")
    try:
        prepare(json.load(sys.stdin), sys.argv[1], sys.argv[2])
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Proof capture compilation failed: {error}", file=sys.stderr)
        raise SystemExit(2)
