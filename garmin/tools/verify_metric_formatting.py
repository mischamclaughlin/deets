#!/usr/bin/env python3
"""Compile pure metric-formatting tests; optionally run them in Garmin's simulator.

The developer key is passed only by path to monkeyc. Test values are synthetic;
no watch APIs or personal readings are queried by the formatter tests.
"""
import argparse
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile

from bridge import compiler_config, ROOT
from designer_export import prepare_scene_project


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', choices=('epix2pro42mm', 'epix2pro47mm', 'epix2pro51mm'), default='epix2pro47mm')
    parser.add_argument('--run', action='store_true', help='Run the compiled tests; the Garmin simulator must already be open.')
    args = parser.parse_args()
    compiler, key, java, available = compiler_config()
    if not available:
        raise SystemExit('Garmin SDK, Java 17 or signing-key path is unavailable.')
    with tempfile.TemporaryDirectory(prefix='deets-metric-unit-') as directory:
        project = Path(directory)
        for name in ('manifest.xml', 'monkey.jungle'):
            shutil.copy2(ROOT / name, project / name)
        for name in ('source', 'resources'):
            shutil.copytree(ROOT / name, project / name)
        scene = dict(version=2, name='Metric formatter tests', device=args.device,
                     background=0, edgeInset=16, elements=[])
        prepare_scene_project(project, scene)
        shutil.copy2(Path(__file__).parent / 'fixtures/DesignerMetricFormattingTests.mc', project / 'source/DesignerMetricFormattingTests.mc')
        output = project / 'MetricFormattingTests.prg'
        result = subprocess.run([str(compiler), '-f', 'monkey.jungle', '-d', args.device,
            '-o', str(output), '-y', str(key), '--unit-test', '-w'], cwd=project,
            env=dict(os.environ, JAVA_HOME=str(java)), capture_output=True, text=True, timeout=120)
        if result.returncode or 'WARNING:' in (result.stdout + result.stderr).upper() or not output.exists():
            print(result.stdout)
            print(result.stderr)
            raise SystemExit('Metric unit-test compilation failed or produced warnings.')
        print('Metric formatter unit-test build passed:', args.device, flush=True)
        if args.run:
            result = subprocess.run([str(compiler.parent / 'monkeydo'), str(output), args.device, '-t'],
                cwd=project, env=dict(os.environ, JAVA_HOME=str(java)), capture_output=True, text=True, timeout=60)
            print(result.stdout)
            print(result.stderr, end="")
            # Some SDK launchers return a non-zero status even when every test passes.
            # Require the runner's complete successful summary, never just a zero exit.
            passed = re.search(r"^PASSED \(passed=([1-9]\d*), failed=0, errors=0\)$", result.stdout, re.MULTILINE)
            raise SystemExit(0 if passed else 1)


if __name__ == '__main__':
    main()
