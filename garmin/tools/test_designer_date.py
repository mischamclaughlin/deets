"""Date elements fit live content and share native typography and export pixels."""
import copy
from pathlib import Path
import tempfile
import unittest

import bridge
import designer_actions as actions
import designer_export as exporter
import designer_model as model
import designer_typography as typography
from test_designer_helpers import assert_fitted_box


class DateTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm"):
        return {"version": 2, "name": "Date formats", "device": device, "background": 0,
                "edgeInset": 16, "elements": []}

    def test_add_is_independent_and_centred_on_every_device(self):
        for device, size in model.DEVICES.items():
            original = self.scene(device)
            before = copy.deepcopy(original)
            added = typography.add_date(original)
            second = typography.add_date(added)
            self.assertEqual(original, before)
            self.assertEqual(second["elements"][0], added["elements"][0])
            self.assertEqual([element["id"] for element in second["elements"]], ["date", "date-2"])
            element = added["elements"][0]
            self.assertEqual(element["source"], "numericDate")
            self.assertFalse(element["inheritFont"])
            self.assertEqual(element["typography"]["size"], 24)
            assert_fitted_box(self, added, element)
            self.assertLessEqual(abs(element["x"] + element["width"] / 2 - size / 2), .5)
            self.assertEqual(len(bridge.layout({"scene": added})["ops"]), 8)

    def test_legacy_dates_do_not_implicitly_inherit_the_watch_font(self):
        scene = self.scene()
        font = model.font_pack(scene["device"])["fonts"]["widget"]
        scene["fontFamily"] = "time"
        scene["elements"] = [{"id": "legacy-date", "source": "date", "font": "widget",
            "x": 100, "y": 180, "width": 216, "height": font["height"], "align": "centre",
            "colour": 0xffffff, "nightColour": 0x888888, "visible": "both"}]
        checked = model.validate_scene(scene)
        changed = typography.set_watch_font(checked, "widget")
        self.assertEqual(changed["elements"], checked["elements"])

    def test_formats_preserve_identity_centre_and_all_required_glyphs(self):
        original = typography.add_date(self.scene())
        original_element = original["elements"][0]
        for source in typography.DATE_SOURCES:
            with self.subTest(source=source):
                changed = typography.set_date_source(original, "date", source)
                element = changed["elements"][0]
                self.assertEqual(element["font"], original_element["font"])
                self.assertEqual(element["source"], source)
                self.assertEqual(element["x"] + element["width"] // 2,
                                 original_element["x"] + original_element["width"] // 2)
                font = model.scene_font_pack(changed)["fonts"][element["font"]]
                codes = exporter._element_codes(element, model.SOURCES, False)
                self.assertTrue(all(str(code) in font["glyphs"] for code in codes))
                self.assertGreater(len(bridge.layout({"scene": changed})["ops"]), 0)

    def test_live_bounds_fit_proportional_glyphs_and_negative_spacing_without_clipping(self):
        scene = typography.add_date(self.scene())
        scene = typography.apply(scene, "date", {"family": "time", "size": 20,
            "thickness": 1, "width": 125, "letterSpacing": -4})
        values = {
            "date": [f"{weekday} {day} {month} {year}" for weekday in typography.WEEKDAYS
                     for day in (1, 11, 28, 31) for month in typography.MONTHS for year in (1000, 2026, 8888, 9999)],
            "numericDate": [f"{day:02d}/{month:02d}/{year:02d}" for day in range(1, 32)
                            for month in range(1, 13) for year in (0, 11, 26, 88, 99)],
            "day": [str(day) for day in range(1, 32)],
            "weekday": typography.WEEKDAYS, "month": typography.MONTHS,
            "year": [str(year) for year in range(1000, 10000)],
        }
        for source, texts in values.items():
            changed = typography.set_date_source(scene, "date", source)
            element = changed["elements"][0]
            font = model.scene_font_pack(changed)["fonts"][element["font"]]
            for text in texts:
                operations = model.layout_text(text, element, font)
                fitted, _, _ = model.hugging_element(text, element, font)
                bounds = (min(op["x"] for op in operations), min(op["y"] for op in operations),
                          max(op["x"]+op["width"] for op in operations), max(op["y"]+op["height"] for op in operations))
                self.assertEqual(bounds, (fitted["x"], fitted["y"],
                                          fitted["x"]+fitted["width"], fitted["y"]+fitted["height"]))
                glyphs = [font["glyphs"][str(ord(char))] for char in text]
                self.assertEqual([op["width"] for op in operations],
                                 [glyph["width"] for glyph in glyphs if glyph["width"] and glyph["height"]])

    def test_date_participates_in_inheritance_presets_copy_and_colours(self):
        scene = typography.add_date(self.scene())
        scene = typography.set_date_source(scene, "date", "date")
        scene = typography.set_inheritance(scene, "date", True)
        scene = typography.set_watch_font(scene, "widget")
        self.assertEqual(scene["elements"][0]["typography"]["family"], "widget")
        preset = {"id": "small", "name": "Small", "size": 20, "thickness": 0, "width": 100, "letterSpacing": 1}
        scene = actions.set_text_presets(scene, [preset], "small")
        scene = actions.apply_text_preset(scene, "date", "small")
        scene = actions.set_text_presets(scene, [{**preset, "size": 22}], "small")
        self.assertEqual(scene["elements"][0]["typography"]["size"], 22)
        assert_fitted_box(self, scene, scene["elements"][0])
        scene = actions.set_element_colour(scene, "date", "day", 0x123456)
        scene = actions.copy_element(scene, "date")
        self.assertEqual(scene["elements"][1]["colour"], 0x123456)
        self.assertEqual(scene["elements"][1]["textPresetId"], "small")

    def test_invalid_requests_and_non_fitting_edits_are_atomic(self):
        scene = typography.add_date(self.scene())
        for source in (None, [], "time", "../../date"):
            with self.assertRaisesRegex(ValueError, "numeric date"):
                typography.set_date_source(scene, "date", source)
        clock = typography.add_time(self.scene())
        with self.assertRaisesRegex(ValueError, "Select a date element"):
            typography.set_date_source(clock, "time", "numericDate")
        divider = typography.add_divider(self.scene())
        with self.assertRaisesRegex(ValueError, "Select a date element"):
            typography.set_date_source(divider, "divider", "date")
        before = copy.deepcopy(scene)
        with self.assertRaisesRegex(ValueError, "does not fit"):
            typography.apply(scene, "date", {"family": "widget", "size": 160,
                "thickness": 0, "width": 100, "letterSpacing": 1})
        self.assertEqual(scene, before)
        for payload in ({"scene": scene, "elementId": "date"},
                        {"scene": scene, "elementId": "date", "source": "date", "extra": 1}):
            with self.assertRaisesRegex(ValueError, "date display"):
                bridge.dispatch({"operation": "date", "payload": payload})
        for source in ("unsupported", "", None):
            with self.assertRaisesRegex(ValueError, "supported element"):
                bridge.dispatch({"operation": "add", "payload": {"scene": scene, "source": source}})
        full = self.scene()
        full["elements"] = [{**scene["elements"][0], "id": f"date-{index}"} for index in range(40)]
        with self.assertRaisesRegex(ValueError, "at most 40"):
            typography.add_date(full)

    def test_export_live_dates_are_english_and_not_frozen_samples(self):
        scene = typography.add_date(self.scene())
        scene = typography.set_date_source(scene, "date", "date")
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary)
            for name in ("source", "resources"):
                (project / name).mkdir()
            import shutil
            shutil.copy2(model.ROOT / "manifest.xml", project / "manifest.xml")
            for name in ("EpixCanvasApp.mc", "EpixCanvasComplications.mc"):
                shutil.copy2(model.ROOT / "source" / name, project / "source" / name)
            exporter.prepare_scene_project(project, scene)
            source = (project / "source/DesignerView.mc").read_text()
            self.assertIn('Gregorian.info(Time.now(), Time.FORMAT_SHORT)', source)
            self.assertIn('["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]', source)
            self.assertIn('info.day.format("%02d") + "/"', source)
            self.assertIn('case "month": return dateFor(source);', source)
            self.assertIn('_proof = false', source)


if __name__ == "__main__":
    unittest.main()
