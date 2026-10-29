"""Recognise simulator test results without confusing SDK exit codes with passes."""

from contextlib import redirect_stderr
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit_font_runtime as audit


class RuntimeAuditTests(unittest.TestCase):
    def test_explicit_passing_summary_is_required_even_when_metrics_exist(self):
        metrics = "AUDIT " + " ".join(field + "=123" for field in audit.FIELDS)
        passed = audit.parse_result(metrics + "\nPASSED (passed=1, failed=0, errors=0)\n", 1)
        self.assertTrue(passed["passed"])
        self.assertEqual(passed["runner_exit_code"], 1)
        self.assertEqual(passed["metrics"]["afterFrameMax"], 123)
        for output in (metrics, metrics + "\nFAILED (passed=0, failed=0, errors=1)",
                       "PASSED (passed=1, failed=0, errors=0)"):
            self.assertFalse(audit.parse_result(output, 0)["passed"])

    def test_existing_output_is_preserved_without_contacting_the_simulator(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            sentinel = path / "keep.txt"
            sentinel.write_text("existing work")
            with patch.object(audit, "run_project", side_effect=AssertionError("Simulator contacted")):
                with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                    audit.main(["--out", str(path)])
            self.assertEqual(sentinel.read_text(), "existing work")


if __name__ == "__main__":
    unittest.main()
