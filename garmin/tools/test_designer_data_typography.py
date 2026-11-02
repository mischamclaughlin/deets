"""Data text shares native typography without changing legacy watch pixels."""
import copy
import tempfile
import unittest

import bridge
import designer_actions as actions
import designer_export as exporter
import designer_model as model
import designer_typography as typography
import test_designer_export as export_fixtures

SETTINGS = {"family": "widget", "size": 24, "thickness": 0, "width": 100, "letterSpacing": 1}


class DataTypographyTests(unittest.TestCase):
    def scene(self, source="steps", device="epix2pro47mm"):
        size = model.DEVICES[device]
        height = model.font_pack(device)["fonts"]["widget"]["height"]
        return {"version": 2, "name": "Data", "device": device, "background": 0, "fontFamily": "time",
                "elements": [{"id": "data", "source": source, "font": "widget", "x": (size-180)//2,
                              "y": (size-height)//2, "width": 180, "height": height, "align": "centre",
                              "colour": 0xffffff, "nightColour": 0xaaaaaa, "visible": "both"}]}

    def test_device_data_and_custom_text_can_be_added_on_every_device(self):
        for device in model.DEVICES:
            scene = {"version": 2, "name": "Library", "device": device,
                     "background": 0, "edgeInset": 16, "elements": []}
            before = copy.deepcopy(scene)
            for source in ("battery", "alarms", "label"):
                with self.subTest(device=device, source=source):
                    mapped = bridge.dispatch({"operation": "add", "payload": {"scene": scene, "source": source}})
                    element = mapped["scene"]["elements"][-1]
                    self.assertEqual(element["source"], source)
                    self.assertEqual(element["boxSizing"], "hug")
                    self.assertTrue(mapped["ops"])
                    second = typography.add_data_text(mapped["scene"], source)
                    self.assertNotEqual(second["elements"][0]["id"], second["elements"][1]["id"])
            self.assertEqual(scene, before)

    def test_literal_text_edits_fit_native_ink_and_reject_invalid_changes_atomically(self):
        scene = typography.add_data_text({"version": 2, "name": "Text", "device": "epix2pro47mm",
                 "background": 0, "edgeInset": 16, "elements": []}, "label")
        before = copy.deepcopy(scene)
        changed = typography.set_label_text(scene, "label", "Az 5%°")
        element = changed["elements"][0]
        self.assertEqual(element["text"], "Az 5%°")
        self.assertLessEqual(abs(element["x"] * 2 + element["width"] - scene["elements"][0]["x"] * 2 - scene["elements"][0]["width"]), 1)
        fixed = copy.deepcopy(changed)
        fixed["elements"][0].update(boxSizing="fixed", width=70, height=15)
        edited = typography.set_label_text(fixed, "label", "New text")["elements"][0]
        self.assertEqual((edited["x"], edited["y"], edited["width"], edited["height"]),
                         tuple(fixed["elements"][0][key] for key in ("x", "y", "width", "height")))
        for text in ("X" * 81, "☃", "line\nbreak", None, "W" * 80):
            with self.subTest(text=text), self.assertRaises(ValueError):
                typography.set_label_text(scene, "label", text)
        self.assertEqual(scene, before)
        payload = {"scene": scene, "elementId": "label", "text": "Hello"}
        mapped = bridge.dispatch({"operation": "label-text", "payload": payload})
        self.assertEqual(mapped["scene"]["elements"][0]["text"], "Hello")
        with self.assertRaises(ValueError):
            bridge.dispatch({"operation": "label-text", "payload": {**payload, "extra": 1}})

    def test_all_data_text_sources_accept_typography_and_fit(self):
        for source in sorted(typography.DATA_SOURCES):
            with self.subTest(source=source):
                original = self.scene(source)
                before = copy.deepcopy(original)
                scene = typography.apply(original, "data", SETTINGS)
                element = scene["elements"][0]
                self.assertEqual(original, before)
                self.assertEqual(element["typography"], SETTINGS)
                self.assertFalse(element["inheritFont"])
                self.assertEqual(element["boxSizing"], "hug")
                self.assertTrue(bridge.layout({"scene": scene})["ops"])
                self.assertEqual(typography.fit_text_box(scene, "data"), scene)

    def test_legacy_values_keep_their_font_during_validation_and_refresh(self):
        scene = self.scene()
        self.assertEqual(model.validate_scene(scene), scene)
        self.assertEqual(typography.refresh_fonts(scene), scene)
        self.assertEqual(typography.set_watch_font(scene, "widget")["elements"], scene["elements"])
        self.assertFalse(typography.inherits(scene["elements"][0]))

    def test_data_supports_inheritance_and_live_text_presets(self):
        scene = typography.set_inheritance(self.scene("weeklyWalk"), "data", True)
        self.assertEqual(scene["elements"][0]["typography"]["family"], "time")
        scene = typography.set_watch_font(scene, "widget")
        self.assertEqual(scene["elements"][0]["typography"]["family"], "widget")
        preset = {"id": "small", "name": "Small", **{key: SETTINGS[key] for key in SETTINGS if key != "family"}}
        scene = actions.set_text_presets(scene, [preset], "small")
        scene = actions.apply_text_preset(scene, "data", "small")
        scene = actions.set_text_presets(scene, [{**preset, "letterSpacing": 3}], "small")
        self.assertEqual(scene["elements"][0]["textPresetId"], "small")
        self.assertEqual(scene["elements"][0]["typography"]["letterSpacing"], 3)

    def test_fixed_data_boxes_survive_typography_and_fit_uses_actual_label(self):
        scene = self.scene("label")
        scene["elements"][0].update(boxSizing="fixed", height=10, text="Az 5%°")
        changed = typography.apply(scene, "data", SETTINGS)
        for key in ("x", "y", "width", "height"):
            self.assertEqual(changed["elements"][0][key], scene["elements"][0][key])
        fitted = typography.fit_text_box(changed, "data")
        element = fitted["elements"][0]
        metrics = model.scene_font_pack(fitted)["fonts"][element["font"]]
        expected, _, _ = model.hugging_element(element["text"], element, metrics)
        self.assertEqual(element, expected)
        self.assertTrue({str(ord(char)) for char in "Az 5%°"} <= set(metrics["glyphs"]))

    def test_clock_assets_cannot_silently_lose_data_punctuation(self):
        scene = typography.apply(self.scene("weeklyWalk"), "data", SETTINGS)
        key, _ = typography.generate(scene["device"], SETTINGS)
        scene["elements"][0]["font"] = key
        with self.assertRaisesRegex(ValueError, "data character"):
            model.validate_scene(scene)

    def test_generated_data_exports_preserve_native_glyphs_on_every_device(self):
        for device in model.DEVICES:
            with self.subTest(device=device):
                scene = typography.apply(self.scene("weeklyWalk", device), "data", SETTINGS)
                element = scene["elements"][0]
                font = model.scene_font_pack(scene)["fonts"][element["font"]]
                with tempfile.TemporaryDirectory() as directory:
                    project = export_fixtures.DesignerExportTests().project(directory)
                    exporter.prepare_scene_project(project, scene)
                    descriptor = (project / "resources/designer-fonts/font-0.fnt").read_text()
                    for char in "0123456789-./:":
                        self.assertIn(f"char id={ord(char)} ", descriptor)
                        self.assertIn(str(ord(char)), font["glyphs"])


if __name__ == "__main__":
    unittest.main()
