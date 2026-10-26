"""Checks the designer's native project generation and shared pixel contracts."""

import copy
import json
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
from pathlib import Path

import designer_export as exporter
from designer_charts import chart_ops, ring_positions
from designer_model import ROOT, font_pack, validate_scene, layout_text


class DesignerExportTests(unittest.TestCase):
    def scene(self):
        height = font_pack("epix2pro47mm")["fonts"]["time"]["height"]
        return validate_scene({
            "version": 2, "name": "Exact layout", "device": "epix2pro47mm", "background": 0,
            "elements": [{"id": "time1", "source": "time", "font": "time", "x": 28,
                          "y": 160, "width": 360, "height": height, "align": "centre",
                          "colour": 0x4D9DE0, "nightColour": 0x8D99AE, "visible": "both"}],
        })

    def project(self, directory):
        project = Path(directory)
        (project / "source").mkdir()
        (project / "resources").mkdir()
        shutil.copy2(ROOT / "manifest.xml", project / "manifest.xml")
        shutil.copy2(ROOT / "source/EpixCanvasApp.mc", project / "source/EpixCanvasApp.mc")
        shutil.copy2(ROOT / "source/EpixCanvasComplications.mc", project / "source/EpixCanvasComplications.mc")
        return project

    def test_generated_atlas_and_metrics_are_the_shared_native_pixels(self):
        scene = self.scene()
        pack = font_pack(scene["device"])
        with tempfile.TemporaryDirectory() as temporary:
            project = self.project(temporary)
            exporter.prepare_scene_project(project, scene)
            glyph = pack["fonts"]["time"]["glyphs"]["48"]
            packed = (project / "resources/designer/glyph-time-4d9de0-48.png").read_bytes()
            original_pixels = subprocess.check_output(["magick", "png:-", "-depth", "8", "rgba:-"], input=pack["images"]["time"])
            exported_pixels = subprocess.check_output(["magick", "png:-", "-depth", "8", "rgba:-"], input=packed)
            atlas_width = pack["fonts"]["time"]["atlasWidth"]
            expected_alpha = bytes(original_pixels[((glyph["y"] + y) * atlas_width + glyph["x"] + x) * 4 + 3]
                                   for y in range(glyph["height"]) for x in range(glyph["width"]))
            self.assertEqual(expected_alpha, exported_pixels[3::4])
            for index in range(0, len(exported_pixels), 4):
                if exported_pixels[index + 3]:
                    self.assertEqual(exported_pixels[index:index + 3], bytes((0x4d, 0x9d, 0xe0)))
            source = (project / "source/DesignerView.mc").read_text()
            glyph = pack["fonts"]["time"]["glyphs"]["48"]
            expected = [glyph[k] for k in ("x", "y", "width", "height", "yoffset", "xadvance")]
            self.assertIn("48 => " + exporter._mc(expected), source)
            self.assertIn("Math.floor((element[4] - total) / 2.0).toNumber()", source)
            self.assertIn("dc.drawBitmap(operation[0], operation[1], _bitmaps[resource])", source)
            self.assertIn("dc.setClip(element[2], element[3], element[4]", source)
            self.assertNotIn("dc.drawText", source)
            self.assertNotIn("@", source)
            self.assertEqual(len(ET.parse(project / "resources/designer.xml").findall("bitmap")), 22)
            self.assertNotIn(":tintColor", source)
            self.assertEqual(ET.parse(project / "resources/designer_strings.xml").find("string").text, scene["name"])

    def test_generated_app_and_provider_preserve_original_sources(self):
        scene = self.scene()
        original_app = (ROOT / "source/EpixCanvasApp.mc").read_bytes()
        original_provider = (ROOT / "source/EpixCanvasComplications.mc").read_bytes()
        with tempfile.TemporaryDirectory() as temporary:
            project = self.project(temporary)
            exporter.prepare_scene_project(project, scene)
            self.assertIn("new DesignerView()", (project / "source/EpixCanvasApp.mc").read_text())
            provider = (project / "source/EpixCanvasComplications.mc").read_text()
            self.assertIn("function designerConfigure()", provider)
            self.assertIn("_slotTypes = [];", provider)
        self.assertEqual(original_app, (ROOT / "source/EpixCanvasApp.mc").read_bytes())
        self.assertEqual(original_provider, (ROOT / "source/EpixCanvasComplications.mc").read_bytes())

    def test_every_layout_change_affects_the_export_application_identity(self):
        original = self.scene()
        identity = exporter.scene_application_id(original)
        self.assertEqual(identity, exporter.scene_application_id(json.loads(json.dumps(original))))
        for change in (lambda s: s["elements"][0].update(x=29),
                       lambda s: s["elements"][0].update(colour=0xFF4D67),
                       lambda s: s["elements"][0].update(align="right")):
            scene = copy.deepcopy(original)
            change(scene)
            self.assertNotEqual(identity, exporter.scene_application_id(scene))
        self.assertNotEqual(identity, exporter.scene_application_id(original, proof=True))
        self.assertNotEqual(identity, exporter.scene_application_id(original, preview_night=True))

    def test_renderer_and_font_changes_invalidate_the_application_identity(self):
        scene = self.scene()
        identity = exporter.scene_application_id(scene)
        with patch.object(exporter, "_renderer_fingerprint", return_value="new-renderer"):
            self.assertNotEqual(identity, exporter.scene_application_id(scene))
        pack = copy.deepcopy(font_pack(scene["device"]))
        pack["images"]["time"] += b"changed-mask"
        with patch.object(exporter, "font_pack", return_value=pack):
            self.assertNotEqual(identity, exporter.scene_application_id(scene))
        pack = copy.deepcopy(font_pack(scene["device"]))
        pack["fonts"]["time"]["glyphs"]["48"]["xadvance"] += 1
        with patch.object(exporter, "font_pack", return_value=pack):
            self.assertNotEqual(identity, exporter.scene_application_id(scene))

    def test_proof_uses_canonical_text_samples_and_chart_rectangles(self):
        scene = self.scene()
        scene["elements"].append({"id": "bars1", "source": "stepsWeek", "font": "widget", "x": 50,
            "y": 270, "width": 316, "height": 22, "align": "left", "colour": 0x4D9DE0,
            "nightColour": 0x8D99AE, "visible": "both"})
        scene = validate_scene(scene)
        with tempfile.TemporaryDirectory() as temporary:
            project = self.project(temporary)
            exporter.prepare_scene_project(project, scene, proof=True, preview_night=False)
            source = (project / "source/DesignerView.mc").read_text()
            self.assertIn('"time" => "10:08"', source)
            self.assertIn("private var _proof = true;", source)
            self.assertIn("private var _forcedNight = false;", source)
            shapes = [[o[k] for k in ("x", "y", "width", "height", "colour")]
                      for o in chart_ops(scene["elements"][1])]
            self.assertIn(exporter._mc(shapes), source)
            provider = (project / "source/EpixCanvasComplications.mc").read_text()
            self.assertIn("_slotTypes = [2];", provider)
            self.assertIn("_widgetTypes = [2];", provider)

    def test_resource_guard_rejects_excessive_unique_colour_labels(self):
        scene = self.scene()
        scene["elements"] = []
        for index in range(40):
            scene["elements"].append({"id": f"label{index}", "source": "label", "font": "widget",
                "x": 5, "y": 5, "width": 400, "align": "left", "colour": index + 1,
                "nightColour": index + 100, "visible": "both",
                "text": "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"})
        scene = validate_scene(scene)
        with tempfile.TemporaryDirectory() as temporary:
            project = self.project(temporary)
            with self.assertRaisesRegex(ValueError, "resource budget"):
                exporter.prepare_scene_project(project, scene)

    def test_unused_legacy_classes_are_removed_only_from_temporary_project(self):
        with tempfile.TemporaryDirectory() as temporary:
            project = self.project(temporary)
            legacy = project / "source/LegacyUnused.mc"
            legacy.write_text("class LegacyUnused {}")
            exporter.prepare_scene_project(project, self.scene())
            self.assertFalse(legacy.exists())
            self.assertTrue((ROOT / "source/EpixCanvasData.mc").is_file())
        with self.assertRaisesRegex(ValueError, "isolated project"):
            exporter.prepare_scene_project(ROOT, self.scene())

    def test_ring_positions_are_precomputed_with_shared_rounding(self):
        scene = self.scene()
        scene["elements"] = [{"id": "ring1", "source": "secondsRing", "font": "widget", "x": 10,
            "y": 10, "width": 396, "height": 396, "align": "left", "colour": 0x4D9DE0,
            "nightColour": 0x8D99AE, "visible": "both"}]
        scene = validate_scene(scene)
        with tempfile.TemporaryDirectory() as temporary:
            project = self.project(temporary)
            exporter.prepare_scene_project(project, scene)
            source = (project / "source/DesignerView.mc").read_text()
            self.assertIn("396 => " + exporter._mc(ring_positions(396)), source)
            self.assertNotIn("Math.sin", source)
            self.assertNotIn("WatchUi.loadResource(Rez.Drawables.DesignerAtlas", source)


if __name__ == "__main__":
    unittest.main()
