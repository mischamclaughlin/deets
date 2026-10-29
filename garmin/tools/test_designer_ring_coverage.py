"""Angled ticks retain analytic edge coverage through the preview mapping."""
import unittest

import bridge
import designer_charts as charts
import designer_typography as typography
from designer_typography import _raw
import test_designer_clock as fixtures


class RingCoverageTests(unittest.TestCase):
    def test_pixel_area_handles_full_half_and_diagonal_coverage(self):
        square = [(0, 0), (1, 0), (1, 1), (0, 1)]
        self.assertEqual(charts._pixel_coverage(square, 0, 0), 255)
        self.assertEqual(charts._pixel_coverage(square, 1, 0), 0)
        triangle = [(0, 0), (1, 0), (0, 1)]
        self.assertEqual(charts._pixel_coverage(triangle, 0, 0), 136)
        shifted = [(x+400, y+400) for x, y in triangle]
        self.assertEqual(charts._pixel_coverage(shifted, 400, 400), 136)

    def test_all_sizes_keep_smooth_edges_cardinal_geometry_and_bounded_glyphs(self):
        for size in (4, 39, 390, 416, 454):
            with self.subTest(size=size):
                font, image = charts.ring_font(size)
                width, height, alpha = _raw(image)
                self.assertTrue(any(0 < a < 255 for a in alpha))
                self.assertTrue(set(alpha) <= set(range(0, 256, 17)))
                self.assertEqual(len(font['glyphs']), 60)
                for glyph in font['glyphs'].values():
                    self.assertGreaterEqual(glyph['xoffset'], 0)
                    self.assertGreaterEqual(glyph['yoffset'], 0)
                    self.assertLessEqual(glyph['xoffset']+glyph['width'], size)
                    self.assertLessEqual(glyph['yoffset']+glyph['height'], size)
                    self.assertLessEqual(glyph['x']+glyph['width'], width)
                    self.assertLessEqual(glyph['y']+glyph['height'], height)
                if size >= 390:
                    # Native font caches must reserve tick-sized cells, not watch-sized cells.
                    self.assertLessEqual(font['height'], 15)
                    self.assertTrue(all(g['xadvance'] <= g['width']+1 for g in font['glyphs'].values()))
                    top = font['glyphs'][str(0xE100)]
                    self.assertEqual((top['width'], top['height'], top['yoffset']), (6, 15, 4))

    def test_preview_uses_shared_mask_for_both_modes_and_preserves_layer_order(self):
        scene = typography.set_clock_source(fixtures.ClockModeTests().scene(), 'clock', 'secondsRing')
        scene = typography.add_time(scene)
        day, night = bridge.layout({'scene':scene}), bridge.layout({'scene':scene,'night':True})
        ring_ops = [op for op in day['ops'] if op['elementId'] == 'clock']
        self.assertEqual(len(ring_ops), 60)
        self.assertEqual(day['assets'][ring_ops[0]['font']], night['assets'][ring_ops[0]['font']])
        self.assertTrue(all(op['kind'] == 'bitmap' for op in ring_ops))
        self.assertEqual(day['ops'][:60], ring_ops)
        self.assertTrue(all(op['elementId'] == 'time' for op in day['ops'][60:]))


if __name__ == '__main__':
    unittest.main()
