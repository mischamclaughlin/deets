"""Standalone Library dividers retain native symbols, bounds and inheritance."""
import copy
from pathlib import Path
import shutil
import tempfile
import unittest

import bridge
import designer_export as exporter
import designer_model as model
import designer_typography as typography


class DividerTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm"):
        return {"version": 2, "name": "Dividers", "device": device, "background": 0,
                "edgeInset": 16, "elements": []}

    def test_library_add_and_every_symbol_use_the_native_pipeline_on_every_watch(self):
        for device, size in model.DEVICES.items():
            original = self.scene(device)
            scene = typography.add_divider(original)
            second = typography.add_divider(scene)
            self.assertEqual(original["elements"], [])
            self.assertEqual([e["id"] for e in second["elements"]], ["divider", "divider-2"])
            for symbol in typography.DIVIDER_SYMBOLS:
                changed = typography.set_divider_symbol(scene, "divider", symbol)
                element = changed["elements"][0]
                self.assertEqual(element["dividerSymbol"], symbol)
                self.assertEqual(element["source"], "divider")
                self.assertLessEqual(abs(element["x"] + element["width"]/2 - size/2), 1)
                mapped = bridge.layout({"scene": changed})
                self.assertEqual(len(mapped["ops"]), 1)
                font = model.scene_font_pack(changed)["fonts"][element["font"]]
                glyph = font["glyphs"][str(ord(symbol))]
                self.assertEqual(mapped["ops"][0]["width"], glyph["width"])
                self.assertEqual(exporter._element_codes(element, model.SOURCES, False), {ord(symbol), 63})
                self.assertEqual(exporter._element_codes(element, model.SOURCES, True), {ord(symbol), 63})

    def test_symbols_preserve_position_and_follow_font_inheritance(self):
        scene = typography.add_divider(self.scene())
        scene["elements"][0]["dividerPosition"] = "bottom"
        scene = typography.set_divider_symbol(scene, "divider", "/")
        scene = typography.set_watch_font(scene, "widget")
        scene = typography.apply(scene, "divider", {"family": "widget", "size": 55, "thickness": 0, "width": 100, "letterSpacing": 1})
        element = scene["elements"][0]
        self.assertEqual(element["dividerPosition"], "bottom")
        self.assertEqual(element["dividerSymbol"], "/")
        self.assertEqual(element["typography"]["family"], "widget")
        op, = bridge.layout({"scene": scene})["ops"]
        self.assertEqual(op["y"] + op["height"], element["y"] + 55)
        inherited = typography.set_inheritance(scene, "divider", False)
        changed_default = typography.set_watch_font(inherited, "time")
        self.assertEqual(changed_default["elements"], inherited["elements"])
        inherited = typography.set_inheritance(changed_default, "divider", True)
        self.assertTrue(inherited["elements"][0]["inheritFont"])
        self.assertEqual(inherited["elements"][0]["typography"]["family"], "time")
        self.assertEqual(inherited["elements"][0]["dividerSymbol"], "/")

    def test_legacy_dividers_regenerate_missing_symbols_and_time_modes_stay_separate(self):
        scene = typography.add_time(self.scene())
        scene = typography._fit_clock(scene, "time", model.font_pack(scene["device"])["fonts"]["time"], source="divider")
        scene["elements"][0].pop("dividerSymbol", None)
        self.assertEqual(len(bridge.layout({"scene": scene})["ops"]), 1)
        changed = typography.set_divider_symbol(scene, "time", "|")
        self.assertTrue(changed["elements"][0]["font"].startswith("generated:"))
        with self.assertRaises(ValueError):
            typography.set_clock_source(changed, "time", "hours")
        with self.assertRaises(ValueError):
            typography.set_clock_source(typography.add_time(self.scene()), "time", "divider")
        settings = {"family": "time", "size": 55, "thickness": 0, "width": 100, "letterSpacing": 1}
        _, clock = typography.generate(scene["device"], settings)
        self.assertEqual(set(clock["font"]["glyphs"]), {str(ord(char)) for char in typography.CODES})
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            shutil.copytree(model.ROOT/"source", project/"source")
            shutil.copytree(model.ROOT/"resources", project/"resources")
            shutil.copy2(model.ROOT/"manifest.xml", project/"manifest.xml")
            for proof in (False, True):
                exporter.prepare_scene_project(project, changed, proof=proof)
                source = (project/"source/DesignerView.mc").read_text()
                self.assertIn('source.equals("divider")', source)
                self.assertNotIn('case "divider": return ":";', source)

    def test_divider_requests_are_strict_atomic_and_bounded(self):
        scene = typography.add_divider(self.scene())
        before = copy.deepcopy(scene)
        for symbol in ("", "::", "x", None, []):
            with self.subTest(symbol=symbol), self.assertRaises(ValueError):
                typography.set_divider_symbol(scene, "divider", symbol)
        self.assertEqual(scene, before)
        invalid = copy.deepcopy(scene)
        invalid["elements"][0]["dividerSymbol"] = "x"
        with self.assertRaisesRegex(ValueError, "divider symbol"):
            model.validate_scene(invalid)
        clock = typography.add_time(self.scene())
        clock["elements"][0]["dividerSymbol"] = ":"
        with self.assertRaisesRegex(ValueError, "divider symbol"):
            model.validate_scene(clock)
        mapped = bridge.dispatch({"operation": "add", "payload": {"scene": self.scene(), "source": "divider"}})
        changed = bridge.dispatch({"operation": "divider", "payload": {"scene": mapped["scene"], "elementId": "divider", "symbol": "-"}})
        self.assertEqual(changed["scene"]["elements"][0]["dividerSymbol"], "-")
        with self.assertRaises(ValueError):
            bridge.dispatch({"operation": "divider", "payload": {"scene": scene, "elementId": "divider"}})
        full = copy.deepcopy(scene)
        full["elements"] = [{**scene["elements"][0], "id": f"divider-{i}"} for i in range(40)]
        with self.assertRaisesRegex(ValueError, "at most 40"):
            typography.add_divider(full)
