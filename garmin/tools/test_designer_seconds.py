"""Combined clocks use exact mixed-size native masks and bounded live widths."""
import copy
import hashlib
from pathlib import Path
import random
import shutil
import tempfile
import unittest
from unittest.mock import patch

import bridge
import designer_export as exporter
import designer_model as model
import designer_seconds as seconds
import designer_typography as typography

SETTINGS = {"family": "time", "size": 50, "thickness": 0, "width": 100, "letterSpacing": 1}


class CombinedSecondsTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm", generated=False):
        scene = {"version": 2, "name": "Seconds", "device": device, "background": 0, "edgeInset": 16, "elements": []}
        scene = typography.add_time(scene)
        if device == "epix2pro42mm" and not generated:
            scene["edgeInset"] = 0
        if generated:
            scene = typography.apply(scene, "time", SETTINGS)
        return typography.set_clock_source(scene, "time", "timeSeconds")

    def test_combined_modes_preserve_centre_and_use_exact_half_masks_on_every_device(self):
        for device, size in model.DEVICES.items():
            # Native layouts retain device bounds; smaller watch uses physical clearance for this fixture.
            for generated in (False, True):
                with self.subTest(device=device, generated=generated):
                    original = self.scene(device, generated)
                    before = copy.deepcopy(original)
                    half = typography.set_seconds_size(original, "time", "half")
                    self.assertEqual(original, before)
                    element = half["elements"][0]
                    self.assertLess(element["width"], original["elements"][0]["width"])
                    self.assertLessEqual(abs(element["x"] + element["width"] / 2 - size / 2), 1)
                    pack = model.scene_font_pack(half)
                    font = pack["fonts"][element["font"]]
                    plain = model.scene_font_pack(original)["fonts"][element["font"]]
                    for code, glyph in plain["glyphs"].items():
                        self.assertEqual(font["glyphs"][code], glyph)
                    original_pack = model.scene_font_pack(original)
                    old_width, old_height, old_raw = typography._raw(original_pack["images"][element["font"]])
                    new_width, _, new_raw = typography._raw(pack["images"][element["font"]])
                    for row in range(old_height):
                        self.assertEqual(new_raw[row*new_width:row*new_width+old_width], old_raw[row*old_width:(row+1)*old_width])
                    operations = bridge.layout({"scene": half})["ops"]
                    self.assertEqual(len(operations), 8)
                    for operation in operations[-3:]:
                        self.assertLessEqual(operation["height"], element["height"] // 2)
                        self.assertGreaterEqual(operation["y"], element["y"] + element["height"] - element["height"] // 2)
                    full = typography.set_seconds_size(half, "time", "full")
                    self.assertEqual(full["elements"][0]["font"], original["elements"][0]["font"])
                    self.assertEqual(full["elements"][0]["width"], original["elements"][0]["width"])

    def test_separable_live_width_matches_exhaustive_reference_for_all_times(self):
        scene = self.scene(generated=True)
        for mode in ("full", "half"):
            changed = typography.set_seconds_size(scene, "time", mode)
            element = changed["elements"][0]
            font = model.scene_font_pack(changed)["fonts"][element["font"]]
            # Exhaustive advances combine only 24/60/60 choices rather than rendering 86,400 values.
            reference = 0
            for hour in range(24):
                for minute in range(60):
                    prefix = f"{hour:02d}:{minute:02d}"
                    for second in range(60):
                        text = seconds.display_text(prefix + f":{second:02d}", element)
                        pen, right = 0, 0
                        for character in text:
                            glyph = font["glyphs"][str(ord(character))]
                            right = max(right, pen + glyph["width"])
                            pen += glyph["xadvance"]
                        reference = max(reference, right)
            self.assertIn(element["width"] - reference, (0, 1))
            randomiser = random.Random(42)
            for _ in range(80):
                text = f"{randomiser.randrange(24):02d}:{randomiser.randrange(60):02d}:{randomiser.randrange(60):02d}"
                ops = model.layout_text(text, element, font)
                expected = [font["glyphs"][str(ord(char))]["width"] for char in seconds.display_text(text, element)]
                self.assertEqual([op["width"] for op in ops], expected)

    def test_size_mode_survives_typography_inheritance_and_source_changes(self):
        scene = typography.set_seconds_size(self.scene(generated=True), "time", "half")
        scene = typography.set_watch_font(scene, "widget")
        scene = typography.apply(scene, "time", {**SETTINGS, "size": 55})
        self.assertEqual(scene["elements"][0]["secondsSize"], "half")
        scene = typography.set_clock_source(scene, "time", "hours")
        scene = typography.set_clock_source(scene, "time", "timeSeconds")
        self.assertEqual(scene["elements"][0]["secondsSize"], "half")
        self.assertEqual(len(bridge.layout({"scene": scene})["ops"]), 8)
        scene = typography.set_inheritance(scene, "time", False)
        scene = typography.apply(scene, "time", {**SETTINGS, "family": "time"})
        scene = typography.set_inheritance(scene, "time", True)
        self.assertEqual(scene["elements"][0]["typography"]["family"], "widget")
        self.assertEqual(scene["elements"][0]["secondsSize"], "half")

    def test_invalid_modes_and_non_fitting_changes_leave_input_unchanged(self):
        scene = self.scene()
        before = copy.deepcopy(scene)
        for mode in ("small", None, [], 1):
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                typography.set_seconds_size(scene, "time", mode)
        with self.assertRaises(ValueError):
            typography.set_seconds_size(typography.add_time({**scene, "elements": []}), "time", "half")
        invalid = copy.deepcopy(scene)
        invalid["elements"][0].update(secondsSize="half", font=[])
        with self.assertRaises(ValueError):
            model.validate_scene(invalid)
        self.assertEqual(scene, before)
        narrow = typography.set_seconds_size(scene, "time", "half")
        narrow["elements"][0]["x"] = 40
        with self.assertRaises(ValueError):
            typography.set_seconds_size(narrow, "time", "full")

    def test_half_masks_exist_at_minimum_size_and_export_uses_them_in_both_modes(self):
        scene = typography.apply(self.scene(generated=True), "time", {**SETTINGS, "size": 12})
        scene = typography.set_seconds_size(scene, "time", "half")
        element = scene["elements"][0]
        font = model.scene_font_pack(scene)["fonts"][element["font"]]
        for character in seconds.HALF_CHARACTERS:
            glyph = font["glyphs"][str(ord(character) + seconds.HALF_CODE_OFFSET)]
            self.assertGreater(glyph["height"], 0)
            self.assertLessEqual(glyph["height"], 6)
        for proof in (False, True):
            codes = exporter._element_codes(element, model.SOURCES, proof)
            self.assertIn(ord(":") + seconds.HALF_CODE_OFFSET, codes)
            with tempfile.TemporaryDirectory() as directory:
                project = Path(directory)
                shutil.copytree(model.ROOT/"source", project/"source")
                shutil.copytree(model.ROOT/"resources", project/"resources")
                shutil.copy2(model.ROOT/"manifest.xml", project/"manifest.xml")
                exporter.prepare_scene_project(project, scene, proof=proof)
                source = (project/"source/DesignerView.mc").read_text()
                self.assertIn('case "timeSeconds": return _values.timeText + ":"', source)
                self.assertIn('if (element[18] && i >= 5)', source)
                self.assertIn(str(ord(":") + seconds.HALF_CODE_OFFSET), source)

    def test_changed_seconds_renderer_invalidates_mapping(self):
        scene = self.scene(generated=True)
        original = bridge.mapping(scene)
        read_bytes = Path.read_bytes
        def changed(path):
            content = read_bytes(path)
            return content + b"\n" if path.name == "designer_seconds.py" else content
        with patch.object(Path, "read_bytes", changed):
            self.assertNotEqual(bridge.mapping(scene), original)

    def test_uploaded_font_supports_full_and_half_seconds(self):
        font_path = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
        if not font_path.is_file():
            self.skipTest("No system TTF fixture is available.")
        data = font_path.read_bytes()
        identity = hashlib.sha256(data).hexdigest()
        with tempfile.TemporaryDirectory() as directory, patch.object(typography, "CACHE", Path(directory)):
            (Path(directory)/f"{identity}.font").write_bytes(data)
            scene = self.scene(generated=False)
            scene = typography.set_inheritance(scene, "time", False)
            scene = typography.apply(scene, "time", {**SETTINGS, "family": f"upload:{identity}"})
            scene = typography.set_seconds_size(scene, "time", "half")
            self.assertEqual(len(bridge.layout({"scene": scene})["ops"]), 8)
            self.assertEqual(scene["elements"][0]["typography"]["family"], f"upload:{identity}")

    def test_repeated_size_toggles_do_not_drift_the_native_centre(self):
        for generated in (False, True):
            scene = self.scene(generated=generated)
            element = scene["elements"][0]
            centre = (2*element["x"] + element["width"], 2*element["y"] + element["height"])
            for index in range(12):
                scene = typography.set_seconds_size(scene, "time", "half" if index % 2 == 0 else "full")
                element = scene["elements"][0]
                self.assertEqual((2*element["x"] + element["width"], 2*element["y"] + element["height"]), centre)
