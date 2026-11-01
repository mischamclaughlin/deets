"""Optional text fills share native geometry, visibility and layer ownership."""
import base64
import copy
import json
import re
import tempfile
import unittest

import bridge
import designer_export as exporter
import designer_model as model
from designer_charts import device_colour
from designer_typography import _raw
import test_designer_export as fixtures


class TextBackgroundTests(unittest.TestCase):
    def scene(self):
        base = dict(font="widget", x=168, y=178, width=80, height=60,
                    align="centre", colour=0xff0000, nightColour=0x0000ff,
                    visible="both", boxSizing="fixed")
        return dict(version=2, name="Text backgrounds", device="epix2pro47mm", background=0,
                    elements=[dict(base, id="back", source="label", text="BACK"),
                              dict(base, id="front", source="label", text="TOP", colour=0x00ff00)])

    def test_legacy_transparency_and_independent_optional_rgb_values(self):
        scene = self.scene()
        self.assertEqual(model.validate_scene(scene), scene)
        self.assertFalse(any(op["kind"] == "rect" for op in model.render_text_ops(scene)))
        for day, night in ((0, None), (None, 0), (0xFFFFFF, 0x123456)):
            edited = copy.deepcopy(scene)
            for key, value in (("backgroundColour", day), ("nightBackgroundColour", night)):
                if value is not None:
                    edited["elements"][-1][key] = value
            self.assertEqual(model.validate_scene(edited), edited)
            for low_power, value in ((False, day), (True, night)):
                fills = [op for op in model.render_text_ops(edited, night=low_power) if op["kind"] == "rect"]
                self.assertEqual(len(fills), int(value is not None))
                if fills:
                    self.assertEqual(fills[0]["colour"], value)

    def test_backgrounds_reject_invalid_rgb_types_and_non_text_sources(self):
        for key in ("backgroundColour", "nightBackgroundColour"):
            for value in (None, True, False, -1, 0x1000000, 1.5, "#ffffff", [], {}):
                scene = self.scene()
                scene["elements"][-1][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    model.validate_scene(scene)
            for source in ("stepsIcon", "stepsWeek", "secondsRing"):
                scene = self.scene()
                scene["elements"] = [{**scene["elements"][0], "source": source, key: 0}]
                with self.subTest(key=key, source=source), self.assertRaisesRegex(ValueError, "Only text"):
                    model.validate_scene(scene)

    def test_fills_precede_own_glyphs_and_follow_layer_visibility_and_quantisation(self):
        scene = self.scene()
        front = scene["elements"][-1]
        front.update(backgroundColour=0x123456, nightBackgroundColour=0x765432)
        for night in (False, True):
            for visible in ("both", "day", "night"):
                front["visible"] = visible
                mapped = bridge.layout({"scene": scene, "night": night})
                own = [op for op in mapped["ops"] if op["elementId"] == "front"]
                if visible == ("day" if night else "night"):
                    self.assertEqual(own, [])
                    continue
                self.assertEqual(own[0], dict(kind="rect", elementId="front", x=168, y=178,
                                             width=80, height=60,
                                             colour=device_colour(front["nightBackgroundColour" if night else "backgroundColour"])))
                self.assertTrue(all(op["kind"] == "bitmap" for op in own[1:]))
                self.assertEqual(mapped["ops"][-len(own):], own)
                self.assertNotEqual(mapped["mapping"], bridge.layout({"scene": self.scene(), "night": night})["mapping"])

    @staticmethod
    def pixels(mapping):
        masks = {key: _raw(base64.b64decode(value.split(",", 1)[1])) for key, value in mapping["assets"].items()}
        pixels = {}
        for operation in mapping["ops"]:
            for dy in range(operation["height"]):
                for dx in range(operation["width"]):
                    alpha = 255
                    if operation["kind"] == "bitmap":
                        width, _, coverage = masks[operation["font"]]
                        alpha = coverage[(operation["sy"] + dy) * width + operation["sx"] + dx]
                    if not alpha:
                        continue
                    point = (operation["x"] + dx, operation["y"] + dy)
                    underneath = pixels.get(point, mapping["background"])
                    pixels[point] = sum(round((((operation["colour"] >> shift) & 255) * alpha
                                               + ((underneath >> shift) & 255) * (255 - alpha)) / 255) << shift
                                        for shift in (16, 8, 0))
        return pixels

    def test_opaque_top_box_hides_underlying_ink_and_reordering_restores_it(self):
        scene = self.scene()
        transparent = self.pixels(bridge.layout({"scene": scene}))
        self.assertIn(0xff0000, transparent.values())
        scene["elements"][-1]["backgroundColour"] = 0x123456
        opaque = self.pixels(bridge.layout({"scene": scene}))
        self.assertNotIn(0xff0000, opaque.values())
        self.assertEqual({opaque[(x, y)] for x in range(168, 248) for y in range(178, 238)},
                         {device_colour(0x123456), 0x00ff00})
        scene["elements"].reverse()
        reordered = self.pixels(bridge.layout({"scene": scene}))
        self.assertIn(0xff0000, reordered.values())

    def test_hug_fill_uses_the_same_resolved_bounds_as_live_text(self):
        scene = self.scene()
        scene["elements"] = [{**scene["elements"][-1], "source": "weeklyWalk", "boxSizing": "hug",
                              "backgroundColour": 0x123456}]
        scene["elements"][0].pop("text")
        scene = model.validate_scene(scene)
        element = scene["elements"][0]
        font = model.scene_font_pack(scene)["fonts"][element["font"]]
        for text in ("8", "123.4", "--"):
            operations = model.render_text_ops(scene, {"weeklyWalk": text})
            expected, _, _ = model.hugging_element(text, element, font)
            self.assertEqual({key: operations[0][key] for key in ("x", "y", "width", "height")},
                             {key: expected[key] for key in ("x", "y", "width", "height")})
            ink = operations[1:]
            self.assertEqual((min(op["x"] for op in ink), min(op["y"] for op in ink),
                              max(op["x"] + op["width"] for op in ink), max(op["y"] + op["height"] for op in ink)),
                             (expected["x"], expected["y"], expected["x"] + expected["width"], expected["y"] + expected["height"]))

    def test_switching_text_to_a_seconds_ring_discards_text_only_backgrounds(self):
        from designer_typography import set_clock_source
        scene = self.scene()
        scene["elements"] = [{**scene["elements"][0], "source": "time", "backgroundColour": 0,
                              "nightBackgroundColour": 0x123456}]
        scene["elements"][0].pop("text")
        ring = set_clock_source(scene, "back", "secondsRing")
        self.assertEqual(ring["elements"][0]["source"], "secondsRing")
        self.assertNotIn("backgroundColour", ring["elements"][0])
        self.assertNotIn("nightBackgroundColour", ring["elements"][0])
        self.assertEqual(model.validate_scene(ring), ring)
        self.assertIn("backgroundColour", scene["elements"][0])

    def test_generated_rows_keep_independent_fills_and_resolve_hug_before_painting(self):
        scene = self.scene()
        scene["elements"][-1].update(backgroundColour=0, nightBackgroundColour=0x123456, boxSizing="hug")
        for proof in (False, True):
            with tempfile.TemporaryDirectory() as directory:
                project = fixtures.DesignerExportTests().project(directory)
                exporter.prepare_scene_project(project, scene, proof=proof, preview_night=True)
                source = (project / "source/DesignerView.mc").read_text()
                rows = json.loads(re.search(r"private var _elements as Array<Array> = (.*);", source).group(1))
                self.assertEqual(rows[0][25:27], [-1, -1])
                self.assertEqual(rows[1][25:27], [0, device_colour(0x123456)])
                draw = source.split("private function drawTextElement", 1)[1].split("private function hugElement", 1)[0]
                self.assertLess(draw.index("element = hugElement"), draw.index("var textBackground"))
                self.assertLess(draw.index("element = cached[2]"), draw.index("var textBackground"))
                self.assertLess(draw.index("dc.fillRectangle"), draw.index("dc.drawText"))
                self.assertIn("var textBackground = night ? element[26] : element[25];", draw)
                self.assertIn("if (textBackground >= 0)", draw)
                self.assertIn("dc.fillRectangle(element[2], element[3], element[4], element[11]);", draw)
                self.assertIn('if ((element[8] == 1 && night) || (element[8] == 2 && !night)) { continue; }', source)


if __name__ == "__main__":
    unittest.main()
