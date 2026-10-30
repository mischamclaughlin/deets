"""Exact native-pixel comparison catches geometry, colour and alpha regressions."""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

from compare_export_pixels import compare_images, main
from designer_model import _png_rgba


class ExportPixelTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def image(self, name, size=10, edits=None):
        pixels = bytearray(bytes((0, 0, 0, 255)) * size * size)
        for (x, y), colour in (edits or {}).items():
            offset = (y * size + x) * 4
            pixels[offset:offset + 4] = bytes(colour)
        path = self.root / name
        path.write_bytes(_png_rgba(size, size, pixels))
        return path

    def compare(self, expected, actual):
        return compare_images(expected, actual, self.root / "comparison")

    def test_equal_images_write_complete_bundle_without_modifying_sources(self):
        expected, actual = self.image("expected.png"), self.image("actual.png")
        original = expected.read_bytes(), actual.read_bytes()
        report = self.compare(expected, actual)
        self.assertTrue(report["match"])
        self.assertEqual(report["changedPixels"], 0)
        self.assertIsNone(report["boundingBox"])
        self.assertEqual(report["comparedPixels"], 80)
        self.assertEqual({p.name for p in (self.root / "comparison").iterdir()},
                         {"canvas.png", "native.png", "diff.png", "comparison.json"})
        self.assertEqual(json.loads((self.root / "comparison/comparison.json").read_text()), report)
        self.assertEqual((expected.read_bytes(), actual.read_bytes()), original)

    def test_one_pixel_geometry_shift_has_exact_changed_count_and_bounds(self):
        expected = self.image("expected.png", edits={(4, 5): (255, 255, 255, 255)})
        actual = self.image("actual.png", edits={(5, 5): (255, 255, 255, 255)})
        report = self.compare(expected, actual)
        self.assertFalse(report["match"])
        self.assertEqual(report["changedPixels"], 2)
        self.assertEqual(report["boundingBox"], {"x": 4, "y": 5, "width": 2, "height": 1})

    def test_single_colour_level_difference_is_not_tolerated(self):
        report = self.compare(self.image("expected.png"),
                              self.image("actual.png", edits={(5, 5): (1, 0, 0, 255)}))
        self.assertEqual(report["changedPixels"], 1)
        self.assertEqual(report["boundingBox"], {"x": 5, "y": 5, "width": 1, "height": 1})

    def test_colour_metadata_does_not_change_encoded_pixel_comparison(self):
        paths = []
        for gamma in (100000, 45455):
            # Identical encoded grey samples with linear versus sRGB-like gamma tags.
            data = _png_rgba(10, 10, bytes((64, 64, 64, 255)) * 100)
            payload = b"gAMA" + struct.pack(">I", gamma)
            chunk = struct.pack(">I", 4) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)
            path = self.root / f"gamma-{gamma}.png"
            path.write_bytes(data[:33] + chunk + data[33:])
            paths.append(path)
        report = self.compare(*paths)
        self.assertTrue(report["match"])
        self.assertEqual(report["changedPixels"], 0)

    def test_alpha_inside_display_is_compared(self):
        for alpha in (0, 254):
            with self.subTest(alpha=alpha):
                report = compare_images(self.image("expected.png"),
                                        self.image("actual.png", edits={(5, 5): (0, 0, 0, alpha)}),
                                        self.root / str(alpha))
                self.assertEqual(report["changedPixels"], 1)

    def test_hidden_rgb_of_two_transparent_pixels_is_irrelevant(self):
        report = self.compare(self.image("expected.png", edits={(5, 5): (255, 0, 0, 0)}),
                              self.image("actual.png", edits={(5, 5): (0, 255, 0, 0)}))
        self.assertTrue(report["match"])

    def test_only_outside_circle_is_masked_using_pixel_centres(self):
        report = self.compare(self.image("expected.png"), self.image("actual.png", edits={
            (0, 0): (255, 255, 255, 0),
            (3, 0): (255, 255, 255, 255),  # Centre is inside the radius of five.
            (2, 0): (255, 255, 255, 255),  # Centre is outside it.
        }))
        self.assertEqual(report["changedPixels"], 1)
        self.assertEqual(report["boundingBox"], {"x": 3, "y": 0, "width": 1, "height": 1})

    def test_dimension_mismatch_is_rejected_without_output(self):
        with self.assertRaisesRegex(ValueError, "dimensions must match exactly"):
            self.compare(self.image("expected.png", 10), self.image("actual.png", 12))
        self.assertFalse((self.root / "comparison").exists())

    def test_non_square_and_oversized_captures_are_rejected(self):
        for width, height in ((10, 11), (455, 455)):
            with self.subTest(width=width, height=height):
                path = self.root / "bad.png"
                path.write_bytes(_png_rgba(width, height, bytes(width * height * 4)))
                with self.assertRaisesRegex(ValueError, "square and at most"):
                    self.compare(path, path)

    def test_invalid_png_is_rejected(self):
        path = self.root / "invalid.png"
        path.write_bytes(b"This is not a PNG")
        with self.assertRaisesRegex(ValueError, "must be a PNG"):
            self.compare(path, path)

    def test_existing_output_directory_and_source_paths_are_never_overwritten(self):
        expected, actual = self.image("expected.png"), self.image("actual.png")
        output = self.root / "comparison"
        output.mkdir()
        marker = output / "canvas.png"
        marker.write_bytes(b"keep this capture")
        with self.assertRaisesRegex(ValueError, "new comparison"):
            self.compare(expected, actual)
        self.assertEqual(marker.read_bytes(), b"keep this capture")
        original = expected.read_bytes()
        with self.assertRaisesRegex(ValueError, "new comparison"):
            compare_images(expected, actual, expected)
        self.assertEqual(expected.read_bytes(), original)

    def test_cli_distinguishes_match_mismatch_and_input_error(self):
        expected = self.image("expected.png")
        different = self.image("different.png", edits={(5, 5): (1, 0, 0, 255)})
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(main([str(expected), str(expected), str(self.root / "equal")]), 0)
            self.assertEqual(main([str(expected), str(different), str(self.root / "different")]), 1)
            self.assertEqual(main([str(expected), str(different), str(self.root / "equal")]), 2)


if __name__ == "__main__":
    unittest.main()
