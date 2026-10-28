"""Colour channels can be custom or linked to reusable live RGB presets."""
import copy
import unittest

import bridge
import designer_actions as actions
import designer_colours as colours
import designer_model as model
import designer_typography as typography
from designer_charts import device_colour


class ColourTests(unittest.TestCase):
    def scene(self):
        scene = {"version": 2, "name": "Colours", "device": "epix2pro47mm", "background": 0,
                 "edgeInset": 16, "elements": []}
        return typography.add_time(scene)

    def presets(self):
        return [{"id": "accent", "name": "Accent", "colour": 0xA15DCF},
                {"id": "quiet", "name": "Quiet", "colour": 0x123456}]

    def test_live_updates_cover_both_channels_and_copied_links_without_changing_geometry(self):
        original = self.scene()
        scene = actions.set_colour_presets(original, self.presets())
        self.assertEqual(scene["elements"], original["elements"])
        scene = actions.set_element_colour_preset(scene, "time", "day", "accent")
        scene = actions.set_element_colour_preset(scene, "time", "night", "accent")
        scene = actions.copy_element(scene, "time")
        before = copy.deepcopy(scene)
        presets = self.presets()
        presets[0].update(name="Main", colour=0xFEDCBA)
        changed = actions.set_colour_presets(scene, presets)
        self.assertEqual(scene, before)
        for element in changed["elements"]:
            self.assertEqual(element["colour"], 0xFEDCBA)
            self.assertEqual(element["nightColour"], 0xFEDCBA)
            self.assertEqual(element["colourPresetId"], "accent")
            self.assertEqual(element["nightColourPresetId"], "accent")
        for old, new in zip(before["elements"], changed["elements"]):
            self.assertEqual({k: v for k, v in old.items() if k not in {"colour", "nightColour"}},
                             {k: v for k, v in new.items() if k not in {"colour", "nightColour"}})

    def test_custom_and_null_detach_only_the_selected_channel(self):
        scene = actions.set_colour_presets(self.scene(), self.presets())
        scene = actions.set_element_colour_preset(scene, "time", "day", "accent")
        scene = actions.set_element_colour_preset(scene, "time", "night", "quiet")
        scene = actions.set_element_colour(scene, "time", "day", 0x010203)
        self.assertNotIn("colourPresetId", scene["elements"][0])
        self.assertEqual(scene["elements"][0]["nightColourPresetId"], "quiet")
        scene = actions.set_element_colour_preset(scene, "time", "night", None)
        self.assertNotIn("nightColourPresetId", scene["elements"][0])
        self.assertEqual(scene["elements"][0]["nightColour"], 0x123456)
        changed = actions.set_colour_presets(scene, [{"id": "quiet", "name": "Quiet", "colour": 0}])
        self.assertEqual(changed["elements"], scene["elements"])

    def test_deleting_presets_keeps_last_appearance_and_other_channels_linked(self):
        scene = actions.set_colour_presets(self.scene(), self.presets())
        scene = actions.set_element_colour_preset(scene, "time", "day", "accent")
        scene = actions.set_element_colour_preset(scene, "time", "night", "quiet")
        changed = actions.set_colour_presets(scene, [self.presets()[1]])
        element = changed["elements"][0]
        self.assertNotIn("colourPresetId", element)
        self.assertEqual(element["colour"], 0xA15DCF)
        self.assertEqual(element["nightColourPresetId"], "quiet")
        empty = actions.set_colour_presets(changed, [])
        self.assertEqual(empty["colourPresets"], [])
        self.assertNotIn("nightColourPresetId", empty["elements"][0])
        self.assertEqual(empty["elements"][0]["nightColour"], 0x123456)

    def test_custom_and_preset_colours_reach_half_size_text_and_ring_shading(self):
        scene = self.scene()
        scene = typography.apply(scene, "time", {"family": "time", "size": 50, "thickness": 0, "width": 100, "letterSpacing": 1})
        scene = typography.set_clock_source(scene, "time", "timeSeconds")
        scene = typography.set_seconds_size(scene, "time", "half")
        scene = actions.set_colour_presets(scene, self.presets())
        scene = actions.set_element_colour_preset(scene, "time", "day", "accent")
        scene = actions.set_element_colour(scene, "time", "night", 0x0011FF)
        self.assertEqual({op["colour"] for op in bridge.layout({"scene": scene})["ops"]}, {device_colour(0xA15DCF)})
        night = bridge.layout({"scene": scene, "night": True})
        self.assertEqual(len(night["ops"]), 8)
        self.assertEqual({op["colour"] for op in night["ops"]}, {device_colour(0x0011FF)})
        ring = typography.set_clock_source(scene, "time", "secondsRing")
        self.assertEqual(ring["elements"][0]["colourPresetId"], "accent")
        self.assertIn(device_colour(0xA15DCF), {op["colour"] for op in bridge.layout({"scene": ring})["ops"]})

    def test_invalid_registries_and_rgb_values_are_strict_and_atomic(self):
        original = actions.set_colour_presets(self.scene(), self.presets())
        before = copy.deepcopy(original)
        invalid = [None, {}, self.presets() * 11,
                   [{**self.presets()[0], "id": "../bad"}],
                   [{**self.presets()[0], "name": " "}],
                   [{**self.presets()[0], "name": "x" * 41}],
                   [self.presets()[0], {**self.presets()[1], "name": " ACCENT "}],
                   [self.presets()[0], {**self.presets()[1], "id": "accent"}],
                   [{**self.presets()[0], "extra": 1}]]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                actions.set_colour_presets(original, value)
        for value in (True, False, -1, 0x1000000, 1.5, "#ffffff", None, []):
            with self.subTest(value=value), self.assertRaises(ValueError):
                actions.set_element_colour(original, "time", "day", value)
            with self.subTest(preset_value=value), self.assertRaises(ValueError):
                colours.colour_presets([{**self.presets()[0], "colour": value}])
        for channel in (None, [], "evening"):
            with self.assertRaises(ValueError):
                actions.set_element_colour(original, "time", channel, 0)
        for identity in (None, [], "missing"):
            with self.assertRaises(ValueError):
                actions.set_element_colour(original, identity, "day", 0)
        for identity in ([], "missing"):
            with self.assertRaises(ValueError):
                actions.set_element_colour_preset(original, "time", "day", identity)
        self.assertEqual(original, before)
        linked = actions.set_element_colour_preset(original, "time", "day", "accent")
        linked["elements"][0]["colour"] = 0
        with self.assertRaisesRegex(ValueError, "does not match"):
            model.validate_scene(linked)

    def test_bridge_operations_reject_missing_or_extra_fields(self):
        scene = self.scene()
        mapped = bridge.dispatch({"operation": "colour-presets", "payload": {"scene": scene, "presets": self.presets()}})
        linked = bridge.dispatch({"operation": "element-colour-preset", "payload": {"scene": mapped["scene"], "elementId": "time", "channel": "day", "presetId": "accent"}})
        custom = bridge.dispatch({"operation": "element-colour", "payload": {"scene": linked["scene"], "elementId": "time", "channel": "day", "colour": 0xABCDEF}})
        self.assertEqual(custom["scene"]["elements"][0]["colour"], 0xABCDEF)
        for operation, payload in (("colour-presets", {"scene": scene}),
                                   ("element-colour", {"scene": scene, "elementId": "time", "channel": "day"}),
                                   ("element-colour-preset", {"scene": scene, "elementId": "time", "channel": "day"}),
                                   ("element-colour", {"scene": scene, "elementId": "time", "channel": "day", "colour": 0, "extra": True})):
            with self.subTest(operation=operation), self.assertRaises(ValueError):
                bridge.dispatch({"operation": operation, "payload": payload})
