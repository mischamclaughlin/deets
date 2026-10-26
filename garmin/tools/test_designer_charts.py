import unittest
from designer_charts import chart_ops, ring_positions, shade, device_colour

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
    def test_ring_positions_and_brightness(self):
        ops=chart_ops(self.element('secondsRing',width=180,height=180))
        self.assertEqual(len(ops),60)
        self.assertTrue(all(0<=x<=178 and 0<=y<=178 for x,y in ring_positions(180)))
        self.assertEqual(ops[23]['colour'],0x4D9DE0)
