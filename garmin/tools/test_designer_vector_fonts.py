"""Editable fonts are rasterised from vectors at their native output size."""
import base64
import copy
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import designer_actions as actions
import test_designer_typography as fixtures
import designer_model as model
import designer_typography as typography


class VectorFontTests(unittest.TestCase):
    def settings(self, **changes):
        return {"family": "time", "size": 24, "thickness": 0,
                "width": 100, "letterSpacing": 1, **changes}

    def test_native_generation_does_not_read_or_resize_bitmap_fonts(self):
        # Reading the old atlas or scaling its pixels would recreate the defect
        # even if the final glyph dimensions and scene bounds still looked valid.
        with tempfile.TemporaryDirectory() as directory, patch.object(typography, "CACHE", Path(directory)), \
                patch.object(model, "font_pack", side_effect=AssertionError("Bitmap atlas was read")), \
                patch.object(typography, "_resize", side_effect=AssertionError("Bitmap was resized"), create=True), \
                patch.object(typography, "_resize_date", side_effect=AssertionError("Date bitmap was resized"), create=True):
            for family, size, options in (("time", 70, {}), ("widget", 24, {"date": True}),
                                          ("time", 40, {"divider": True})):
                with self.subTest(family=family, size=size, options=options):
                    _, record = typography.generate("epix2pro47mm", self.settings(family=family, size=size), **options)
                    self.assertEqual(record["font"]["height"], size)

    def test_small_date_glyphs_have_smooth_ink_and_stay_inside_native_height(self):
        for family in ("time", "widget"):
            for size in (12, 24):
                with self.subTest(family=family, size=size):
                    _, record = typography.generate("epix2pro47mm", self.settings(family=family, size=size), date=True)
                    font = record["font"]
                    required = {str(ord(char)) for char in typography.DATE_CODES + " "}
                    self.assertEqual(set(font["glyphs"]), required)
                    for char in typography.DATE_CODES:
                        glyph = font["glyphs"][str(ord(char))]
                        self.assertGreater(glyph["width"] * glyph["height"], 0, char)
                        self.assertGreaterEqual(glyph["yoffset"], 0, char)
                        self.assertLessEqual(glyph["yoffset"] + glyph["height"], size, char)
                    _, _, pixels = typography._raw(base64.b64decode(record["image"]))
                    self.assertTrue(set(pixels) <= set(range(0, 256, 17)))
                    self.assertTrue(any(0 < alpha < 255 for alpha in pixels))
                    self.assertEqual(font["glyphs"]["32"]["width"], 0)
                    self.assertGreater(font["glyphs"]["32"]["xadvance"], 0)

    def test_uploaded_and_included_regular_render_the_identical_complete_face(self):
        data = typography.INCLUDED_FONTS["time"].read_bytes()
        identity = hashlib.sha256(data).hexdigest()
        with tempfile.TemporaryDirectory() as directory, patch.object(typography, "CACHE", Path(directory)):
            (Path(directory) / f"{identity}.font").write_bytes(data)
            _, included = typography.generate("epix2pro47mm", self.settings(), date=True)
            _, uploaded = typography.generate("epix2pro47mm", self.settings(family=f"upload:{identity}"), date=True)
            # Uppercase letters and slash must use the selected face too, rather
            # than silently falling back to the old NL Thin bitmap atlas.
            self.assertEqual(included["font"]["glyphs"], uploaded["font"]["glyphs"])
            self.assertEqual(included["image"], uploaded["image"])

    def test_source_font_changes_invalidate_generated_cache(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(typography, "CACHE", Path(directory)):
            key, regular = typography.generate("epix2pro47mm", self.settings(), date=True)
            with patch.dict(typography.INCLUDED_FONTS, {"time": typography.INCLUDED_FONTS["widget"]}):
                changed_key, thin = typography.generate("epix2pro47mm", self.settings(), date=True)
            self.assertNotEqual(key, changed_key)
            self.assertNotEqual(regular["sourceHash"], thin["sourceHash"])
            self.assertNotEqual(regular["image"], thin["image"])

    def test_refresh_upgrades_legacy_clock_and_preserves_centre_idempotently(self):
        scene = fixtures.TypographyTests().scene()
        original = copy.deepcopy(scene)
        changed = typography.refresh_fonts(scene)
        self.assertEqual(scene, original)
        element = changed["elements"][0]
        self.assertTrue(element["font"].startswith("generated:"))
        record = typography.load(element["font"], scene["device"])
        self.assertEqual(record["rasteriser"], typography.RASTER_VERSION)
        for axis, extent in (("x", "width"), ("y", "height")):
            previous = original["elements"][0]
            self.assertLessEqual(abs(element[axis] + element[extent] / 2 -
                                     previous[axis] - previous[extent] / 2), .5)
        self.assertEqual(typography.refresh_fonts(changed), changed)

    def test_refresh_updates_stale_masks_and_preserves_custom_date_and_preset(self):
        scene = typography.add_date({**fixtures.TypographyTests().scene(), "elements": []})
        scene = typography.set_date_source(scene, "date", "weekday")
        preset = {"id": "small", "name": "Small", "size": 24, "thickness": 0,
                  "width": 100, "letterSpacing": 1}
        scene = actions.set_text_presets(scene, [preset], "small")
        scene = actions.apply_text_preset(scene, "date", "small")
        scene["elements"][0]["visible"] = "night"
        before = copy.deepcopy(scene)
        with patch.object(typography, "RASTER_VERSION", "vector-native-test-refresh"):
            changed = typography.refresh_fonts(scene)
            record = typography.load(changed["elements"][0]["font"], scene["device"])
            self.assertEqual(record["rasteriser"], "vector-native-test-refresh")
        self.assertEqual(scene, before)
        self.assertNotEqual(changed["elements"][0]["font"], before["elements"][0]["font"])
        for field in ("id", "source", "typography", "textPresetId", "inheritFont", "visible", "colour", "nightColour"):
            self.assertEqual(changed["elements"][0][field], before["elements"][0][field])

    def test_refresh_failure_leaves_all_original_elements_untouched(self):
        scene = typography.add_time(fixtures.TypographyTests().scene())
        scene = typography.apply(scene, "time", self.settings(size=40))
        before = copy.deepcopy(scene)
        generate = typography.generate
        calls = 0
        def fail_second(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise ValueError("Second font cannot be generated")
            return generate(*args, **kwargs)
        with patch.object(typography, "generate", side_effect=fail_second):
            with self.assertRaisesRegex(ValueError, "Second font"):
                typography.refresh_fonts(scene)
        self.assertEqual(calls, 2)
        self.assertEqual(scene, before)

    def test_divider_punctuation_keeps_its_baseline_and_relative_heights(self):
        _, record = typography.generate("epix2pro47mm", self.settings(size=70), divider=True)
        glyphs = record["font"]["glyphs"]
        dot, colon, slash, zero = (glyphs[str(ord(char))] for char in ".:/0")
        self.assertGreater(dot["yoffset"], colon["yoffset"])
        self.assertGreater(dot["yoffset"], zero["yoffset"])
        self.assertLess(dot["height"], colon["height"])
        self.assertLess(dot["height"], slash["height"])
        self.assertLessEqual(dot["yoffset"] + dot["height"], zero["yoffset"] + zero["height"] + 1)


if __name__ == "__main__":
    unittest.main()
