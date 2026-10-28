"""Named text presets link elements to shared live typography."""
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
        self.assertEqual(added["elements"][-1]["height"], 88)
        self.assertEqual(added["elements"][-1]["font"], "time")
        self.assertNotIn("textPresetId", added["elements"][-1])
        self.assertEqual(divider["elements"][-1]["height"], 88)
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
        for preset_id in ([], "missing"):
            with self.subTest(preset_id=preset_id), self.assertRaises(ValueError):
                actions.apply_text_preset(text, "time", preset_id)
        ring = typography.set_clock_source(text, "time", "secondsRing")
        linked_ring = actions.apply_text_preset(ring, "time", "time")
        self.assertEqual(linked_ring["elements"][0]["textPresetId"], "time")
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


    def test_live_updates_reach_linked_copies_and_preserve_independent_fonts_and_modes(self):
        scene = actions.set_text_presets(self.scene(), self.presets(), "time")
        scene = typography.add_time(scene)
        scene = typography.set_clock_source(scene, "time", "timeSeconds")
        scene = typography.set_seconds_size(scene, "time", "half")
        scene = actions.apply_text_preset(scene, "time", "time")
        scene = actions.copy_element(scene, "time")
        scene = typography.set_inheritance(scene, "time-copy", False)
        scene = typography.apply(scene, "time-copy", {**scene["elements"][1]["typography"], "family": "widget"})
        scene = typography.add_divider(scene)
        scene = typography.set_divider_symbol(scene, "divider", "/")
        scene = actions.apply_text_preset(scene, "divider", "time")
        presets = copy.deepcopy(scene["textPresets"])
        presets[0].update(size=45, width=110, thickness=1)
        changed = actions.set_text_presets(scene, presets, "time")
        self.assertEqual([e["height"] for e in changed["elements"]], [45, 45, 45])
        self.assertTrue(all(e["textPresetId"] == "time" for e in changed["elements"]))
        self.assertEqual(changed["elements"][0]["secondsSize"], "half")
        self.assertEqual(changed["elements"][1]["typography"]["family"], "widget")
        self.assertEqual(changed["elements"][2]["dividerSymbol"], "/")
        self.assertEqual(scene["elements"][0]["height"], 60)
        self.assertEqual(changed, model.validate_scene(changed))

    def test_detach_delete_and_manual_edits_preserve_numeric_values_without_stale_links(self):
        scene = actions.set_text_presets(self.scene(), self.presets(), "time")
        scene = typography.add_time(scene)
        scene = actions.apply_text_preset(scene, "time", "time")
        detached = actions.apply_text_preset(scene, "time", None)
        self.assertNotIn("textPresetId", detached["elements"][0])
        self.assertEqual(detached["elements"][0]["typography"], scene["elements"][0]["typography"])
        cleared = actions.set_text_presets(scene, [], None)
        self.assertNotIn("textPresetId", cleared["elements"][0])
        self.assertEqual(cleared["elements"][0]["typography"], scene["elements"][0]["typography"])
        manual = typography.apply(scene, "time", {**scene["elements"][0]["typography"], "size": 55})
        self.assertNotIn("textPresetId", manual["elements"][0])
        invalid = copy.deepcopy(scene)
        invalid["elements"][0]["textPresetId"] = "missing"
        with self.assertRaisesRegex(ValueError, "existing text preset"):
            model.validate_scene(invalid)
        with self.assertRaisesRegex(ValueError, "must match"):
            invalid = copy.deepcopy(scene)
            invalid["textPresets"][0]["size"] = 55
            model.validate_scene(invalid)

    def test_live_edit_failure_is_atomic_and_renaming_does_not_regenerate(self):
        from unittest.mock import patch
        scene = actions.set_text_presets(self.scene(), self.presets(), "time")
        scene = typography.add_time(scene)
        scene = actions.apply_text_preset(scene, "time", "time")
        scene = actions.copy_element(scene, "time")
        scene["elements"][1].update(source="hours", x=345, width=40)
        scene = model.validate_scene(scene)
        before = copy.deepcopy(scene)
        larger = copy.deepcopy(scene["textPresets"])
        larger[0].update(size=70, width=100)
        first_only = copy.deepcopy(scene)
        first_only["elements"] = first_only["elements"][:1]
        self.assertEqual(actions.set_text_presets(first_only, larger, "time")["elements"][0]["height"], 70)
        with self.assertRaises(ValueError):
            actions.set_text_presets(scene, larger, "time")
        self.assertEqual(scene, before)
        renamed = copy.deepcopy(scene["textPresets"])
        renamed[0]["name"] = "Renamed"
        with patch.object(typography, "generate", side_effect=AssertionError("No raster work for names")):
            changed = actions.set_text_presets(scene, renamed, "time")
        self.assertEqual(changed["elements"], scene["elements"])

    def test_linked_ring_updates_its_retained_typography_without_moving_outer_geometry(self):
        scene = actions.set_text_presets(self.scene(), self.presets(), "time")
        scene = typography.add_time(scene)
        scene = actions.apply_text_preset(scene, "time", "time")
        scene = typography.set_clock_source(scene, "time", "secondsRing")
        presets = copy.deepcopy(scene["textPresets"])
        presets[0]["size"] = 45
        changed = actions.set_text_presets(scene, presets, "time")
        ring = changed["elements"][0]
        self.assertEqual((ring["x"], ring["y"], ring["width"], ring["height"]), (0, 0, 416, 416))
        self.assertEqual(ring["typography"]["size"], 45)
        restored = typography.set_clock_source(changed, "time", "seconds")
        self.assertEqual(restored["elements"][0]["height"], 45)

    def test_live_update_reuses_identical_font_generation(self):
        from unittest.mock import patch
        scene = actions.set_text_presets(self.scene(), self.presets(), "time")
        scene = typography.add_time(scene)
        scene = actions.apply_text_preset(scene, "time", "time")
        for _ in range(4):
            scene = actions.copy_element(scene, "time")
        presets = copy.deepcopy(scene["textPresets"])
        presets[0]["size"] = 50
        with patch.object(typography, "generate", wraps=typography.generate) as generate:
            changed = actions.set_text_presets(scene, presets, "time")
        self.assertEqual(generate.call_count, 1)
        self.assertTrue(all(element["height"] == 50 for element in changed["elements"]))

    def test_repeated_live_size_edits_keep_the_same_integer_centre_anchor(self):
        scene = actions.set_text_presets(self.scene(), self.presets(), "time")
        scene = typography.add_time(scene)
        scene = actions.apply_text_preset(scene, "time", "time")
        original = scene["elements"][0]
        anchor = (original["x"] + original["width"]//2, original["y"] + original["height"]//2)
        for size in (49, 48, 51, 50) * 4:
            presets = copy.deepcopy(scene["textPresets"])
            presets[0]["size"] = size
            scene = actions.set_text_presets(scene, presets, "time")
            element = scene["elements"][0]
            self.assertEqual((element["x"] + element["width"]//2, element["y"] + element["height"]//2), anchor)
