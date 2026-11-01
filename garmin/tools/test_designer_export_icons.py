"""Canonical icon coverage stays exact without colour-specific VM rectangles."""

import tempfile
import unittest

import designer_export as exporter
from designer_activity import ICON_MASKS, ICON_VARIANTS, icon_ops
from designer_export_icons import icon_font, icon_signature
from designer_model import font_pack, validate_scene
from designer_typography import _raw
import test_designer_export as fixtures


class IconExportTests(unittest.TestCase):
    def test_every_variant_matches_canonical_integer_coverage(self):
        for source in ICON_MASKS:
            element = dict(source=source, x=51, y=73, width=37, height=29)
            font, image = icon_font(element)
            width, _, alpha = _raw(image)
            for index, variant in enumerate(ICON_VARIANTS.get(source, (ICON_MASKS[source],))):
                expected = set()
                for rectangle in icon_ops(element, variant):
                    expected.update((x - element["x"], y - element["y"])
                        for x in range(rectangle["x"], rectangle["x"] + rectangle["width"])
                        for y in range(rectangle["y"], rectangle["y"] + rectangle["height"]))
                actual = {(x, y) for y in range(element["height"]) for x in range(element["width"])
                          if alpha[y * width + index * element["width"] + x]}
                self.assertEqual(expected, actual, (source, variant))
                self.assertEqual(font["glyphs"][str(0xE200 + index)]["x"], index * element["width"])

    def test_icon_geometry_is_shared_across_positions_and_colours(self):
        first = dict(source="stepsIcon", x=1, y=2, width=32, height=32, colour=0xffffff)
        second = dict(first, source="walkIcon", x=50, y=80, colour=0xff0000)
        self.assertEqual(icon_signature(first), icon_signature(second))
        self.assertEqual(icon_font(first), icon_font(second))

    def test_icon_heavy_design_fits_unchanged_heap_budget_and_shares_resources(self):
        fixture = fixtures.DesignerExportTests()
        scene = fixture.scene()
        for index in range(24):
            scene["elements"].append(dict(id=f"weather{index}", source="temperatureIcon", font="widget",
                x=10, y=10, width=64, height=64, align="left", colour=0xffffff,
                nightColour=0x999999, visible="both"))
        scene = validate_scene(scene)
        pack = font_pack(scene["device"])
        catalogue = {entry["id"]: entry for entry in exporter.CATALOG}
        fonts = {"time": exporter._element_codes(scene["elements"][0], catalogue, False)}
        cost = exporter._resource_cost(scene, pack, catalogue, fonts, {}, False)
        self.assertLess(cost, exporter.RESOURCE_BUDGET)
        with tempfile.TemporaryDirectory() as temporary:
            project = fixture.project(temporary)
            exporter.prepare_scene_project(project, scene)
            source = (project / "source/DesignerView.mc").read_text()
            self.assertEqual(len(list((project / "resources/designer-fonts").glob("*.fnt"))), 2)
            self.assertNotIn("var iconVariants", source)
            self.assertIn("(57856 + index).toChar().toString()", source)
            self.assertIn("if (!_proof)", source)


if __name__ == "__main__":
    unittest.main()
