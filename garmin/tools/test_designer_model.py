"""Native-pixel glyph and scene boundary regressions."""

import copy
import struct
import unittest
import zlib

import designer_model as model


class SceneValidationTests(unittest.TestCase):
    def scene(self):
        return {"version": 2, "name": "My face", "device": "epix2pro47mm", "background": 0,
            "elements": [{"id": "clock", "source": "time", "font": "time", "x": 48, "y": 160,
                "width": 320, "align": "centre", "colour": 0x4D9DE0,
                "nightColour": 0x8D99AE, "visible": "both"}]}

    def test_round_trip_inserts_native_font_height_without_mutating_input(self):
        scene = self.scene()
        original = copy.deepcopy(scene)
        actual = model.validate_scene(scene)
        self.assertEqual(scene, original)
        self.assertEqual(actual["elements"][0]["height"], model.font_pack(scene["device"])["fonts"]["time"]["height"])
        self.assertEqual(model.validate_scene(actual), actual)

    def test_invalid_schema_and_pixel_bounds_are_rejected(self):
        mutations = [
            lambda s: s.update(version=True),
            lambda s: s.update(device="../../outside"),
            lambda s: s.update(background=True),
            lambda s: s.update(unknown=1),
            lambda s: s["elements"][0].update(x=48.5),
            lambda s: s["elements"][0].update(width=417),
            lambda s: s["elements"][0].update(y=400),
            lambda s: s["elements"][0].update(height=1),
            lambda s: s["elements"][0].update(colour=-1),
            lambda s: s["elements"][0].update(align=[]),
            lambda s: s["elements"][0].update(visible={}),
            lambda s: s["elements"].append(copy.deepcopy(s["elements"][0])),
            lambda s: s["elements"][0].update(source="unknown"),
            lambda s: s["elements"][0].update(font="tall"),
        ]
        for mutate in mutations:
            scene = self.scene()
            mutate(scene)
            with self.subTest(scene=scene), self.assertRaises(ValueError):
                model.validate_scene(scene)

    def test_circumference_accepts_tangent_boxes_and_rejects_crossing_corners(self):
        for device, size in model.DEVICES.items():
            with self.subTest(device=device):
                centre = size // 2
                scene = self.scene()
                scene.update(device=device, edgeInset=centre - 100)
                # A 3:4:5 triangle places each corner exactly on the circle.
                scene["elements"][0].update(source="solarTimeline", font="widget",
                    x=centre - 60, y=centre - 80, width=120, height=160)
                original = copy.deepcopy(scene)
                self.assertEqual(model.validate_scene(scene), original)
                self.assertEqual(scene, original)
                scene["elements"][0]["x"] -= 1
                with self.assertRaisesRegex(ValueError, "circumference boundary"):
                    model.validate_scene(scene)

    def test_circumference_checks_all_corners_rather_than_square_inset(self):
        scene = self.scene()
        scene["edgeInset"] = 20
        scene["elements"][0].update(x=20, y=20, width=100)
        with self.assertRaisesRegex(ValueError, "circumference boundary"):
            model.validate_scene(scene)

    def test_circumference_inset_range_and_empty_scene_round_trip(self):
        for device, size in model.DEVICES.items():
            for inset in (0, 20, size // 2 - 1):
                with self.subTest(device=device, inset=inset):
                    scene = self.scene()
                    scene.update(device=device, edgeInset=inset, elements=[])
                    self.assertEqual(model.validate_scene(scene), scene)
            for inset in (-1, size // 2, True, 2.5, "20", None):
                with self.subTest(device=device, inset=inset):
                    scene = self.scene()
                    scene.update(device=device, edgeInset=inset, elements=[])
                    with self.assertRaisesRegex(ValueError, "Edge inset"):
                        model.validate_scene(scene)

    def test_zero_inset_still_enforces_round_display_and_legacy_scenes_stay_unchanged(self):
        scene = self.scene()
        scene["elements"][0].update(x=0, y=0, width=100)
        self.assertNotIn("edgeInset", model.validate_scene(scene))
        scene["edgeInset"] = 0
        with self.assertRaisesRegex(ValueError, "circumference boundary"):
            model.validate_scene(scene)

    def test_text_label_support_and_chart_sizes(self):
        scene = self.scene()
        element = scene["elements"][0]
        element.update(source="label", font="widget", text="TEMP 17°", y=100)
        self.assertEqual(model.validate_scene(scene)["elements"][0]["text"], "TEMP 17°")
        element["text"] = "emoji 🙂"
        with self.assertRaises(ValueError):
            model.validate_scene(scene)
        element.pop("text")
        element.update(source="stepsWeek", width=24)
        with self.assertRaises(ValueError):
            model.validate_scene(scene)
        element.update(width=100)
        self.assertEqual(model.validate_scene(scene)["elements"][0]["height"], 18)
        element.update(source="secondsRing", width=100, height=99)
        with self.assertRaises(ValueError):
            model.validate_scene(scene)

    def test_night_visibility_and_colours(self):
        scene = model.validate_scene(self.scene())
        values = {"time": "10:08"}
        day = model.render_text_ops(scene, values)
        night = model.render_text_ops(scene, values, night=True)
        self.assertTrue(day)
        # Explicitly unavailable data must not silently become preview samples.
        unavailable = model.render_text_ops(scene, {})
        self.assertNotEqual(unavailable, day)
        self.assertEqual([{k: v for k, v in op.items() if k != "colour"} for op in day],
                         [{k: v for k, v in op.items() if k != "colour"} for op in night])
        self.assertTrue(all(op["colour"] == 0x8D99AE for op in night))
        scene["elements"][0]["visible"] = "day"
        self.assertEqual(model.render_text_ops(scene, values, night=True), [])


class GlyphLayoutTests(unittest.TestCase):
    def font(self):
        return {"height": 8, "glyphs": {
            "49": {"x": 10, "y": 20, "width": 3, "height": 5, "xoffset": 0, "yoffset": 2, "xadvance": 4},
            "50": {"x": 30, "y": 40, "width": 5, "height": 8, "xoffset": 0, "yoffset": 0, "xadvance": 6},
        }}

    def test_alignment_uses_visible_advances_and_pixel_floor(self):
        element = {"x": 100, "y": 60, "width": 12, "align": "centre"}
        # Text width is 4+6-1 = 9; the remaining odd pixel goes on the right.
        result = model.layout_text("12", element, self.font())
        self.assertEqual(result[0], {"x": 101, "y": 62, "sx": 10, "sy": 20, "width": 3, "height": 5})
        self.assertEqual(result[1]["x"], 105)
        element["align"] = "right"
        self.assertEqual(model.layout_text("12", element, self.font())[0]["x"], 103)

    def test_overlong_centred_text_clips_source_pixels_symmetrically(self):
        result = model.layout_text("12", {"x": 100, "y": 60, "width": 6, "align": "centre"}, self.font())
        # floor((6-9)/2)=-2 rather than truncating to -1.
        self.assertEqual(result[0], {"x": 100, "y": 62, "sx": 12, "sy": 20, "width": 1, "height": 5})
        self.assertEqual(result[1], {"x": 102, "y": 60, "sx": 30, "sy": 40, "width": 4, "height": 8})

    def test_blank_and_unknown_glyphs_do_not_create_invalid_draws(self):
        font = self.font()
        self.assertEqual(model.layout_text("", {"x": 0, "y": 0, "width": 20}, font), [])
        self.assertEqual(model.layout_text("?", {"x": 0, "y": 0, "width": 20}, font), [])
        font["glyphs"]["63"] = font["glyphs"]["49"]
        self.assertEqual(model.layout_text("?", {"x": 0, "y": 0, "width": 20}, font)[0]["sx"], 10)


class RealAtlasTests(unittest.TestCase):
    def test_all_device_atlases_have_binary_alpha_and_correct_glyph_bounds(self):
        for device in model.DEVICES:
            pack = model.font_pack(device)
            for key, font in pack["fonts"].items():
                with self.subTest(device=device, font=key):
                    data = pack["images"][key]
                    self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                    width, height = struct.unpack(">II", data[16:24])
                    self.assertEqual((width, height), (font["atlasWidth"], font["atlasHeight"]))
                    compressed = bytearray()
                    position = 8
                    while position < len(data):
                        length = struct.unpack(">I", data[position:position + 4])[0]
                        kind = data[position + 4:position + 8]
                        if kind == b"IDAT":
                            compressed.extend(data[position + 8:position + 8 + length])
                        position += length + 12
                    raw = zlib.decompress(compressed)
                    alpha = []
                    for y in range(height):
                        row = raw[y * (width * 4 + 1):(y + 1) * (width * 4 + 1)]
                        self.assertEqual(row[0], 0)
                        alpha.extend(row[4::4])
                    self.assertEqual(set(alpha), {0, 255})
                    for glyph in font["glyphs"].values():
                        self.assertGreaterEqual(glyph["yoffset"], 0)
                        self.assertLessEqual(glyph["x"] + glyph["width"], width)
                        self.assertLessEqual(glyph["y"] + glyph["height"], height)
                        self.assertLessEqual(glyph["yoffset"] + glyph["height"], font["height"])

    def test_catalogue_exposes_every_existing_data_type_and_shared_assets(self):
        catalogue = model.catalogue("epix2pro47mm")
        self.assertEqual({2, 3, 4, 5, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 35, 36, 38, 39}, {s["type"] for s in catalogue["sources"] if "type" in s})
        self.assertEqual(set(catalogue["fonts"]), set(model.FONT_FILES))
        for font in catalogue["fonts"].values():
            self.assertEqual(font["assetUrl"], font["url"])
            self.assertTrue(font["assetUrl"].startswith("/api/designer-asset?"))
        self.assertEqual(catalogue["size"], 416)


if __name__ == "__main__":
    unittest.main()
