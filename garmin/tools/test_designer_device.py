"""Target watch conversions preserve styles and reject partial results."""
import copy
import unittest

from designer_device import convert_device
from designer_model import DEVICES, validate_scene
from designer_typography import add_time, set_clock_source, add_data_text, element_settings


def blank(device="epix2pro47mm"):
    return {"version": 2, "name": "Device conversion", "device": device, "background": 0,
            "edgeInset": 16, "elements": []}


class DeviceTests(unittest.TestCase):
    def test_blank_and_generated_fonts_convert_to_every_device(self):
        original = add_data_text(add_time(blank()), "label")
        before = copy.deepcopy(original)
        for device in DEVICES:
            result = convert_device(original, device)
            self.assertEqual(result["device"], device)
            self.assertEqual(result, validate_scene(result))
            for element, previous in zip(result["elements"], original["elements"]):
                if device != original["device"]:
                    self.assertEqual(element["typography"], element_settings(previous, original["device"]))
                self.assertEqual(element["colour"], previous["colour"])
                self.assertEqual(element["text"], previous["text"]) if "text" in previous else None
        self.assertEqual(original, before)

    def test_ring_tracks_physical_screen(self):
        original = add_time(blank())
        ring = set_clock_source(original, original["elements"][0]["id"], "secondsRing")
        for device, size in DEVICES.items():
            result = convert_device(ring, device)
            self.assertEqual(result["elements"][0]["width"], size)
            self.assertEqual(result["elements"][0]["x"], 0)

    def test_fixed_box_keeps_native_dimensions_and_smaller_target_rejects_atomically(self):
        original = add_time(blank("epix2pro51mm"))
        original["elements"][0].update(x=77, y=217, width=300, height=20, boxSizing="fixed")
        original = validate_scene(original)
        before = copy.deepcopy(original)
        converted = convert_device(original, "epix2pro47mm")
        self.assertEqual(converted["elements"][0]["width"], 300)
        self.assertEqual(converted["elements"][0]["height"], 20)
        original["elements"][0].update(x=27, y=217, width=400)
        original = validate_scene(original)
        before = copy.deepcopy(original)
        with self.assertRaisesRegex(ValueError, "does not fit"):
            convert_device(original, "epix2pro42mm")
        self.assertEqual(original, before)

    def test_unknown_targets_are_rejected(self):
        for device in ("../epix2pro47mm", "__proto__", None, 390):
            with self.assertRaises(ValueError):
                convert_device(blank(), device)


if __name__ == "__main__":
    unittest.main()
