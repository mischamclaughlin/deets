"""Capture must identify a new completed native frame before reading pixels."""
import base64
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import prepare_export_capture as capture

MARKER = "DEETS_CAPTURE_READY:01234567-89ab-cdef-0123-456789abcdef"


class ExportCaptureTests(unittest.TestCase):
    def test_wrapper_logs_only_after_unchanged_draw_body_returns(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "source").mkdir()
            path = project / "source/DesignerView.mc"
            body = "        dc.clear();\n        drawTextElement(dc);\n    }\n"
            path.write_text("class DesignerView {\n    function onUpdate(dc) {\n" + body + "}\n")
            capture.instrument(project, MARKER)
            result = path.read_text()
            self.assertIn("    function renderExportFrame(dc) {\n" + body, result)
            self.assertIn(f'renderExportFrame(dc);\n        System.println("{MARKER}");', result)
            self.assertEqual(result.count("function onUpdate(dc)"), 1)

    def test_source_drift_or_unsafe_marker_is_rejected_without_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "source").mkdir()
            path = project / "source/DesignerView.mc"
            source = "class ChangedView {}"
            path.write_text(source)
            for marker in (MARKER, 'DEETS_CAPTURE_READY:"injected"'):
                with self.assertRaises(ValueError):
                    capture.instrument(project, marker)
                self.assertEqual(path.read_text(), source)

    def test_live_exports_cannot_be_instrumented(self):
        with patch.object(capture.bridge, "compile_scene") as compile_scene:
            with self.assertRaisesRegex(ValueError, "proof"):
                capture.prepare({"proof": False}, "/unused.prg", MARKER)
            compile_scene.assert_not_called()

    def test_production_compile_is_used_and_output_is_exclusive(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "proof.prg"
            payload = {"proof": True, "scene": {}, "mapping": "mapping-token"}
            original = capture.bridge.prepare_scene_project
            with patch.object(capture.bridge, "compile_scene", return_value={
                "application": base64.b64encode(b"compiled").decode(),
            }) as compile_scene:
                capture.prepare(payload, output, MARKER)
                compile_scene.assert_called_once_with(payload)
                self.assertEqual(output.read_bytes(), b"compiled")
                with self.assertRaises(FileExistsError):
                    capture.prepare(payload, output, MARKER)
            self.assertIs(capture.bridge.prepare_scene_project, original)
            self.assertEqual(output.read_bytes(), b"compiled")


if __name__ == "__main__":
    unittest.main()
