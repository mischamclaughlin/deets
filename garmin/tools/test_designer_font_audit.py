"""Experimental font comparisons must stay isolated and preserve their inputs."""

from contextlib import redirect_stderr
import io
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

import audit_font_rendering as audit
import designer_model as model
import designer_typography as typography


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

    def test_native_adapter_requires_isolated_project_marker(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            sentinel = path / "keep.txt"
            sentinel.write_text("existing work")
            with self.assertRaisesRegex(ValueError, "fresh audit project"):
                audit.native_fonts(path, {})
            self.assertEqual(sentinel.read_text(), "existing work")

    def test_native_resources_share_colours_and_preserve_canonical_glyph_coordinates(
        self,
    ):
        scene = audit.scenes("epix2pro47mm")["mixed"]
        before = json.dumps(scene, sort_keys=True)
        pack = model.scene_font_pack(scene)
        fonts = sorted({element["font"] for element in scene["elements"]})
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary) / "project"
            audit.project_for(scene, project)
            original_manifest = ET.parse(project / "manifest.xml")
            tag = "{http://www.garmin.com/xml/connectiq}application"
            original_id = original_manifest.find(tag).get("id")
            audit.native_fonts(project, scene)
            self.assertNotEqual(
                ET.parse(project / "manifest.xml").find(tag).get("id"), original_id
            )
            resources = ET.parse(project / "resources/audit-fonts.xml").getroot()
            self.assertEqual(len(resources.findall("font")), len(fonts))
            self.assertFalse((project / "resources/designer.xml").exists())
            self.assertFalse((project / "resources/designer").exists())
            for index, key in enumerate(fonts):
                descriptor = (
                    project / f"resources/native-fonts/font{index}.fnt"
                ).read_text()
                for line in descriptor.splitlines():
                    if not line.startswith("char id="):
                        continue
                    fields = {
                        name: int(value)
                        for name, value in re.findall(r"(\w+)=(-?\d+)", line)
                    }
                    expected = pack["fonts"][key]["glyphs"][str(fields["id"])]
                    for field in ("x", "y", "width", "height", "xadvance"):
                        self.assertEqual(fields[field], expected[field])
                    self.assertEqual(fields["yoffset"], 0)
            source = (project / "source/DesignerView.mc").read_text()
            self.assertIn("dc.drawText(operation[0], operation[1], nativeFont,", source)
            self.assertIn(
                "dc.setColor(night ? element[7] : element[6], Graphics.COLOR_TRANSPARENT)",
                source,
            )
            self.assertNotIn("Rez.Drawables.DesignerGlyph", source)
        self.assertEqual(json.dumps(scene, sort_keys=True), before)

    def test_blank_space_keeps_its_advance_without_a_zero_area_native_glyph(self):
        scene = typography.add_date(audit.base("epix2pro47mm"))
        scene = typography.set_date_source(scene, "date", "date")
        element = scene["elements"][0]
        font = model.scene_font_pack(scene)["fonts"][element["font"]]
        self.assertEqual(font["glyphs"]["32"]["width"], 0)
        self.assertGreater(font["glyphs"]["32"]["xadvance"], 0)
        unbounded = {**element, "x": 0, "y": 0, "width": 500, "align": "left"}
        operations = model.layout_text("M M", unbounded, font)
        self.assertEqual(len(operations), 2)
        self.assertEqual(
            operations[1]["x"],
            font["glyphs"]["77"]["xadvance"] + font["glyphs"]["32"]["xadvance"],
        )
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary) / "project"
            audit.project_for(scene, project)
            audit.native_fonts(project, scene)
            descriptor = (project / "resources/native-fonts/font0.fnt").read_text()
            codes = []
            for line in descriptor.splitlines():
                if not line.startswith("char id="):
                    continue
                fields = {
                    name: int(value)
                    for name, value in re.findall(r"(\w+)=(-?\d+)", line)
                }
                codes.append(fields["id"])
                self.assertGreater(fields["width"] * fields["height"], 0)
            self.assertNotIn(32, codes)
            self.assertIn(77, codes)


if __name__ == "__main__":
    unittest.main()
