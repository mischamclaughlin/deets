"""Editable PRG metadata must remain separate from native rendering inputs."""
import base64
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zlib

import designer_document as document
from designer_export import prepare_scene_project
from designer_model import ROOT, font_pack, validate_scene


class DesignerDocumentTests(unittest.TestCase):
    def scene(self):
        height = font_pack("epix2pro47mm")["fonts"]["time"]["height"]
        return validate_scene({
            "version": 2, "name": "Éditable watch", "device": "epix2pro47mm", "background": 0,
            "elements": [{"id": "time1", "source": "time", "font": "time", "x": 28,
                          "y": 160, "width": 360, "height": height, "align": "centre",
                          "colour": 0x4D9DE0, "nightColour": 0x8D99AE, "visible": "both"}],
        })

    def read_document(self, project):
        root = ET.parse(project / "resources/deets_editable.xml").getroot()
        resources = root.findall("string")
        self.assertEqual(len(resources), 1)
        self.assertEqual(resources[0].attrib, {"id": "DeetsEditableDesign"})
        envelope = resources[0].text
        self.assertTrue(envelope.startswith(document.START))
        self.assertTrue(envelope.endswith(document.END))
        payload = envelope[len(document.START):-len(document.END)]
        return json.loads(zlib.decompress(base64.b64decode(payload, validate=True)).decode("utf-8"))

    def test_metadata_round_trips_scene_and_browser_grid_without_mutating_inputs(self):
        scene = self.scene()
        grid = {"visible": True, "rows": 3, "edits": {"rows-1": .25}, "gaps": {"rows-1": 12}}
        original = copy.deepcopy((scene, grid))
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "resources").mkdir()
            document.write_editable_document(project, scene, grid)
            self.assertEqual(self.read_document(project), {
                "format": "deets", "version": 1, "scene": scene, "grid": grid,
            })
        self.assertEqual((scene, grid), original)

    def test_scene_only_exports_explicitly_omit_unspecified_grid(self):
        scene = self.scene()
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "resources").mkdir()
            document.write_editable_document(project, scene)
            restored = self.read_document(project)
            self.assertEqual(restored["scene"], scene)
            self.assertNotIn("grid", restored)

    def test_adding_metadata_preserves_every_generated_source_font_and_manifest_byte(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            for filename in ("manifest.xml", "monkey.jungle"):
                shutil.copy2(ROOT / filename, project / filename)
            for dirname in ("source", "resources"):
                shutil.copytree(ROOT / dirname, project / dirname)
            scene = self.scene()
            prepare_scene_project(project, scene)
            before = {path.relative_to(project): path.read_bytes() for path in project.rglob("*") if path.is_file()}
            document.write_editable_document(project, scene, {"visible": False})
            after = {path.relative_to(project): path.read_bytes() for path in project.rglob("*") if path.is_file()}
            self.assertEqual(set(after) - set(before), {Path("resources/deets_editable.xml")})
            for path, content in before.items():
                self.assertEqual(after[path], content, str(path))
            for path in (project / "source").rglob("*.mc"):
                self.assertNotIn("DeetsEditableDesign", path.read_text())

    def test_invalid_grid_and_oversized_or_nonfinite_documents_are_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            (project / "resources").mkdir()
            scene = self.scene()
            for grid in ([], True, "invalid"):
                with self.subTest(grid=grid), self.assertRaises(ValueError):
                    document.write_editable_document(project, scene, grid)
            oversized = {**scene, "name": "é" * (document.MAX_DOCUMENT_BYTES // 2)}
            with self.assertRaisesRegex(ValueError, "1 MB"):
                document.write_editable_document(project, oversized)
            with self.assertRaises(ValueError):
                document.write_editable_document(project, {**scene, "background": float("nan")})
            self.assertFalse((project / "resources/deets_editable.xml").exists())


if __name__ == "__main__":
    unittest.main()
