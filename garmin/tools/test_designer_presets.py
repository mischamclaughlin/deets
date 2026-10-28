"""Named text presets remain reusable snapshots rather than implicit live styles."""
import copy
import unittest

import bridge
import designer_actions as actions
import designer_model as model
import designer_typography as typography


class TextPresetTests(unittest.TestCase):
    def scene(self):
        return {"version": 2, "name": "Named presets", "device": "epix2pro47mm", "background": 0,
                "edgeInset": 16, "elements": []}

    def presets(self):
        return [{"id": "time", "name": "Time", "size": 60, "thickness": 0, "width": 100, "letterSpacing": 1},
                {"id": "widgets", "name": "Widgets", "size": 26, "thickness": 1, "width": 105, "letterSpacing": 2}]

    def test_save_rename_delete_and_default_selection_do_not_resize_existing_text(self):
        scene = typography.add_time(self.scene())
        before = copy.deepcopy(scene)
        changed = actions.set_text_presets(scene, self.presets(), "widgets")
        self.assertEqual(scene, before)
        self.assertEqual(changed["elements"], scene["elements"])
        self.assertEqual(changed["defaultTextPresetId"], "widgets")
        added = typography.add_time(changed)
        divider = typography.add_divider(changed)
        self.assertEqual(added["elements"][-1]["height"], 26)
        self.assertEqual(divider["elements"][-1]["height"], 26)
        presets = copy.deepcopy(changed["textPresets"])
        presets[0]["name"] = "  Display time  "
        changed = actions.set_text_presets(changed, presets, "time")
        self.assertEqual(changed["textPresets"][0]["name"], "Display time")
        changed = actions.set_text_presets(changed, changed["textPresets"][:1], "time")
        self.assertEqual(changed["elements"], scene["elements"])
        self.assertEqual(len(changed["textPresets"]), 1)

    def test_explicit_application_preserves_custom_family_clock_modes_and_dividers(self):
        scene = actions.set_text_presets(self.scene(), self.presets(), "time")
        scene = typography.add_time(scene)
        scene = typography.set_clock_source(scene, "time", "timeSeconds")
        scene = typography.set_seconds_size(scene, "time", "half")
        scene = typography.set_inheritance(scene, "time", False)
        scene = typography.apply(scene, "time", {"family": "widget", "size": 55, "thickness": 0, "width": 100, "letterSpacing": 1})
        before = copy.deepcopy(scene)
        applied = actions.apply_text_preset(scene, "time", "widgets")
        self.assertEqual(scene, before)
        element = applied["elements"][0]
        self.assertEqual(element["height"], 26)
        self.assertEqual(element["typography"]["family"], "widget")
        self.assertFalse(element["inheritFont"])
        self.assertEqual(element["source"], "timeSeconds")
        self.assertEqual(element["secondsSize"], "half")
        self.assertEqual(len(bridge.layout({"scene": applied})["ops"]), 8)
        scene = typography.add_divider(scene)
        scene = typography.set_divider_symbol(scene, "divider", "/")
        scene["elements"][-1]["dividerPosition"] = "bottom"
        applied = actions.apply_text_preset(scene, "divider", "widgets")
        self.assertEqual(applied["elements"][-1]["height"], 26)
        self.assertEqual(applied["elements"][-1]["dividerSymbol"], "/")
        self.assertEqual(applied["elements"][-1]["dividerPosition"], "bottom")
        self.assertEqual(applied["elements"][0], scene["elements"][0])

    def test_legacy_defaults_and_named_defaults_remain_compatible(self):
        scene = actions.set_text_defaults(self.scene(), {"size": 45, "thickness": 0, "width": 100, "letterSpacing": 1})
        self.assertEqual(typography.scene_text_presets(scene), [])
        self.assertEqual(typography.add_time(scene)["elements"][0]["height"], 45)
        presets = self.presets()
        presets[0]["size"] = 45
        named = actions.set_text_presets(scene, presets, "time")
        self.assertNotIn("textDefaults", named)
        defaults = {"size": 40, "thickness": 1, "width": 110, "letterSpacing": 2}
        changed = actions.set_text_defaults(named, defaults)
        self.assertEqual(changed["textDefaults"], defaults)
        self.assertEqual(typography.scene_text_defaults(changed), defaults)
        self.assertEqual(changed["textPresets"][1], named["textPresets"][1])
        self.assertEqual(typography.add_time(changed)["elements"][-1]["height"], 40)

    def test_registry_bounds_and_strict_requests_are_atomic(self):
        scene = actions.set_text_presets(self.scene(), self.presets(), "time")
        before = copy.deepcopy(scene)
        invalid = [[], self.presets()*11,
                   [{**self.presets()[0], "id": "../bad"}],
                   [{**self.presets()[0], "name": " "}],
                   [{**self.presets()[0], "name": "x"*41}],
                   [{**self.presets()[0], "size": True}],
                   [{**self.presets()[0], "size": 161}],
                   [{**self.presets()[0], "unknown": 1}],
                   [self.presets()[0], {**self.presets()[1], "id": "time"}],
                   [self.presets()[0], {**self.presets()[1], "name": " TIME "}]]
        for presets in invalid:
            with self.subTest(presets=presets), self.assertRaises(ValueError):
                actions.set_text_presets(scene, presets, "time")
        with self.assertRaises(ValueError):
            actions.set_text_presets(scene, self.presets(), "missing")
        for change in ({"textPresets": self.presets()}, {"defaultTextPresetId": "time"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                model.validate_scene({**self.scene(), **change})
        for payload in ({"scene": scene, "presets": self.presets()},
                        {"scene": scene, "presets": self.presets(), "defaultPresetId": "time", "extra": 1}):
            with self.assertRaises(ValueError):
                bridge.dispatch({"operation": "text-presets", "payload": payload})
        text = typography.add_time(scene)
        for preset_id in (None, [], "missing"):
            with self.subTest(preset_id=preset_id), self.assertRaises(ValueError):
                actions.apply_text_preset(text, "time", preset_id)
        ring = typography.set_clock_source(text, "time", "secondsRing")
        with self.assertRaises(ValueError):
            actions.apply_text_preset(ring, "time", "time")
        self.assertEqual(scene, before)

    def test_empty_registry_has_no_examples_and_can_be_created_then_cleared(self):
        original = self.scene()
        self.assertEqual(typography.scene_text_presets(original), [])
        empty = actions.set_text_presets(original, [], None)
        self.assertEqual(empty["textPresets"], [])
        self.assertIsNone(empty["defaultTextPresetId"])
        populated = actions.set_text_presets(empty, self.presets(), "time")
        text = typography.add_time(populated)
        cleared = actions.set_text_presets(text, [], None)
        self.assertEqual(cleared["elements"], text["elements"])
        self.assertEqual(typography.scene_text_presets(cleared), [])
        added = typography.add_time(cleared)
        self.assertEqual(added["elements"][-1]["height"], model.font_pack(cleared["device"])["fonts"]["time"]["height"])
        with self.assertRaises(ValueError):
            actions.apply_text_preset(cleared, "time", "time")
