"""Fitted seconds ticks share native geometry and follow the content guide."""
import copy
import math
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import bridge
import designer_charts as charts
import designer_export as exporter
import designer_model as model
import designer_typography as typography
import test_designer_clock as fixtures


class RingFitTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm"):
        scene = fixtures.ClockModeTests().scene()
        scene.update(device=device, elements=[])
        scene = typography.add_time(scene)
        return typography.set_clock_source(scene, "time", "secondsRing")

    def pixels(self, group):
        return {(x+dx, y+dy) for packed in group
                for x, y, width, height in [charts.unpack_ring_rect(packed)]
                for dx in range(width) for dy in range(height)}

    def test_fitted_ticks_keep_ratios_and_follow_changed_guide_on_every_watch(self):
        for device, size in model.DEVICES.items():
            scene = self.scene(device)
            element = scene["elements"][0]
            self.assertEqual(charts.ring_tick_length(scene, element), 15)
            self.assertEqual(charts.ring_geometry(size), charts.ring_geometry(size, 15))
            element["ringTicksToCircumference"] = True
            for inset in (16, 34, 49):
                scene["edgeInset"] = inset
                length = charts.ring_tick_length(scene, element)
                self.assertEqual(length, inset - 4)
                groups = charts.ring_geometry(size, length)
                # The quarter-minute top tick has an exact integer inner edge at the guide.
                self.assertEqual(max(y for _, y in self.pixels(groups[0])) + 1, inset)
                for index, ratio in ((1, 7/15), (5, 11/15), (15, 1)):
                    angle = index * math.pi/30
                    radial = (math.sin(angle), -math.cos(angle))
                    projections = [(x+.5-size/2)*radial[0] + (y+.5-size/2)*radial[1]
                                   for x, y in self.pixels(groups[index])]
                    self.assertAlmostEqual(max(projections)-min(projections), length*ratio, delta=1.5)
                self.assertEqual(groups[60], charts.ring_geometry(size)[60])
                expected = charts.chart_ops(element, ring_length=length)
                actual = bridge.layout({"scene": scene})["ops"]
                self.assertEqual(actual, [{**op, "colour": charts.device_colour(op["colour"])} for op in expected])
            scene["edgeInset"] = 0
            self.assertEqual(charts.ring_tick_length(scene, element), 1)

    def test_fit_setting_survives_clock_edits_and_rejects_unsupported_values(self):
        scene = self.scene()
        scene["elements"][0]["ringTicksToCircumference"] = True
        scene = typography.set_clock_source(scene, "time", "seconds")
        scene = typography.set_watch_font(scene, "widget")
        scene = typography.set_clock_source(scene, "time", "secondsRing")
        self.assertTrue(scene["elements"][0]["ringTicksToCircumference"])
        for value in (None, 0, 1, "yes", []):
            invalid = copy.deepcopy(scene)
            invalid["elements"][0]["ringTicksToCircumference"] = value
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "circumference"):
                model.validate_scene(invalid)
        invalid = self.scene()
        invalid["elements"][0].pop("inheritFont", None)
        invalid["elements"][0].update(source="label", font="widget", height=26, width=26, text=":", ringTicksToCircumference=True)
        with self.assertRaisesRegex(ValueError, "circumference"):
            model.validate_scene(invalid)

    def test_export_tables_and_budget_distinguish_same_width_different_lengths(self):
        scene = self.scene()
        scene["edgeInset"] = 34
        fitted = {**scene["elements"][0], "id": "fitted", "ringTicksToCircumference": True}
        scene["elements"].append(fitted)
        catalogue = {entry["id"]: entry for entry in exporter.CATALOG}
        signatures = {charts.ring_signature(scene, element) for element in scene["elements"]}
        self.assertEqual(signatures, {(416, 15), (416, 30)})
        expected = sum(64 + sum(48+16*len(group) for group in charts.ring_geometry(*signature)) for signature in signatures) + 160
        self.assertEqual(exporter._resource_cost(scene, model.scene_font_pack(scene), catalogue, {}, {}, False), expected)
        with tempfile.TemporaryDirectory() as directory, patch.object(exporter, "RESOURCE_BUDGET", 1_000_000):
            project = Path(directory)
            shutil.copytree(model.ROOT/"source", project/"source")
            shutil.copytree(model.ROOT/"resources", project/"resources")
            shutil.copy2(model.ROOT/"manifest.xml", project/"manifest.xml")
            exporter.prepare_scene_project(project, scene)
            source = (project/"source/DesignerView.mc").read_text()
            self.assertIn("ringTicks(element[17])", source)
            for index, signature in enumerate(sorted(signatures)):
                self.assertIn(f"{index} => " + exporter._mc([list(group) for group in charts.ring_geometry(*signature)]), source)
