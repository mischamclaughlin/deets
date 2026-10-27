import unittest
from designer_charts import chart_ops, ring_geometry, unpack_ring_rect, shade, device_colour

class ChartTests(unittest.TestCase):
    def element(self, source, width=181, height=18):
        return dict(source=source,x=20,y=40,width=width,height=height,colour=0x4D9DE0,nightColour=0x8D99AE)
    def test_colour_matches_observed_native_framebuffer(self):
        self.assertEqual(device_colour(0x4D9DE0), 0x4A9DE6)
        self.assertEqual(device_colour(0x122535), 0x102431)
        self.assertEqual(device_colour(0x346A98), 0x31699C)
        self.assertEqual(device_colour(0xFFFFFF), 0xFFFFFF)
        self.assertEqual(device_colour(0), 0)

    def test_bars_fill_exact_width_with_fixed_gaps(self):
        ops=chart_ops(self.element('stepsWeek'))
        self.assertEqual(ops[0]['x'],20)
        self.assertEqual(ops[-1]['x']+ops[-1]['width'],201)
        self.assertTrue(all(b['x']-(a['x']+a['width'])==3 for a,b in zip(ops,ops[1:])))
        self.assertTrue(all(op['y']+op['height']==58 for op in ops))
    def test_missing_values_remain_renderable(self):
        ops=chart_ops(self.element('stepsWeek'),[None]*7)
        self.assertTrue(all(x['height']==1 and x['colour']==shade(0x4D9DE0,24) for x in ops))
    def test_zone_boundaries(self):
        for value,zone in [(0,0),(10,1),(17,2),(30,3),(31,4)]:
            ops=chart_ops(self.element('temperatureZones'),value)
            self.assertEqual([i for i,x in enumerate(ops) if x['height']==18],[zone])
    def test_ring_uses_parent_tick_hierarchy_and_shared_brightness(self):
        width = 416
        groups = ring_geometry(width)
        self.assertEqual(len(groups), 61)
        def pixels(group):
            return {(x + dx, y + dy) for packed in group
                    for x, y, w, h in [unpack_ring_rect(packed)]
                    for dx in range(w) for dy in range(h)}
        self.assertEqual(len(pixels(groups[0])), 15 * 6)
        self.assertEqual(len(pixels(groups[5])), len(pixels(groups[10])))
        self.assertGreater(len(pixels(groups[5])), len(pixels(groups[1])))
        self.assertEqual(max(y for _, y in pixels(groups[0])) - min(y for _, y in pixels(groups[0])) + 1, 15)
        ops = chart_ops(self.element('secondsRing', width=width, height=width))
        expected = []
        for i, group in enumerate(groups):
            c = shade(0x4D9DE0, 42 if i == 60 else 100 if i == 23 else 68 if i < 23 else 24)
            for packed in group:
                x, y, w, h = unpack_ring_rect(packed)
                expected.append(dict(kind='rect', x=x+20, y=y+40, width=w, height=h, colour=c))
        self.assertEqual(ops, expected)

    def test_ring_masks_are_bounded_and_packing_is_lossless(self):
        for width in (4, 39, 180, 390, 416, 454):
            with self.subTest(width=width):
                for group in ring_geometry(width):
                    for packed in group:
                        x, y, w, h = unpack_ring_rect(packed)
                        self.assertGreaterEqual(x, 0)
                        self.assertGreaterEqual(y, 0)
                        self.assertLessEqual(x+w, width)
                        self.assertLessEqual(y+h, width)
                        self.assertLess(packed, 1 << 28)
