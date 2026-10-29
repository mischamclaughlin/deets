"""Production font audits stay isolated and do not mislabel duplicate backends."""

from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit_font_rendering as audit


class FontAuditTests(unittest.TestCase):
    def test_existing_output_is_refused_before_compiler_or_scene_work(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            sentinel = path / "keep.txt"
            sentinel.write_text("existing work")
            with patch.object(
                audit, "scenes", side_effect=AssertionError("Scene work started")
            ):
                with redirect_stderr(io.StringIO()) as diagnostic:
                    with self.assertRaises(SystemExit) as failure:
                        audit.main(["--out", str(path)])
                self.assertIn("already exists", diagnostic.getvalue())
            self.assertEqual(failure.exception.code, 2)
            self.assertEqual(sentinel.read_text(), "existing work")
            with self.assertRaises(FileExistsError):
                audit.project_for({}, path)
            self.assertEqual(sentinel.read_text(), "existing work")

    def test_current_audit_reports_only_the_production_backend(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary) / "audit"
            scene = audit.base("epix2pro47mm")
            with patch.object(
                audit, "scenes", return_value={"empty": scene}
            ), patch.object(
                audit, "compile_project", return_value={"prg_bytes": 100}
            ) as compile_project, redirect_stdout(
                io.StringIO()
            ):
                report = audit.main(["--out", str(out), "--device", "epix2pro47mm"])
            self.assertEqual(compile_project.call_count, 1)
            self.assertEqual(
                [row["variant"] for row in report["results"]], ["native-fonts"]
            )
            self.assertEqual(json.loads((out / "results.json").read_text()), report)
            project = out / "epix2pro47mm/empty/native-fonts"
            self.assertTrue((project / "resources/designer-fonts.xml").is_file())
            self.assertFalse((project / "resources/designer.xml").exists())


if __name__ == "__main__":
    unittest.main()
