"""Greyscale font edges survive resource writing and mixed-size seconds."""
from pathlib import Path
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

import designer_fonts as fonts
import designer_model as model
import designer_seconds as seconds
import designer_typography as typography


class FontCoverageTests(unittest.TestCase):
    def mask(self):
        coverage = bytes((0, 34, 136, 255, 17, 85, 170, 238,
                          51, 102, 187, 221, 68, 119, 204, 255))
        pixels = b"".join(bytes((255, 255, 255, alpha)) for alpha in coverage)
        return coverage, model._png_rgba(4, 4, pixels)

    def test_font_resource_keeps_greyscale_edges_and_enables_antialiasing(self):
        coverage, image = self.mask()
        glyph = {"x": 0, "y": 0, "width": 4, "height": 4,
                 "xoffset": 0, "yoffset": 0, "xadvance": 5}
        font = {"height": 4, "atlasWidth": 4, "atlasHeight": 4,
                "glyphs": {"48": glyph}}
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary)
            fonts.write_fonts(project, {"fonts": {"test": font}, "images": {"test": image}},
                              ["test"], {"test": {48}})
            resources = ET.parse(project / "resources/designer-fonts.xml").getroot()
            self.assertEqual(next(resources.iter("font")).attrib["antialias"], "true")
            descriptor = (project / "resources/designer-fonts/font-0.fnt").read_text()
            self.assertIn("smooth=1 aa=4", descriptor)
            actual = subprocess.check_output(["magick", str(project / "resources/designer-fonts/font-0.png"),
                                              "-depth", "8", "gray:-"])
            self.assertEqual(actual, coverage)

    def test_half_seconds_preserve_full_glyphs_and_average_edge_coverage(self):
        coverage, image = self.mask()
        glyph = {"x": 0, "y": 0, "width": 4, "height": 4,
                 "xoffset": 0, "yoffset": 0, "xadvance": 5}
        font = {"height": 4, "atlasWidth": 4, "atlasHeight": 4,
                "glyphs": {str(ord(char)): dict(glyph) for char in seconds.HALF_CHARACTERS}}
        expanded, expanded_image = seconds.with_half_seconds(font, image)
        width, _, actual = typography._raw(expanded_image)
        for y in range(4):
            self.assertEqual(actual[y * width:y * width + 4], coverage[y * 4:y * 4 + 4])
        half = expanded["glyphs"][str(ord("0") + seconds.HALF_CODE_OFFSET)]
        self.assertEqual((half["width"], half["height"]), (2, 2))
        values = [actual[(half["y"] + y) * width + half["x"] + x]
                  for y in range(2) for x in range(2)]
        self.assertEqual(values, [34, 204, 85, 221])
        self.assertTrue(all(value % 17 == 0 for value in values))
        self.assertEqual(expanded["glyphs"]["48"], glyph)

    def test_area_sampling_weights_odd_source_sizes(self):
        # Every half of the centre pixel contributes to its neighbouring output pixel.
        self.assertEqual(seconds._area_coverage([[0, 255, 0]], 2, 1), [[85, 85]])


if __name__ == "__main__":
    unittest.main()
