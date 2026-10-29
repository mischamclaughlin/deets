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

    def test_fitted_outer_tips_follow_clearance_and_keep_varied_lengths_on_every_watch(self):
        for device, size in model.DEVICES.items():
            scene = self.scene(device)
            element = scene["elements"][0]
            self.assertEqual(charts.ring_tick_radius(scene, element), size / 2)
            self.assertEqual(charts.ring_geometry(size), charts.ring_geometry(size, size / 2))
            element["ringTicksToCircumference"] = False
            self.assertEqual(charts.ring_tick_radius(scene, element), size / 2)
            self.assertEqual(min(y for _, y in self.pixels(charts.ring_geometry(size)[0])), 0)
            element["ringTicksToCircumference"] = True
            for inset in (16, 34, 49):
                scene["edgeInset"] = inset
                radius = charts.ring_tick_radius(scene, element)
                self.assertEqual(radius, size / 2 - inset)
                groups = charts.ring_geometry(size, radius)
                # The top tick starts on the clearance circle and extends 15 pixels inwards.
                self.assertEqual(min(y for _, y in self.pixels(groups[0])), inset)
                self.assertEqual(max(y for _, y in self.pixels(groups[0])) + 1, inset + 15)
                for index in range(60):
                    angle = index * math.pi / 30
                    radial = (math.sin(angle), -math.cos(angle))
                    projections = [(x+.5-size/2)*radial[0] + (y+.5-size/2)*radial[1]
                                   for x, y in self.pixels(groups[index])]
                    length = 15 if index % 15 == 0 else 11 if index % 5 == 0 else 7
                    self.assertAlmostEqual(max(projections), radius, delta=1)
                    self.assertAlmostEqual(max(projections)-min(projections), length, delta=2)
                self.assertEqual(len(groups), 60)
                expected = charts.chart_ops(element, ring_radius=radius)
                actual = bridge.layout({"scene": scene})["ops"]
                self.assertEqual(actual, [{**op, "colour": charts.device_colour(op["colour"])} for op in expected])
            scene["edgeInset"] = 0
            self.assertEqual(charts.ring_tick_radius(scene, element), size / 2)

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

    def test_export_tables_and_budget_distinguish_same_width_different_radii(self):
        scene = self.scene()
        scene["edgeInset"] = 34
        fitted = {**scene["elements"][0], "id": "fitted", "ringTicksToCircumference": True}
        scene["elements"].append(fitted)
        catalogue = {entry["id"]: entry for entry in exporter.CATALOG}
        signatures = {charts.ring_signature(scene, element) for element in scene["elements"]}
        self.assertEqual(signatures, {(416, 208, -1), (416, 174, -1)})
        expected = sum(exporter._ring_resource_cost(signature) for signature in signatures) + 160
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
                self.assertIn(f"{index} => " + exporter._mc(exporter._ring_positions(charts.ring_font(*signature)[0])), source)

    def test_stretched_ticks_keep_outer_tips_and_reach_clearance_on_every_watch(self):
        for device, size in model.DEVICES.items():
            scene = self.scene(device)
            element = scene["elements"][0]
            element["ringTicksStretchToCircumference"] = True
            for inset in (16, 34, 49):
                scene["edgeInset"] = inset
                outer = charts.ring_tick_radius(scene, element)
                inner = charts.ring_tick_inner_radius(scene, element)
                self.assertEqual(outer, size/2)
                self.assertEqual(inner, size/2 - inset)
                groups = charts.ring_geometry(*charts.ring_signature(scene, element))
                self.assertEqual(len(groups), 60)
                self.assertEqual(min(y for _, y in self.pixels(groups[0])), 0)
                self.assertEqual(max(y for _, y in self.pixels(groups[0])) + 1, inset)
                self.assertEqual(len({x for x, _ in self.pixels(groups[0])}), 6)
                for index in range(60):
                    angle = index * math.pi / 30
                    radial = math.sin(angle), -math.cos(angle)
                    projections = [(x+.5-size/2)*radial[0] + (y+.5-size/2)*radial[1]
                                   for x, y in self.pixels(groups[index])]
                    self.assertAlmostEqual(max(projections), outer, delta=1)
                    self.assertAlmostEqual(min(projections), inner, delta=1)
                expected = charts.chart_ops(element, ring_radius=outer, ring_inner_radius=inner)
                actual = bridge.layout({"scene": scene})["ops"]
                self.assertEqual(actual, [{**op, "colour": charts.device_colour(op["colour"])} for op in expected])
            scene["edgeInset"] = 0
            self.assertEqual(charts.ring_tick_inner_radius(scene, element), charts.ring_tick_radius(scene, element))
            self.assertTrue(all(not group for group in charts.ring_geometry(*charts.ring_signature(scene, element))))

    def test_stretch_mode_validation_and_preservation(self):
        scene = self.scene()
        scene["elements"][0]["ringTicksStretchToCircumference"] = True
        scene = typography.set_clock_source(scene, "time", "seconds")
        scene = typography.set_watch_font(scene, "widget")
        scene = typography.set_clock_source(scene, "time", "secondsRing")
        self.assertTrue(scene["elements"][0]["ringTicksStretchToCircumference"])
        for value in (None, 0, 1, "yes", []):
            invalid = copy.deepcopy(scene)
            invalid["elements"][0]["ringTicksStretchToCircumference"] = value
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "circumference"):
                model.validate_scene(invalid)
        invalid = copy.deepcopy(scene)
        invalid["elements"][0]["ringTicksToCircumference"] = True
        with self.assertRaisesRegex(ValueError, "not both"):
            model.validate_scene(invalid)
        invalid = self.scene()
        invalid["elements"][0].pop("inheritFont", None)
        invalid["elements"][0].update(source="label", font="widget", height=26, width=26, text=":", ringTicksStretchToCircumference=True)
        with self.assertRaisesRegex(ValueError, "circumference"):
            model.validate_scene(invalid)

    def test_stretched_geometry_has_distinct_export_tables_and_budget(self):
        scene = self.scene()
        scene["edgeInset"] = 34
        original = scene["elements"][0]
        scene["elements"].extend([
            {**original, "id": "aligned", "ringTicksToCircumference": True},
            {**original, "id": "stretched", "ringTicksStretchToCircumference": True},
        ])
        catalogue = {entry["id"]: entry for entry in exporter.CATALOG}
        signatures = {charts.ring_signature(scene, element) for element in scene["elements"]}
        self.assertEqual(signatures, {(416, 208, -1), (416, 174, -1), (416, 208, 174)})
        expected = sum(exporter._ring_resource_cost(signature) for signature in signatures) + 240
        self.assertEqual(exporter._resource_cost(scene, model.scene_font_pack(scene), catalogue, {}, {}, False), expected)
        with tempfile.TemporaryDirectory() as directory, patch.object(exporter, "RESOURCE_BUDGET", 1_000_000):
            project = Path(directory)
            shutil.copytree(model.ROOT/"source", project/"source")
            shutil.copytree(model.ROOT/"resources", project/"resources")
            shutil.copy2(model.ROOT/"manifest.xml", project/"manifest.xml")
            exporter.prepare_scene_project(project, scene)
            source = (project/"source/DesignerView.mc").read_text()
            for index, signature in enumerate(sorted(signatures)):
                self.assertIn(f"{index} => " + exporter._mc(exporter._ring_positions(charts.ring_font(*signature)[0])), source)
