"""Text alignment uses native ink bounds and never changes legacy omitted values."""
import copy
import json
import re
import tempfile
import unittest

import bridge
import designer_export as exporter
import designer_model as model
import designer_typography as typography
import test_designer_export as fixtures


class VerticalAlignmentTests(unittest.TestCase):
    def scene(self, source="weeklyWalk", device="epix2pro47mm"):
        size = model.DEVICES[device]
        return dict(version=2, name="Vertical alignment", device=device, background=0, elements=[
            dict(id="text", source=source, font="widget", x=size//2-60, y=size//2-40,
                 width=120, height=80, align="centre", colour=0x00ff00, nightColour=0xff0000,
                 visible="both", boxSizing="fixed")])

    @staticmethod
    def bounds(operations):
        return (min(op["y"] for op in operations), max(op["y"]+op["height"] for op in operations))

    def test_validate_preserves_legacy_omission_and_rejects_non_text_or_bad_values(self):
        scene = self.scene()
        self.assertEqual(model.validate_scene(scene), scene)
        for value in ("top", "middle", "bottom"):
            scene["elements"][0]["verticalAlign"] = value
            self.assertEqual(model.validate_scene(scene), scene)
        for value in (None, True, 0, [], "centre", "other"):
            scene["elements"][0]["verticalAlign"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                model.validate_scene(scene)
        for source in ("stepsIcon", "stepsWeek", "secondsRing"):
            scene["elements"][0].update(source=source, verticalAlign="top")
            with self.subTest(source=source), self.assertRaisesRegex(ValueError, "vertical alignment"):
                model.validate_scene(scene)

    def test_top_middle_bottom_use_actual_native_ink_on_all_devices(self):
        for device in model.DEVICES:
            for source in ("weeklyWalk", "divider", "label", "numericDate"):
                scene = self.scene(source, device)
                element = scene["elements"][0]
                if source == "label":
                    element["text"] = "TOP"
                if source == "numericDate":
                    element["font"] = "date"
                font = model.scene_font_pack(scene)["fonts"][element["font"]]
                text = element.get("text", ":" if source == "divider" else model.SOURCES[source]["sample"])
                _, _, _, height = model.text_ink_bounds(text, element, font)
                for alignment in ("top", "middle", "bottom"):
                    element["verticalAlign"] = alignment
                    offset = 0 if alignment == "top" else element["height"]-height if alignment == "bottom" else (element["height"]-height)//2
                    expected = (element["y"]+offset, element["y"]+offset+height)
                    for night in (False, True):
                        with self.subTest(device=device, source=source, alignment=alignment, night=night):
                            operations = bridge.layout(dict(scene=scene, night=night))["ops"]
                            self.assertEqual(self.bounds(operations), expected)
                            self.assertTrue(all(op["colour"] == (0xff0000 if night else 0x00ff00) for op in operations))

    def test_omission_retains_legacy_divider_positions_and_glyph_offsets(self):
        scene = self.scene("divider")
        element = scene["elements"][0]
        font = model.scene_font_pack(scene)["fonts"]["widget"]
        for position in ("top", "middle", "bottom"):
            element["dividerPosition"] = position
            operations = model.layout_text(":", element, font)
            glyph = font["glyphs"][str(ord(":"))]
            offset = 0 if position == "top" else element["height"]-glyph["height"] if position == "bottom" else (element["height"]-glyph["height"])//2
            self.assertEqual(self.bounds(operations), (element["y"]+offset, element["y"]+offset+glyph["height"]))
        element.update(source="weeklyWalk")
        element.pop("dividerPosition")
        ops = model.layout_text("18.6", element, font)
        self.assertEqual(min(op["y"] for op in ops), element["y"]+min(font["glyphs"][str(ord(char))]["yoffset"] for char in "18.6"))

    def test_overflow_clips_native_mask_after_bottom_alignment(self):
        font = {"height": 30, "glyphs": {"65": dict(x=0, y=0, width=4, height=20, xoffset=0, yoffset=5, xadvance=5)}}
        element = dict(source="label", x=10, y=20, width=20, height=8, align="left", verticalAlign="bottom")
        operation, = model.layout_text("A", element, font)
        self.assertEqual(operation, dict(x=10, y=20, sx=0, sy=12, width=4, height=8))

    def test_hug_keeps_same_geometry_and_background_for_each_alignment(self):
        scene = self.scene()
        element = scene["elements"][0]
        element.update(boxSizing="hug", backgroundColour=0x24273a)
        original = bridge.layout(dict(scene=scene))["ops"]
        for alignment in ("top", "middle", "bottom"):
            element["verticalAlign"] = alignment
            self.assertEqual(bridge.layout(dict(scene=scene))["ops"], original)

    def test_half_seconds_align_with_complete_clock_ink_not_small_suffix(self):
        scene = typography.add_time(dict(version=2, name="Half seconds", device="epix2pro47mm", background=0, elements=[]))
        scene = typography.apply(scene, "time", dict(family="time", size=42, thickness=0, width=100, letterSpacing=1))
        scene = typography.set_clock_source(scene, "time", "timeSeconds")
        scene = typography.set_seconds_size(scene, "time", "half")
        element = scene["elements"][0]
        element.update(boxSizing="fixed", height=80, verticalAlign="bottom")
        font = model.scene_font_pack(scene)["fonts"][element["font"]]
        for text in ("10:08:42", "23:59:59"):
            _, _, _, height = model.text_ink_bounds(text, element, font)
            operations = model.render_text_ops(scene, {"timeSeconds": text})
            self.assertEqual(self.bounds(operations), (element["y"]+80-height, element["y"]+80))
            self.assertLess(max(op["height"] for op in operations[-3:]), max(op["height"] for op in operations[:5]))

    def test_export_preserves_alignment_and_switching_to_ring_discards_it(self):
        scene = self.scene("time")
        element = scene["elements"][0]
        for alignment, encoded in ((None, -1), ("top", 0), ("middle", 1), ("bottom", 2)):
            if alignment is not None:
                element["verticalAlign"] = alignment
            with tempfile.TemporaryDirectory() as directory:
                project = fixtures.DesignerExportTests().project(directory)
                exporter.prepare_scene_project(project, scene)
                source = (project / "source/DesignerView.mc").read_text()
                rows = json.loads(re.search(r"private var _elements as Array<Array> = (.*);", source).group(1))
                self.assertEqual(rows[0][27], encoded)
                self.assertIn("if (element[27] >= 0 && !element[19] && hasVerticalInk)", source)
                self.assertIn("glyph[4] + glyph[3] > verticalInkBottom", source)
                self.assertIn('if (element[0].equals("divider") && !element[19] && element[27] < 0)', source)
                self.assertIn("+ verticalShift;", source)
        before = copy.deepcopy(scene)
        ring = typography.set_clock_source(scene, "text", "secondsRing")
        self.assertNotIn("verticalAlign", ring["elements"][0])
        self.assertEqual(model.validate_scene(ring), ring)
        self.assertEqual(scene, before)


if __name__ == "__main__":
    unittest.main()
