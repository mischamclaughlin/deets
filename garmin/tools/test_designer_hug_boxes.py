"""Hugging boxes follow visible ink rather than widest-value reservations."""
import unittest

import designer_model as model
import designer_typography as typography
import test_designer_typography as fixtures


class HugBoxTests(unittest.TestCase):
    def scene(self):
        return typography.refresh_fonts(fixtures.TypographyTests().scene())

    def bounds(self, ops):
        return (min(op['x'] for op in ops), min(op['y'] for op in ops),
                max(op['x']+op['width'] for op in ops), max(op['y']+op['height'] for op in ops))

    def test_fit_hugs_preview_ink_at_all_four_edges(self):
        scene = typography.fit_text_box(self.scene(), 'clock')
        box = scene['elements'][0]
        self.assertEqual(box['boxSizing'], 'hug')
        ops = model.render_text_ops(scene)
        self.assertEqual(self.bounds(ops), (box['x'], box['y'], box['x']+box['width'], box['y']+box['height']))
        self.assertEqual(typography.fit_text_box(scene, 'clock'), scene)

    def test_every_live_time_can_grow_without_clipping_glyphs(self):
        scene = typography.fit_text_box(self.scene(), 'clock')
        box = scene['elements'][0]
        font = model.scene_font_pack(scene)['fonts'][box['font']]
        widths = set()
        for hour in range(24):
            for minute in range(60):
                text = f'{hour:02d}:{minute:02d}'
                ops = model.layout_text(text, box, font)
                resolved, _, _ = model.hugging_element(text, box, font)
                self.assertEqual(self.bounds(ops), (resolved['x'], resolved['y'], resolved['x']+resolved['width'], resolved['y']+resolved['height']))
                self.assertEqual([op['width'] for op in ops], [font['glyphs'][str(ord(c))]['width'] for c in text])
                widths.add(resolved['width'])
        self.assertGreater(len(widths), 1)

    def test_date_divider_half_seconds_and_font_edits_keep_hugging(self):
        scene = typography.fit_text_box(self.scene(), 'clock')
        scene = typography.set_clock_source(scene, 'clock', 'timeSeconds')
        scene = typography.set_seconds_size(scene, 'clock', 'half')
        scene = typography.apply(scene, 'clock', {**scene['elements'][0]['typography'], 'size': 50})
        scene = typography.add_date(scene)
        scene = typography.set_date_source(scene, 'date', 'weekday')
        scene = typography.fit_text_box(scene, 'date')
        scene = typography.add_divider(scene)
        scene = typography.set_divider_symbol(scene, 'divider', '.')
        scene = typography.fit_text_box(scene, 'divider')
        for box in scene['elements']:
            ops = [op for op in model.render_text_ops(scene) if op['elementId'] == box['id']]
            self.assertEqual(self.bounds(ops), (box['x'],box['y'],box['x']+box['width'],box['y']+box['height']))
        self.assertEqual(typography.refresh_fonts(scene), scene)


if __name__ == '__main__':
    unittest.main()
