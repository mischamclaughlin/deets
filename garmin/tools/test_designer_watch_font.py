"""Watch font inheritance stays explicit across editing, layout and export."""
import copy
import unittest
from unittest.mock import patch

import bridge
import designer_model as model
import designer_typography as typography
import test_designer_typography as fixtures

SETTINGS = fixtures.SETTINGS


class WatchFontTests(unittest.TestCase):
    def scene(self):
        return fixtures.TypographyTests().scene()

    def test_global_font_updates_inheritors_and_preserves_custom_clocks_and_metrics(self):
        original = typography.apply(self.scene(), "clock", {**SETTINGS, "size": 50, "width": 110})
        original = typography.add_time(original)
        original = typography.set_inheritance(original, "time", False)
        original = typography.apply(original, "time", {**SETTINGS, "size": 45})
        before = copy.deepcopy(original)
        changed = typography.set_watch_font(original, "widget")
        self.assertEqual(original, before)
        self.assertEqual(changed["fontFamily"], "widget")
        self.assertEqual(changed["elements"][1], original["elements"][1])
        inherited = changed["elements"][0]
        self.assertTrue(inherited["inheritFont"])
        self.assertEqual(inherited["typography"], {**before["elements"][0]["typography"], "family": "widget"})
        for axis, extent in (("x", "width"), ("y", "height")):
            self.assertLessEqual(abs(inherited[axis] + inherited[extent] / 2 - before["elements"][0][axis] - before["elements"][0][extent] / 2), 0.5)
        self.assertNotEqual(bridge.mapping(original), bridge.mapping(changed))
        self.assertEqual(bridge.layout({"scene": changed})["scene"], changed)

    def test_toggling_inheritance_preserves_family_until_reenabled(self):
        scene = typography.apply(self.scene(), "clock", SETTINGS)
        custom = typography.set_inheritance(scene, "clock", False)
        self.assertEqual(custom["elements"][0]["font"], scene["elements"][0]["font"])
        custom = typography.apply(custom, "clock", {**SETTINGS, "family": "widget"})
        self.assertFalse(custom["elements"][0]["inheritFont"])
        inherited = typography.set_inheritance(custom, "clock", True)
        self.assertEqual(inherited["elements"][0]["typography"], SETTINGS)
        self.assertTrue(inherited["elements"][0]["inheritFont"])
        edited = typography.apply(inherited, "clock", {**SETTINGS, "family": "widget", "size": 55})
        self.assertEqual(edited["elements"][0]["typography"]["family"], "time")
        self.assertTrue(edited["elements"][0]["inheritFont"])

    def test_added_clocks_inherit_current_default_and_legacy_custom_stays_custom(self):
        legacy = typography.apply(self.scene(), "clock", SETTINGS)
        legacy["elements"][0].pop("inheritFont")
        changed = typography.set_watch_font(legacy, "widget")
        self.assertEqual(changed["elements"], legacy["elements"])
        added = typography.add_time(changed)
        clock = added["elements"][-1]
        self.assertTrue(clock["inheritFont"])
        self.assertEqual(clock["typography"]["family"], "widget")
        self.assertEqual(clock["height"], 88)

    def test_strict_validation_and_requests(self):
        for family in (None, [], "../../font", "upload:bad"):
            with self.subTest(family=family), self.assertRaises(ValueError):
                typography.set_watch_font(self.scene(), family)
        for inherit in (0, 1, "yes", None):
            with self.subTest(inherit=inherit), self.assertRaises(ValueError):
                typography.set_inheritance(self.scene(), "clock", inherit)
        scene = typography.apply(self.scene(), "clock", SETTINGS)
        scene["fontFamily"] = "widget"
        with self.assertRaisesRegex(ValueError, "does not match"):
            model.validate_scene(scene)
        for operation, payload in (("watch-font", {"scene": self.scene()}),
                                   ("inherit-font", {"scene": self.scene(), "elementId": "clock"})):
            with self.assertRaises(ValueError):
                bridge.dispatch({"operation": operation, "payload": payload})
        mapped = bridge.dispatch({"operation": "watch-font", "payload": {"scene": self.scene(), "family": "widget"}})
        custom = bridge.dispatch({"operation": "inherit-font", "payload": {"scene": mapped["scene"], "elementId": "clock", "inherit": False}})
        self.assertFalse(custom["scene"]["elements"][0]["inheritFont"])

    def test_failed_global_edit_does_not_mutate_any_element(self):
        scene = typography.add_time(self.scene())
        before = copy.deepcopy(scene)
        key, record = typography.generate(scene["device"], {**SETTINGS, "family": "widget"})
        for glyph in record["font"]["glyphs"].values():
            glyph["xadvance"] = 400
        with patch.object(typography, "generate", return_value=(key, record)):
            with self.assertRaisesRegex(ValueError, "does not fit every"):
                typography.set_watch_font(scene, "widget")
        self.assertEqual(scene, before)

    def test_identical_inheritors_reuse_one_generated_asset_per_operation(self):
        scene = self.scene()
        scene["elements"] = [{**scene["elements"][0], "id": f"clock-{index}"} for index in range(40)]
        with patch.object(typography, "generate", wraps=typography.generate) as generate:
            changed = typography.set_watch_font(scene, "widget")
        self.assertEqual(generate.call_count, 1)
        self.assertEqual(len({element["font"] for element in changed["elements"]}), 1)
