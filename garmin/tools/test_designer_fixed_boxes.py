"""Explicit text boxes retain independent dimensions and native clipping."""
import copy
import tempfile
import unittest

import bridge
import designer_export as exporter
import designer_model as model
import designer_typography as typography
import test_designer_export as export_fixtures
import test_designer_typography as fixtures


class FixedBoxTests(unittest.TestCase):
    def scene(self):
        scene = typography.refresh_fonts(fixtures.TypographyTests().scene())
        scene['elements'][0].update(boxSizing='fixed', x=120, y=170,
                                    width=150, height=60)
        return scene

    def test_fixed_height_can_clip_or_exceed_glyph_height_with_native_bounds(self):
        for height in (1, 50, 120):
            with self.subTest(height=height):
                scene = self.scene()
                scene['elements'][0]['height'] = height
                self.assertEqual(model.validate_scene(scene), scene)
                ops = bridge.layout({'scene':scene})['ops']
                self.assertTrue(ops)
                for op in ops:
                    self.assertGreaterEqual(op['x'],120)
                    self.assertGreaterEqual(op['y'],170)
                    self.assertLessEqual(op['x']+op['width'],270)
                    self.assertLessEqual(op['y']+op['height'],170+height)

    def test_refresh_and_typography_preserve_manual_geometry_without_rescaling_glyphs(self):
        original = self.scene()
        before = copy.deepcopy(original)
        changed = typography.refresh_fonts(original)
        changed = typography.apply(changed, 'clock', {
            **changed['elements'][0]['typography'], 'size':100, 'width':125})
        self.assertEqual(original,before)
        self.assertEqual(changed['elements'][0]['boxSizing'],'fixed')
        for field in ('x','y','width','height'):
            self.assertEqual(changed['elements'][0][field],original['elements'][0][field])
        font = model.scene_font_pack(changed)['fonts'][changed['elements'][0]['font']]
        self.assertEqual(font['height'],100)
        changed = typography.set_clock_source(changed,'clock','timeSeconds')
        self.assertEqual(changed['elements'][0]['width'],150)
        self.assertEqual(changed['elements'][0]['height'],60)

    def test_legacy_fixed_box_uses_source_font_size_not_box_height(self):
        scene=fixtures.TypographyTests().scene()
        scene['elements'][0].update(boxSizing='fixed',height=40)
        changed=typography.refresh_fonts(scene)
        self.assertEqual(changed['elements'][0]['height'],40)
        self.assertEqual(changed['elements'][0]['typography']['size'],88)

    def test_fixed_box_still_obeys_integer_screen_and_circle_bounds(self):
        scene=self.scene()
        for updates in ({'height':0},{'height':True},{'width':0},{'x':-1},
                        {'width':416},{'x':1,'y':1},{'boxSizing':'auto'},
                        {'boxSizing':True}):
            bad=copy.deepcopy(scene)
            bad['elements'][0].update(updates)
            with self.subTest(updates=updates),self.assertRaises(ValueError):
                model.validate_scene(bad)

    def test_switch_to_ring_removes_fixed_box_and_restores_square_geometry(self):
        ring=typography.set_clock_source(self.scene(),'clock','secondsRing')
        self.assertNotIn('boxSizing',ring['elements'][0])
        self.assertEqual((ring['elements'][0]['width'],ring['elements'][0]['height']),(416,416))
        text=typography.set_clock_source(ring,'clock','time')
        self.assertNotIn('boxSizing',text['elements'][0])
        self.assertEqual(text['elements'][0]['height'],text['elements'][0]['typography']['size'])

    def test_fit_action_restores_auto_bounds_atomically_for_short_and_tall_boxes(self):
        for height in (1, 120):
            scene=self.scene()
            scene['elements'][0]['height']=height
            original=copy.deepcopy(scene)
            layout=bridge.dispatch({'operation':'fit-box','payload':{'scene':scene,'elementId':'clock'}})
            changed=layout['scene']['elements'][0]
            self.assertEqual(scene,original)
            self.assertNotIn('boxSizing',changed)
            self.assertEqual(changed['height'],changed['typography']['size'])
            for axis,extent in (('x','width'),('y','height')):
                self.assertEqual(changed[axis]+changed[extent]//2,
                                 scene['elements'][0][axis]+scene['elements'][0][extent]//2)
            self.assertEqual(changed['font'],scene['elements'][0]['font'])
            self.assertEqual(changed['typography'],scene['elements'][0]['typography'])
        with self.assertRaises(ValueError):
            bridge.dispatch({'operation':'fit-box','payload':{'scene':scene,'elementId':'clock','extra':True}})
        with self.assertRaises(ValueError):
            typography.fit_text_box(scene,'missing')

    def test_font_inheritance_keeps_fixed_geometry(self):
        original=self.scene()
        custom=typography.set_inheritance(original,'clock',False)
        inherited=typography.set_inheritance(custom,'clock',True)
        for changed in (custom,inherited):
            element=changed['elements'][0]
            self.assertEqual(element['boxSizing'],'fixed')
            for field in ('x','y','width','height'):
                self.assertEqual(element[field],original['elements'][0][field])

    def test_native_export_clips_and_positions_dividers_using_box_height(self):
        scene=self.scene()
        with tempfile.TemporaryDirectory() as temporary:
            project=export_fixtures.DesignerExportTests().project(temporary)
            exporter.prepare_scene_project(project,scene)
            source=(project/'source/DesignerView.mc').read_text()
            self.assertIn('dc.setClip(element[2], element[3], element[4], element[11]);',source)
            self.assertIn('var bottom = top + element[11];',source)
            self.assertIn('var spare = element[11] - glyph[3];',source)


if __name__=='__main__':
    unittest.main()
