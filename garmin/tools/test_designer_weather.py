"""Weather and solar parts reuse the validated native data/icon/graph blueprint."""
import copy
import struct
import subprocess
import unittest

import bridge
import designer_activity as activity
import designer_model as model
import designer_typography as typography

WEATHER_GROUPS = {
    "temperature": ("temperatureIcon", "temperatureZones"),
    "highLow": ("highLowIcon", "temperatureZones"),
    "temperatureHigh": ("highLowIcon", None),
    "temperatureLow": ("highLowIcon", None),
    "sunriseSunset": ("sunriseSunsetIcon", "solarTimeline"),
}


class WeatherTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm"):
        return dict(version=2, name="Weather", device=device, background=0, edgeInset=16, elements=[])

    def test_weather_data_and_original_icons_add_as_atomic_linked_pairs_on_every_device(self):
        for device in model.DEVICES:
            for source, (icon_source, graph_source) in WEATHER_GROUPS.items():
                with self.subTest(device=device, source=source):
                    original = activity.add_activity(self.scene(device), "steps")
                    saved = copy.deepcopy(original)
                    mapped = bridge.dispatch(dict(operation="add", payload=dict(scene=original, source=source)))
                    value, icon = mapped["scene"]["elements"][-2:]
                    self.assertEqual(original, saved)
                    self.assertEqual(mapped["scene"]["elements"][:-2], saved["elements"])
                    self.assertEqual((value["source"], icon["source"]), (source, icon_source))
                    self.assertEqual(icon["activityId"], value["id"])
                    self.assertTrue(value["moveTogether"])
                    self.assertEqual(value["y"] - icon["y"] - icon["height"], 16)
                    self.assertEqual(model.validate_scene(mapped["scene"]), mapped["scene"])

    def test_graphs_are_sized_and_centred_by_role_instead_of_weekly_source_suffix(self):
        for device in model.DEVICES:
            for source in ("temperature", "highLow", "sunriseSunset"):
                with self.subTest(device=device, source=source):
                    scene = activity.add_activity(self.scene(device), source, {"graph": True})
                    value, icon, graph = scene["elements"]
                    self.assertEqual(graph["source"], WEATHER_GROUPS[source][1])
                    self.assertEqual((graph["width"], graph["height"]), (112, 24))
                    self.assertEqual(graph["activityId"], value["id"])
                    self.assertEqual(graph["y"] - value["y"] - value["height"], 16)
                    self.assertLessEqual(abs(icon["y"] + graph["y"] + graph["height"] - model.DEVICES[device]), 1)
                    self.assertEqual(activity.set_activity_graph(scene, icon["id"], True), scene)
                    without = activity.set_activity_graph(scene, graph["id"], False)
                    self.assertEqual(without["elements"], scene["elements"][:2])

    def test_value_only_icon_only_graph_only_and_typography_use_existing_controls(self):
        for source, (icon_source, graph_source) in WEATHER_GROUPS.items():
            with self.subTest(source=source):
                value_only = activity.add_activity(self.scene(), source, {"icon": False})
                self.assertEqual([item["source"] for item in value_only["elements"]], [source])
                with_icon = activity.add_activity(value_only, source, {"value": False})
                self.assertEqual(with_icon["elements"][-1]["activityId"], value_only["elements"][0]["id"])
                styled = typography.apply(with_icon, with_icon["elements"][0]["id"],
                                          dict(family="widget", size=24, thickness=0, width=100, letterSpacing=1))
                self.assertEqual(styled["elements"][0]["typography"]["size"], 24)
                standalone = activity.add_activity(self.scene(), icon_source)
                self.assertNotIn("activityId", standalone["elements"][0])
                if graph_source is not None:
                    graph_only = activity.add_activity(self.scene(), source, {"value": False, "icon": False, "graph": True})
                    self.assertEqual([item["source"] for item in graph_only["elements"]], [graph_source])
                else:
                    with self.assertRaisesRegex(ValueError, "does not have"):
                        activity.add_activity(self.scene(), source, {"graph": True})

    def test_dynamic_icon_variants_keep_exact_original_native_masks_and_reject_paths(self):
        for source, variants in activity.ICON_VARIANTS.items():
            for variant in variants:
                with self.subTest(source=source, variant=variant):
                    data = (activity.ICON_DIRECTORY / f"{variant}.png").read_bytes()
                    width, height = struct.unpack(">II", data[16:24])
                    element = dict(source=source, x=0, y=0, width=width, height=height)
                    operations = activity.icon_ops(element, variant)
                    actual = {(op["x"]+x, op["y"]+y) for op in operations
                              for y in range(op["height"]) for x in range(op["width"])}
                    alpha = subprocess.check_output(["magick", "png:-", "-alpha", "extract", "-depth", "8", "gray:-"], input=data)
                    expected = {(x, y) for y in range(height) for x in range(width) if alpha[y*width+x] >= 128}
                    self.assertEqual(actual, expected)
            for invalid in ("../../outside", "/tmp/icon", "heart", ""):
                with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                    activity.icon_ops(dict(source=source, x=0, y=0, width=24, height=24), invalid)


if __name__ == "__main__":
    unittest.main()
