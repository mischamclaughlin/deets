"""Recognise simulator test results without confusing SDK exit codes with passes."""

from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit_font_runtime as audit


class RuntimeAuditTests(unittest.TestCase):
    def test_explicit_passing_summary_is_required_even_when_metrics_exist(self):
        metrics = "AUDIT " + " ".join(field + "=123" for field in audit.FIELDS)
        passed = audit.parse_result(
            metrics + "\nPASSED (passed=1, failed=0, errors=0)\n", 1
        )
        self.assertTrue(passed["passed"])
        self.assertEqual(passed["runner_exit_code"], 1)
        self.assertEqual(passed["metrics"]["afterFrameMax"], 123)
        for output in (
            metrics,
            metrics + "\nFAILED (passed=0, failed=0, errors=1)",
            "PASSED (passed=1, failed=0, errors=0)",
        ):
            self.assertFalse(audit.parse_result(output, 0)["passed"])

    def test_existing_output_is_preserved_without_contacting_the_simulator(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            sentinel = path / "keep.txt"
            sentinel.write_text("existing work")
            with patch.object(
                audit, "run_project", side_effect=AssertionError("Simulator contacted")
            ):
                with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                    audit.main(["--out", str(path)])
            self.assertEqual(sentinel.read_text(), "existing work")

    def test_runtime_audit_exercises_production_without_a_prototype_transform(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary) / "audit"
            scene = audit.rendering.base("epix2pro47mm")
            result = {"passed": True, "runner_exit_code": 1, "metrics": {}}
            with patch.object(
                audit.rendering, "scenes", return_value={"empty": scene}
            ), patch.object(
                audit, "run_project", return_value=result
            ) as run_project, redirect_stdout(
                io.StringIO()
            ):
                report = audit.main(["--out", str(out)])
            self.assertEqual(run_project.call_count, 1)
            self.assertEqual(
                [row["variant"] for row in report["runs"]], ["native-fonts"]
            )
            self.assertEqual(json.loads((out / "results.json").read_text()), report)
            source = (out / "empty/native-fonts/source/DesignerView.mc").read_text()
            self.assertIn("function auditSample", source)
            self.assertNotIn("AuditFont", source)


if __name__ == "__main__":
    unittest.main()
