"""Weather icons and solar graphs keep native geometry and live parent behaviour."""
import json
import re
import subprocess
import tempfile
import unittest

import designer_activity as activity
import designer_export as exporter
import designer_model as model
from designer_charts import chart_ops
from designer_weather import WEATHER_ICON_CONDITIONS
import test_designer_export as export_fixtures


class WeatherExportTests(unittest.TestCase):
    def scene(self, source, device="epix2pro47mm"):
        size = model.DEVICES[device]
        return dict(version=2, name="Weather icon", device=device, background=0, elements=[
            dict(id="icon", source=source, font="widget", x=size//2-16, y=size//2-16,
                 width=32, height=32, align="centre", colour=0xdceccf, nightColour=0x8d99ae, visible="both")])

    def project(self, scene, **options):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        project = export_fixtures.DesignerExportTests().project(temporary.name)
        exporter.prepare_scene_project(project, scene, **options)
        source = (project / "source/DesignerView.mc").read_text()
        rows = json.loads(re.search(r"private var _elements as Array<Array> = (.*);", source).group(1))
        return project, source, rows

    def test_each_native_variant_keeps_original_mask_geometry_and_day_night_colours(self):
        for device in model.DEVICES:
            for source in activity.ICON_VARIANTS:
                with self.subTest(device=device, source=source):
                    scene = self.scene(source, device)
                    project, code, rows = self.project(scene)
                    row = rows[0]
                    atlas_width = 32 * len(activity.ICON_VARIANTS[source])
                    resource = project / f"resources/designer-fonts/font-{row[1]}"
                    descriptor = resource.with_suffix(".fnt").read_text()
                    coverage = subprocess.check_output(["magick", str(resource.with_suffix(".png")), "-depth", "8", "gray:-"])
                    self.assertEqual(len(coverage), atlas_width * 32)
                    for index, name in enumerate(activity.ICON_VARIANTS[source]):
                        expected = set()
                        element = scene["elements"][0]
                        for operation in activity.icon_ops(element, name):
                            expected.update((x - element["x"], y - element["y"])
                                for x in range(operation["x"], operation["x"] + operation["width"])
                                for y in range(operation["y"], operation["y"] + operation["height"]))
                        actual = {(x, y) for y in range(32) for x in range(32)
                                  if coverage[y * atlas_width + index * 32 + x]}
                        self.assertEqual(actual, expected)
                        self.assertIn(f"char id={0xE200 + index} x={index * 32} y=0 width=32 height=32 xoffset=0 yoffset=0 xadvance=32", descriptor)
                    for night in (False, True):
                        colour = scene["elements"][0]["nightColour" if night else "colour"]
                        self.assertEqual(row[7 if night else 6], colour)
                        self.assertEqual(row[13 if night else 12], [])
                    self.assertIn("if (!_proof)", code)
                    self.assertIn("(57856 + index).toChar().toString()", code)
                    self.assertIn("dc.setColor(colour, Graphics.COLOR_TRANSPARENT);", code)
                    self.assertIn("dc.setClip(element[2], element[3], element[4], element[11]);", code)

    def test_icon_only_exports_subscribe_to_the_data_needed_for_live_variants(self):
        for source, complication in (("temperatureIcon", 38), ("sunriseSunsetIcon", 13)):
            with self.subTest(source=source):
                project, code, _ = self.project(self.scene(source))
                provider = (project / "source/EpixCanvasComplications.mc").read_text()
                self.assertIn(f"_slotTypes = [{complication}];", provider)
                self.assertIn("_snapshot.weatherCondition", code)
                self.assertIn("_snapshot.solarEventIsSunset ? 1 : 0", code)

    def test_original_weather_condition_groups_and_unknown_fallback_are_generated(self):
        _, code, _ = self.project(self.scene("temperatureIcon"))
        switch = code.split("private function weatherIconIndex", 1)[1].split("private function drawChart", 1)[0]
        conditions = [condition for group in WEATHER_ICON_CONDITIONS.values() for condition in group]
        self.assertEqual(len(conditions), len(set(conditions)))
        for icon, group in WEATHER_ICON_CONDITIONS.items():
            index = activity.ICON_VARIANTS["temperatureIcon"].index(icon)
            for condition in group:
                self.assertIn(f"case Weather.CONDITION_{condition}:", switch)
            final_case = f"case Weather.CONDITION_{group[-1]}:"
            self.assertRegex(switch.split(final_case, 1)[1], rf"^\s*return {index};")
        self.assertTrue(switch.rstrip().endswith("return 0;\n    }"))
        self.assertEqual(activity.ICON_VARIANTS["temperatureIcon"][0], "temperature")

    def test_proof_keeps_base_icon_and_static_icons_do_not_add_variant_rows(self):
        _, code, rows = self.project(self.scene("temperatureIcon"), proof=True)
        self.assertIn("private var _proof = true;", code)
        self.assertEqual(rows[0][12:14], [[], []])
        self.assertIn("var index = 0;\n            if (!_proof)", code)
        project, _, rows = self.project(self.scene("highLowIcon"))
        self.assertEqual(rows[0][22], [])
        self.assertIn("_slotTypes = [];", (project / "source/EpixCanvasComplications.mc").read_text())

    def test_daylight_is_centred_on_solar_noon_and_wraps_midnight(self):
        element = dict(source="solarTimeline", x=10, y=20, width=181, height=18,
                       colour=0xffffff, nightColour=0xaaaaaa)
        original = chart_ops(element, [6*3600, 18*3600, 12*3600])
        shifted = chart_ops(element, [8*3600, 20*3600, 14*3600])
        self.assertEqual(original, shifted)
        self.assertEqual(original[-1]["x"], element["x"] + element["width"]//2)
        wrapped = chart_ops(element, [20*3600, 4*3600, 0])
        self.assertEqual(wrapped[-1]["x"], element["x"] + element["width"]//2)
        for values in ([None, 18*3600, 0], [6*3600, None, 0], [6*3600, 6*3600, 0]):
            self.assertEqual(len(chart_ops(element, values)), 1)
        scene = self.scene("sunriseSunsetIcon")
        _, code, _ = self.project(scene)
        self.assertIn("var displayedSunrise = ((86400 - daylight) / 2).toNumber();", code)
        self.assertIn("now = (now + 43200 - solarNoon + 86400) % 86400;", code)

    def test_solar_rectangles_stay_inside_tiny_native_boxes(self):
        for width in (1, 2, 3, 5, 181):
            for height in (1, 2, 3, 18):
                element = dict(source="solarTimeline", x=10, y=20, width=width, height=height,
                               colour=0xffffff, nightColour=0xaaaaaa)
                for values in ([21600, 64800, 43200], [72000, 14400, 0], [21600, 21600, 0], [None, None, 0]):
                    for night in (False, True):
                        with self.subTest(width=width, height=height, values=values, night=night):
                            operations = chart_ops(element, values, night=night)
                            for operation in operations:
                                self.assertGreater(operation["width"], 0)
                                self.assertGreater(operation["height"], 0)
                                self.assertGreaterEqual(operation["x"], element["x"])
                                self.assertGreaterEqual(operation["y"], element["y"])
                                self.assertLessEqual(operation["x"] + operation["width"], element["x"] + width)
                                self.assertLessEqual(operation["y"] + operation["height"], element["y"] + height)
        _, code, _ = self.project(self.scene("sunriseSunsetIcon"))
        self.assertIn("var daylightTop = middle > 0 ? middle - 1 : 0;", code)
        self.assertIn("var daylightBottom = middle + 2 < boxHeight ? middle + 2 : boxHeight;", code)
        self.assertIn("if (end > start && daylightBottom > daylightTop)", code)


if __name__ == "__main__":
    unittest.main()
