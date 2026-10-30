"""Document actions preserve native scene state and apply defaults explicitly."""
import copy
import unittest

import bridge
import designer_actions as actions
import designer_model as model
import designer_typography as typography
from test_designer_helpers import assert_fitted_box

DEFAULTS = {"size": 48, "thickness": 1, "width": 105, "letterSpacing": 2}


class DocumentActionsTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm"):
        return {"version": 2, "name": "Actions", "device": device, "background": 0,
                "edgeInset": 16, "elements": []}

    def test_defaults_save_without_resizing_and_new_text_uses_them_on_every_watch(self):
        for device in model.DEVICES:
            original = typography.add_time(self.scene(device))
            before = copy.deepcopy(original)
            changed = actions.set_text_defaults(original, DEFAULTS)
            self.assertEqual(original, before)
            self.assertEqual(changed["elements"], original["elements"])
            self.assertEqual(changed["textDefaults"], DEFAULTS)
            for added in (typography.add_time(changed), typography.add_divider(changed)):
                element = added["elements"][-1]
                self.assertEqual(element["typography"], {"family": "time", **DEFAULTS})
                assert_fitted_box(self, added, element)
                self.assertTrue(element["inheritFont"])
                self.assertEqual(bridge.layout({"scene": added})["scene"], added)
            self.assertEqual(typography.scene_text_defaults(original)["size"], model.font_pack(device)["fonts"]["time"]["height"])

    def test_apply_defaults_preserves_custom_families_and_clock_and_divider_settings(self):
        scene = typography.add_time(self.scene())
        scene = typography.set_clock_source(scene, "time", "timeSeconds")
        scene = typography.set_seconds_size(scene, "time", "half")
        scene = typography.set_inheritance(scene, "time", False)
        scene = typography.apply(scene, "time", {"family": "widget", "size": 55, "thickness": 0, "width": 100, "letterSpacing": 1})
        scene = typography.add_divider(scene)
        scene = typography.set_divider_symbol(scene, "divider", "/")
        scene["elements"][1]["dividerPosition"] = "bottom"
        scene = actions.set_text_defaults(scene, DEFAULTS)
        before = copy.deepcopy(scene)
        clock = actions.apply_text_defaults(scene, "time")["elements"][0]
        self.assertEqual(clock["typography"], {"family": "widget", **DEFAULTS})
        self.assertFalse(clock["inheritFont"])
        self.assertEqual(clock["source"], "timeSeconds")
        self.assertEqual(clock["secondsSize"], "half")
        divider = actions.apply_text_defaults(scene, "divider")["elements"][1]
        self.assertEqual(divider["dividerSymbol"], "/")
        self.assertEqual(divider["dividerPosition"], "bottom")
        self.assertEqual(divider["typography"], {"family": "time", **DEFAULTS})
        self.assertTrue(divider["inheritFont"])
        self.assertEqual(scene, before)
        ring = typography.set_clock_source(typography.add_time(self.scene()), "time", "secondsRing")
        with self.assertRaisesRegex(ValueError, "text element"):
            actions.apply_text_defaults(ring, "time")

    def test_copy_is_deep_exact_and_inserted_after_original_with_bounded_unique_ids(self):
        original = typography.add_divider(typography.add_time(self.scene()))
        original = typography.set_divider_symbol(original, "divider", "|")
        original["elements"][1]["dividerPosition"] = "top"
        original["elements"][1]["id"] = "D" + "x" * 63
        identity = original["elements"][1]["id"]
        original = actions.set_text_defaults(original, DEFAULTS)
        before = copy.deepcopy(original)
        first = actions.copy_element(original, identity)
        duplicate = first["elements"][2]
        self.assertEqual({k: v for k, v in duplicate.items() if k != "id"}, {k: v for k, v in original["elements"][1].items() if k != "id"})
        self.assertRegex(duplicate["id"], r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
        second = actions.copy_element(first, identity)
        self.assertEqual(len({e["id"] for e in second["elements"]}), 4)
        self.assertEqual(second["elements"][1]["id"], identity)
        self.assertNotEqual(second["elements"][2]["id"], duplicate["id"])
        duplicate["typography"]["size"] = 99
        self.assertNotEqual(first["elements"][1]["typography"]["size"], 99)
        self.assertEqual(original, before)
        ring = typography.set_clock_source(typography.add_time(self.scene()), "time", "secondsRing")
        ring["elements"][0]["ringTicksStretchToCircumference"] = True
        copied_ring = actions.copy_element(ring, "time")
        self.assertTrue(copied_ring["elements"][1]["ringTicksStretchToCircumference"])
        self.assertEqual(copied_ring["elements"][1]["width"], 416)

    def test_delete_can_remove_the_last_element_and_copy_respects_limits(self):
        original = typography.add_time(self.scene())
        before = copy.deepcopy(original)
        deleted = actions.delete_element(original, "time")
        self.assertEqual(deleted["elements"], [])
        self.assertEqual(bridge.layout({"scene": deleted})["ops"], [])
        self.assertEqual(original, before)
        full = copy.deepcopy(original)
        full["elements"] = [{**original["elements"][0], "id": f"time-{i}"} for i in range(40)]
        with self.assertRaisesRegex(ValueError, "at most 40"):
            actions.copy_element(full, "time-0")
        for action in (actions.copy_element, actions.delete_element, actions.apply_text_defaults):
            for identity in (None, [], "missing"):
                with self.subTest(action=action.__name__, identity=identity), self.assertRaises(ValueError):
                    action(original, identity)

    def test_defaults_are_strict_and_failed_application_is_atomic(self):
        original = typography.add_time(self.scene())
        for defaults in (None, [], {}, {**DEFAULTS, "size": True}, {**DEFAULTS, "size": 161},
                         {**DEFAULTS, "thickness": 7}, {**DEFAULTS, "width": 49},
                         {**DEFAULTS, "letterSpacing": -5}, {**DEFAULTS, "family": "time"}):
            with self.subTest(defaults=defaults), self.assertRaises(ValueError):
                actions.set_text_defaults(original, defaults)
        oversized = actions.set_text_defaults(original, {**DEFAULTS, "size": 160, "width": 200})
        before = copy.deepcopy(oversized)
        with self.assertRaisesRegex(ValueError, "does not fit"):
            actions.apply_text_defaults(oversized, "time")
        self.assertEqual(oversized, before)

    def test_bridge_action_requests_are_strict_and_return_standard_mappings(self):
        original = typography.add_time(self.scene())
        for operation in ("copy-element", "delete-element", "apply-text-defaults"):
            for payload in ({"scene": original}, {"scene": original, "elementId": "time", "extra": True}):
                with self.subTest(operation=operation, payload=payload), self.assertRaises(ValueError):
                    bridge.dispatch({"operation": operation, "payload": payload})
        with self.assertRaises(ValueError):
            bridge.dispatch({"operation": "text-defaults", "payload": {"scene": original}})
        mapped = bridge.dispatch({"operation": "text-defaults", "payload": {"scene": original, "defaults": DEFAULTS}})
        applied = bridge.dispatch({"operation": "apply-text-defaults", "payload": {"scene": mapped["scene"], "elementId": "time"}})
        copied = bridge.dispatch({"operation": "copy-element", "payload": {"scene": applied["scene"], "elementId": "time"}})
        self.assertEqual(len(copied["scene"]["elements"]), 2)
        deleted = bridge.dispatch({"operation": "delete-element", "payload": {"scene": copied["scene"], "elementId": "time"}})
        self.assertEqual(len(deleted["scene"]["elements"]), 1)
        self.assertEqual(deleted["scene"]["textDefaults"], DEFAULTS)
