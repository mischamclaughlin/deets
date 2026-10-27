"""Clock components share native glyph metrics, typography and export behaviour."""
import copy
from pathlib import Path
import shutil
import tempfile
import unittest

import bridge
import designer_model as model
import designer_typography as typography
import designer_export as exporter


def legacy_divider(scene, element_id):
    font = model.scene_font_pack(scene)["fonts"][next(e for e in scene["elements"] if e["id"] == element_id)["font"]]
    return typography._fit_clock(scene, element_id, font, source="divider")


SETTINGS = {"family": "time", "size": 70, "thickness": 1, "width": 110, "letterSpacing": -4}


class ClockModeTests(unittest.TestCase):
    def scene(self):
        return {"version": 2, "name": "Clock modes", "device": "epix2pro47mm", "background": 0, "edgeInset": 16,
            "elements": [{"id": "clock", "source": "time", "font": "time", "x": 88, "y": 164,
                "width": 240, "height": 88, "align": "centre", "colour": 0xdceccf, "nightColour": 0x8d99ae, "visible": "both"}]}

    def test_modes_preserve_identity_font_centre_and_input(self):
        original = self.scene()
        before = copy.deepcopy(original)
        widths = {}
        for source, sample in (("time", "10:08"), ("hours", "10"), ("minutes", "08"), ("seconds", "23")):
            with self.subTest(source=source):
                changed = typography.set_clock_source(original, "clock", source)
                element = changed["elements"][0]
                widths[source] = element["width"]
                self.assertEqual(element["id"], "clock")
                self.assertEqual(element["font"], "time")
                self.assertEqual(element["source"], source)
                self.assertLessEqual(abs(element["x"] + element["width"] / 2 - 208), 0.5)
                self.assertEqual(element["y"] + element["height"] / 2, 208)
                self.assertEqual(element["height"], 88)
                layout = bridge.layout({"scene": changed})
                self.assertEqual(len(layout["ops"]), len(sample))
                expected = model.render_text_ops(changed, {source: sample})
                self.assertEqual(layout["ops"], [{**operation, "colour": bridge.device_colour(operation["colour"])}
                    for operation in expected])
        self.assertLess(widths["hours"], widths["time"])
        self.assertLess(widths["minutes"], widths["time"])
        self.assertEqual(original, before)

    def test_every_component_value_fits_native_bounds(self):
        for generated in (False, True):
            scene = typography.apply(self.scene(), "clock", SETTINGS) if generated else self.scene()
            for source in ("time", "hours", "minutes", "seconds"):
                changed = typography.set_clock_source(scene, "clock", source)
                element = changed["elements"][0]
                font = model.scene_font_pack(changed)["fonts"][element["font"]]
                for text in typography._clock_values(source):
                    operations = model.layout_text(text, element, font)
                    self.assertEqual([op["width"] for op in operations],
                        [font["glyphs"][str(ord(char))]["width"] for char in text])

    def test_generated_font_survives_mode_changes_and_typography_can_be_edited_again(self):
        scene = typography.apply(self.scene(), "clock", SETTINGS)
        for source in ("hours", "minutes", "seconds", "time"):
            changed = typography.set_clock_source(scene, "clock", source)
            self.assertEqual(changed["elements"][0]["typography"], SETTINGS)
            self.assertEqual(changed["elements"][0]["font"], scene["elements"][0]["font"])
            edited = typography.apply(changed, "clock", {**SETTINGS, "size": 75})
            self.assertEqual(edited["elements"][0]["source"], source)
            self.assertEqual(edited["elements"][0]["height"], 75)
            self.assertEqual(len(bridge.layout({"scene": edited})["ops"]), 5 if source == "time" else 1 if source == "divider" else 2)

    def test_strict_bridge_clock_requests_and_stale_mapping_rejection(self):
        scene = self.scene()
        for payload in ({"scene": scene, "elementId": "clock"},
                        {"scene": scene, "elementId": "clock", "source": "hours", "extra": True}):
            with self.assertRaisesRegex(ValueError, "clock display"):
                bridge.dispatch({"operation": "clock", "payload": payload})
        for source in ("date", None, [], "../../outside"):
            with self.subTest(source=source), self.assertRaisesRegex(ValueError, "hours only"):
                typography.set_clock_source(scene, "clock", source)
        with self.assertRaisesRegex(ValueError, "Select a time element"):
            typography.set_clock_source(scene, "missing", "hours")
        mapped = bridge.dispatch({"operation": "clock", "payload": {"scene": scene, "elementId": "clock", "source": "hours"}})
        self.assertEqual(mapped["scene"]["elements"][0]["source"], "hours")
        with self.assertRaisesRegex(ValueError, "render the canvas again"):
            bridge.compile_scene({"scene": mapped["scene"], "mapping": bridge.mapping(scene)})

    def test_expanding_to_full_time_rejects_non_fitting_layout_without_mutation(self):
        scene = typography.set_clock_source(self.scene(), "clock", "minutes")
        scene["elements"][0]["x"] = 30
        scene = model.validate_scene(scene)
        before = copy.deepcopy(scene)
        with self.assertRaisesRegex(ValueError, "does not fit"):
            typography.set_clock_source(scene, "clock", "time")
        self.assertEqual(scene, before)


    def test_add_time_creates_unique_independent_clocks_from_native_metrics(self):
        for device in model.DEVICES:
            with self.subTest(device=device):
                original = self.scene()
                original.update(device=device, elements=[])
                before = copy.deepcopy(original)
                added = typography.add_time(original)
                second = typography.add_time(added)
                self.assertEqual(original, before)
                self.assertEqual([element["id"] for element in second["elements"]], ["time", "time-2"])
                self.assertEqual(second["elements"][0], added["elements"][0])
                self.assertEqual(len(bridge.layout({"scene": second})["ops"]), 10)
                for element in second["elements"]:
                    self.assertEqual(element["source"], "time")
                    self.assertEqual(element["font"], "time")
                    self.assertLessEqual(abs(element["x"] + element["width"] / 2 - model.DEVICES[device] / 2), 0.5)
                changed = typography.set_clock_source(second, "time-2", "hours")
                self.assertEqual(changed["elements"][0], second["elements"][0])
                self.assertEqual(changed["elements"][1]["source"], "hours")

    def test_add_rejects_element_limit_and_non_fitting_boundary(self):
        scene = self.scene()
        scene["elements"] = [{**scene["elements"][0], "id": f"clock-{index}"} for index in range(40)]
        with self.assertRaisesRegex(ValueError, "at most 40"):
            typography.add_time(scene)
        scene.update(elements=[], edgeInset=200)
        with self.assertRaisesRegex(ValueError, "cannot fit"):
            typography.add_time(scene)
        with self.assertRaisesRegex(ValueError, "supported element"):
            bridge.dispatch({"operation": "add", "payload": {"scene": self.scene(), "source": "date"}})

    def test_divider_inherits_watch_font_and_exports_a_literal_colon(self):
        scene = legacy_divider(self.scene(), "clock")
        scene = typography.set_watch_font(scene, "widget")
        element = scene["elements"][0]
        self.assertTrue(element["inheritFont"])
        self.assertEqual(element["typography"]["family"], "widget")
        self.assertEqual(len(bridge.layout({"scene": scene})["ops"]), 1)
        self.assertEqual(exporter._element_codes(element, model.SOURCES, False), {ord(":"), ord("?")})
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            shutil.copytree(model.ROOT / "source", project / "source")
            shutil.copytree(model.ROOT / "resources", project / "resources")
            shutil.copy2(model.ROOT / "manifest.xml", project / "manifest.xml")
            exporter.prepare_scene_project(project, scene)
            source = (project / "source/DesignerView.mc").read_text()
            self.assertIn('source.equals("divider")', source)


    def test_divider_position_aligns_native_and_generated_ink_without_changing_its_box(self):
        for device in model.DEVICES:
            for generated in (False, True):
                original = self.scene()
                original.update(device=device, elements=[])
                original = typography.add_time(original)
                if generated:
                    original = typography.apply(original, "time", SETTINGS)
                original = legacy_divider(original, "time")
                element = original["elements"][0]
                font = model.scene_font_pack(original)["fonts"][element["font"]]
                glyph = font["glyphs"][str(ord(":"))]
                spare = element["height"] - glyph["height"]
                for position, offset in (("top", 0), ("middle", spare // 2), ("bottom", spare)):
                    with self.subTest(device=device, generated=generated, position=position):
                        scene = copy.deepcopy(original)
                        scene["elements"][0]["dividerPosition"] = position
                        mapped = bridge.layout({"scene": scene})
                        self.assertEqual(mapped["scene"], scene)
                        self.assertEqual(mapped["areas"][0]["y"], element["y"])
                        self.assertEqual(mapped["areas"][0]["height"], element["height"])
                        operation, = mapped["ops"]
                        self.assertEqual(operation["y"], element["y"] + offset)
                        self.assertEqual(operation["height"], glyph["height"])
                        self.assertEqual(operation["sy"], glyph["y"])
                        self.assertEqual(operation["width"], glyph["width"])
                middle = copy.deepcopy(original)
                middle["elements"][0]["dividerPosition"] = "middle"
                self.assertEqual(bridge.layout({"scene": original})["ops"], bridge.layout({"scene": middle})["ops"])

    def test_divider_position_survives_font_size_and_source_edits(self):
        scene = legacy_divider(self.scene(), "clock")
        scene["elements"][0]["dividerPosition"] = "bottom"
        scene = typography.set_watch_font(scene, "widget")
        scene = typography.apply(scene, "clock", {**SETTINGS, "size": 55})
        scene = typography.set_divider_symbol(scene, "clock", ".")
        self.assertEqual(scene["elements"][0]["dividerPosition"], "bottom")
        scene = typography.set_divider_symbol(scene, "clock", ":")
        operation, = bridge.layout({"scene": scene})["ops"]
        self.assertEqual(operation["y"] + operation["height"], scene["elements"][0]["y"] + 55)
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            shutil.copytree(model.ROOT / "source", project / "source")
            shutil.copytree(model.ROOT / "resources", project / "resources")
            shutil.copy2(model.ROOT / "manifest.xml", project / "manifest.xml")
            exporter.prepare_scene_project(project, scene)
            source = (project / "source/DesignerView.mc").read_text()
            self.assertIn('element[0].equals("divider")', source)
            self.assertIn('if (element[16] == 2) { glyphY += spare; }', source)
            self.assertIn('operations.add([pen, glyphY, code]);', source)

    def test_divider_position_rejects_invalid_values_and_non_clock_sources(self):
        for value in (None, True, 1, [], "centre", "elsewhere"):
            scene = self.scene()
            scene["elements"][0]["dividerPosition"] = value
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "divider position"):
                model.validate_scene(scene)
        scene = self.scene()
        scene["elements"][0].update(source="label", font="widget", height=26, text=":", dividerPosition="top")
        with self.assertRaisesRegex(ValueError, "divider position"):
            model.validate_scene(scene)


    def test_seconds_ring_uses_physical_screen_and_restores_numeric_metrics(self):
        for device, size in model.DEVICES.items():
            for generated in (False, True):
                scene = self.scene()
                scene.update(device=device, elements=[])
                scene = typography.add_time(scene)
                if generated:
                    scene = typography.apply(scene, "time", SETTINGS)
                scene = typography.set_clock_source(scene, "time", "seconds")
                before = copy.deepcopy(scene)
                font = before["elements"][0]["font"]
                ring = typography.set_clock_source(scene, "time", "secondsRing")
                self.assertEqual(scene, before)
                element = ring["elements"][0]
                self.assertEqual((element["x"], element["y"], element["width"], element["height"]), (0, 0, size, size))
                self.assertEqual(element["font"], font)
                ring["edgeInset"] = size // 2 - 1
                self.assertEqual(model.validate_scene(ring), ring)
                self.assertEqual(typography.set_clock_source(ring, "time", "secondsRing"), ring)
                ring["edgeInset"] = 16
                restored = typography.set_clock_source(ring, "time", "seconds")
                self.assertEqual({k: v for k, v in restored["elements"][0].items() if k not in {"x", "y"}},
                    {k: v for k, v in before["elements"][0].items() if k not in {"x", "y"}})
                for axis, extent in (("x", "width"), ("y", "height")):
                    self.assertLessEqual(abs(restored["elements"][0][axis] + restored["elements"][0][extent]/2 - size/2), 0.5)
                self.assertEqual(len(bridge.layout({"scene": restored})["ops"]), 2)

    def test_ring_font_edits_preserve_outer_geometry_and_numeric_settings(self):
        scene = typography.set_clock_source(self.scene(), "clock", "secondsRing")
        scene["elements"][0]["dividerPosition"] = "bottom"
        for changed in (typography.set_watch_font(scene, "widget"),
                        typography.apply(scene, "clock", {**SETTINGS, "size": 55}),
                        typography.set_inheritance(scene, "clock", True)):
            element = changed["elements"][0]
            self.assertEqual((element["x"], element["y"], element["width"], element["height"]), (0, 0, 416, 416))
            self.assertEqual(element["dividerPosition"], "bottom")
            text = typography.set_clock_source(changed, "clock", "seconds")
            self.assertEqual(text["elements"][0]["height"], element["typography"]["size"])
            self.assertTrue(element["inheritFont"])
        custom = typography.set_inheritance(scene, "clock", False)
        custom = typography.apply(custom, "clock", {**SETTINGS, "family": "widget", "size": 55})
        changed = typography.set_watch_font(custom, "time")
        self.assertEqual(changed["elements"], custom["elements"])

    def test_ring_geometry_rejects_shapes_outside_the_physical_screen(self):
        scene = typography.set_clock_source(self.scene(), "clock", "secondsRing")
        scene["elements"][0].update(x=0, y=0, width=200, height=200)
        with self.assertRaisesRegex(ValueError, "physical watch circumference"):
            model.validate_scene(scene)
        scene["elements"][0].update(x=108, y=108)
        self.assertEqual(model.validate_scene(scene), scene)
        scene["elements"][0]["height"] = 199
        with self.assertRaisesRegex(ValueError, "square"):
            model.validate_scene(scene)
