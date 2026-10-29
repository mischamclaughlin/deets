"""Exercise the production native-font renderer through CLI simulator tests without reading pixels.

Start the Connect IQ simulator first. These instrumented tests measure application
heap snapshots after frames, including test overhead. They do not measure graphics
pool usage, within-frame peaks, hardware execution budgets or battery consumption.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

import audit_font_rendering as rendering
import bridge
import designer_model as model

FRAMES = 24
SAMPLE_METHOD = '''    function auditSample(index as Number, night as Boolean) {
        _forcedNight = night;
        _proof = true;
        _samples["time"] = (index % 24).format("%02d") + ":" + ((index * 7) % 60).format("%02d");
        _samples["weekday"] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][index % 7];
        _samples["numericDate"] = ((index % 31) + 1).format("%02d") + "/" + ((index % 12) + 1).format("%02d") + "/" + (index % 100).format("%02d");
    }
'''
TEST_SOURCE = '''using Toybox.Graphics;
using Toybox.System;
(:test)
function resourceAudit(logger) {
    var buffer = Graphics.createBufferedBitmap({:width => @SIZE@, :height => @SIZE@});
    var bitmap = buffer.get();
    var dc = bitmap.getDc();
    var before = System.getSystemStats().usedMemory;
    var view = new DesignerView();
    var initialised = System.getSystemStats().usedMemory;
    view.auditSample(0, false);
    view.onUpdate(dc);
    var first = System.getSystemStats().usedMemory;
    var sampledMax = first;
    var start = System.getTimer();
    for (var i = 0; i < @FRAMES@; i += 1) {
        view.auditSample(i, false);
        view.onUpdate(dc);
        var used = System.getSystemStats().usedMemory;
        if (used > sampledMax) { sampledMax = used; }
    }
    var dayTime = System.getTimer() - start;
    var day = System.getSystemStats().usedMemory;
    view.auditSample(0, true);
    view.onUpdate(dc);
    var nightFirst = System.getSystemStats().usedMemory;
    start = System.getTimer();
    for (var j = 0; j < @FRAMES@; j += 1) {
        view.auditSample(j, true);
        view.onUpdate(dc);
        var nightUsed = System.getSystemStats().usedMemory;
        if (nightUsed > sampledMax) { sampledMax = nightUsed; }
    }
    var nightTime = System.getTimer() - start;
    var night = System.getSystemStats().usedMemory;
    logger.debug("AUDIT before=" + before + " initialised=" + initialised + " first=" + first + " day=" + day + " nightFirst=" + nightFirst + " night=" + night + " afterFrameMax=" + sampledMax + " dayElapsedMs=" + dayTime + " nightElapsedMs=" + nightTime);
    return true;
}
'''
FIELDS = ("before", "initialised", "first", "day", "nightFirst", "night",
          "afterFrameMax", "dayElapsedMs", "nightElapsedMs")


def parse_result(output, exit_code):
    """The SDK runner may return 1 for a passing test; require its test summary."""
    metrics = re.search("AUDIT " + " ".join(field + r"=(\d+)" for field in FIELDS), output)
    passed = bool(metrics and re.search(r"^PASSED \(passed=1, failed=0, errors=0\)$", output, re.MULTILINE))
    return {"passed": passed, "runner_exit_code": exit_code,
            "metrics": dict(zip(FIELDS, map(int, metrics.groups()))) if metrics else None}


def instrument(project, device):
    path = project / "source/DesignerView.mc"
    source = path.read_text()
    marker = "    function onShow()"
    if source.count(marker) != 1:
        raise ValueError("The generated view no longer matches the audit instrumentation.")
    path.write_text(source.replace(marker, SAMPLE_METHOD + "\n" + marker, 1))
    (project / "source/AuditTest.mc").write_text(TEST_SOURCE.replace("@SIZE@", str(model.DEVICES[device])).replace("@FRAMES@", str(FRAMES)))
    manifest_path = project / "manifest.xml"
    manifest = ET.parse(manifest_path)
    app = manifest.find("{http://www.garmin.com/xml/connectiq}application")
    app.set("id", hashlib.md5((app.get("id") + "runtime-audit-v1" + hashlib.sha256((SAMPLE_METHOD + TEST_SOURCE).encode()).hexdigest()).encode(), usedforsecurity=False).hexdigest())
    manifest.write(manifest_path, encoding="utf-8", xml_declaration=True)


def run_project(project, device):
    compiler, key, java, available = bridge.compiler_config()
    if not available:
        raise RuntimeError("The local Garmin compiler is unavailable.")
    environment = dict(os.environ, JAVA_HOME=str(java), PATH=str(java / "bin") + os.pathsep + os.environ.get("PATH", ""))
    compiled = subprocess.run([str(compiler), "-f", "monkey.jungle", "-d", device,
                               "-o", "Runtime.prg", "-y", str(key), "-w", "-t"],
                              cwd=project, env=environment, capture_output=True, text=True, timeout=120)
    diagnostic = (compiled.stdout + compiled.stderr).replace(str(key), "<signing-key-path>")
    (project / "runtime-compiler.log").write_text(diagnostic)
    if compiled.returncode or "WARNING:" in diagnostic.upper():
        raise RuntimeError(f"Runtime audit compilation failed or warned; see {project / 'runtime-compiler.log'}.")
    try:
        run = subprocess.run([str(compiler.parent / "monkeydo"), str(project / "Runtime.prg"), device,
                              "-t", "resourceAudit"], env=environment, capture_output=True, text=True, timeout=45)
    except subprocess.TimeoutExpired as error:
        partial = (error.stdout or b"") + (error.stderr or b"")
        if isinstance(partial, bytes):
            partial = partial.decode(errors="replace")
        (project / "runtime.log").write_text(partial.replace(str(key), "<signing-key-path>"))
        return {"passed": False, "runner_exit_code": None, "metrics": None,
                "error": "Simulator runner timed out after 45 seconds.", "runtime_log": str(project / "runtime.log")}
    output = (run.stdout + run.stderr).replace(str(key), "<signing-key-path>")
    (project / "runtime.log").write_text(output)
    return {**parse_result(output, run.returncode), "runtime_log": str(project / "runtime.log")}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path, help="Fresh dedicated output directory.")
    parser.add_argument("--device", choices=tuple(model.DEVICES), default="epix2pro47mm")
    args = parser.parse_args(argv)
    out = args.out.expanduser().resolve()
    try:
        out.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        parser.error("The output directory already exists; choose a fresh dedicated directory.")
    report = {"method": __doc__, "device": args.device, "frames_per_mode": FRAMES, "runs": []}
    for name, scene in rendering.scenes(args.device).items():
        project = out / name / "native-fonts"
        rendering.project_for(scene, project)
        instrument(project, args.device)
        result = {"scene": name, "variant": "native-fonts", **run_project(project, args.device)}
        report["runs"].append(result)
        (out / "results.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(result), flush=True)
        if not result["passed"]:
            raise RuntimeError(f"Simulator audit failed; see {project / 'runtime.log'}.")
    return report


if __name__ == "__main__":
    main()
