"""Editable typography remains a shared, exact native-pixel asset."""
import copy
import hashlib
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import bridge
import designer_model as model
import designer_typography as typography
import designer_export as exporter

SETTINGS = {"family": "time", "size": 70, "thickness": 0, "width": 100, "letterSpacing": 1}


class TypographyTests(unittest.TestCase):
    def scene(self):
        return {"version": 2, "name": "Typography", "device": "epix2pro47mm", "background": 0, "edgeInset": 16,
            "elements": [{"id": "clock", "source": "time", "font": "time", "x": 88, "y": 164,
                "width": 240, "height": 88, "align": "centre", "colour": 0xdceccf, "nightColour": 0x8d99ae, "visible": "both"}]}

    def test_settings_are_bounded_and_cannot_reference_paths(self):
        for change in ({"family": "/tmp/font.ttf"}, {"family": "upload:../../outside"}, {"size": True},
                       {"size": 161}, {"thickness": 7}, {"width": 201}, {"letterSpacing": -5}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                typography.settings({**SETTINGS, **change})
        with self.assertRaises(ValueError):
            typography.load("generated:../../outside", "epix2pro47mm")

    def test_typography_keeps_centre_and_native_bounds_without_mutating_scene(self):
        original = self.scene()
        before = copy.deepcopy(original)
        changed = typography.apply(original, "clock", SETTINGS)
        self.assertEqual(original, before)
        self.assertEqual(changed, model.validate_scene(changed))
        clock = changed["elements"][0]
        self.assertLessEqual(abs(clock["x"] + clock["width"]/2 - 208), 0.5)
        self.assertEqual(clock["y"] + clock["height"]/2, 208)
        self.assertEqual(clock["height"], 70)
        layout = bridge.layout({"scene": changed})
        self.assertEqual(len(layout["ops"]), 5)
        self.assertIn(clock["font"], layout["assets"])
        self.assertEqual(clock["typography"], SETTINGS)
        self.assertNotEqual(bridge.mapping(original), layout["mapping"])

    def test_width_thickness_tracking_and_font_selection_change_exact_assets(self):
        key, record = typography.generate("epix2pro47mm", SETTINGS)
        for change in ({"width": 125}, {"thickness": 1}, {"letterSpacing": 5}, {"family": "widget"}, {"size": 100}):
            with self.subTest(change=change):
                changed_key, changed = typography.generate("epix2pro47mm", {**SETTINGS, **change})
                self.assertNotEqual(key, changed_key)
                if "letterSpacing" not in change:
                    self.assertNotEqual(record["image"], changed["image"])
                if "width" in change:
                    self.assertGreater(changed["font"]["glyphs"]["48"]["width"], record["font"]["glyphs"]["48"]["width"])
                glyph = changed["font"]["glyphs"]["48"]
                self.assertEqual(glyph["xadvance"], glyph["width"] + change.get("letterSpacing", 1))
        self.assertEqual(typography.generate("epix2pro47mm", SETTINGS)[0], key)

    def test_negative_tracking_keeps_every_valid_time_unclipped(self):
        scene = typography.apply(self.scene(), "clock", {**SETTINGS, "letterSpacing": -4})
        clock = scene["elements"][0]
        font = model.scene_font_pack(scene)["fonts"][clock["font"]]
        for hour in range(24):
            for minute in range(60):
                text = f"{hour:02d}:{minute:02d}"
                operations = model.layout_text(text, clock, font)
                self.assertEqual([operation["width"] for operation in operations],
                    [font["glyphs"][str(ord(char))]["width"] for char in text])

    def test_rejects_non_fitting_typography_and_mismatched_metadata(self):
        with self.assertRaisesRegex(ValueError, "does not fit"):
            typography.apply(self.scene(), "clock", {**SETTINGS, "size": 160, "width": 200})
        changed = typography.apply(self.scene(), "clock", SETTINGS)
        changed["elements"][0]["typography"]["size"] = 72
        with self.assertRaisesRegex(ValueError, "do not match"):
            model.validate_scene(changed)

    def test_generated_asset_content_is_verified_and_device_specific(self):
        key, _ = typography.generate("epix2pro47mm", SETTINGS)
        with self.assertRaisesRegex(ValueError, "selected watch"):
            typography.load(key, "epix2pro42mm")
        with tempfile.TemporaryDirectory() as directory, patch.object(typography, "CACHE", Path(directory)):
            path = Path(directory) / (key.split(":")[1] + ".json")
            path.write_text("{}")
            with self.assertRaisesRegex(ValueError, "changed"):
                typography.load(key, "epix2pro47mm")

    def test_generated_fonts_are_used_in_temporary_export(self):
        scene = typography.apply(self.scene(), "clock", SETTINGS)
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            shutil.copytree(model.ROOT / "source", project / "source")
            shutil.copytree(model.ROOT / "resources", project / "resources")
            shutil.copy2(model.ROOT / "manifest.xml", project / "manifest.xml")
            exporter.prepare_scene_project(project, scene)
            paths = list((project / "resources/designer").glob("glyph-generated-*.png"))
            self.assertTrue(paths)
            self.assertNotIn("generated:", paths[0].name)
            source = (project / "source/DesignerView.mc").read_text()
            self.assertIn("advance + glyph[2]", source)

    def test_uploaded_font_generates_bounded_local_assets(self):
        path = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
        if not path.is_file():
            self.skipTest("No system TTF fixture is available.")
        data = path.read_bytes()
        identity = hashlib.sha256(data).hexdigest()
        with tempfile.TemporaryDirectory() as directory, patch.object(typography, "CACHE", Path(directory)):
            (Path(directory) / f"{identity}.font").write_bytes(data)
            settings = {**SETTINGS, "family": f"upload:{identity}", "size": 50}
            key, record = typography.generate("epix2pro47mm", settings)
            self.assertEqual(record["font"]["height"], 50)
            self.assertEqual(set(record["font"]["glyphs"]), {str(ord(c)) for c in typography.CODES})
            self.assertEqual(typography.load(key, "epix2pro47mm")["font"], record["font"])
            (Path(directory) / f"{identity}.font").write_bytes(b"OTTOinvalid")
            with self.assertRaisesRegex(ValueError, "invalid or has changed"):
                typography.generate("epix2pro47mm", settings)
