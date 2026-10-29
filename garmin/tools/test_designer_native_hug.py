"""Live Garmin text recomputes hugging bounds without reserving widest values."""
import copy
import json
import re
import tempfile
import unittest

import designer_export as exporter
import designer_typography as typography
import test_designer_export as fixtures


class NativeHugTests(unittest.TestCase):
    def scene(self):
        scene = typography.refresh_fonts(fixtures.DesignerExportTests().scene())
        return typography.fit_text_box(scene, scene['elements'][0]['id'])

    def test_hug_flag_and_dynamic_ink_metrics_reach_generated_renderer(self):
        scene = self.scene()
        self.assertEqual(scene['elements'][0]['boxSizing'], 'hug')
        before = copy.deepcopy(scene)
        with tempfile.TemporaryDirectory() as directory:
            project = fixtures.DesignerExportTests().project(directory)
            exporter.prepare_scene_project(project, scene)
            source = (project/'source/DesignerView.mc').read_text()
            encoded = re.search(r'private var _elements as Array<Array> = (.*);', source)
            row = json.loads(encoded.group(1))[0]
            self.assertTrue(row[19])
            self.assertEqual(row[20:22], [0, 0])
            self.assertIn('if (element[19]) { element = hugElement(element, text); }', source)
            self.assertIn('var left = advance + glyph[6];', source)
            self.assertIn('var top = glyph[4];', source)
            self.assertIn('resolved[4] = width;', source)
            self.assertIn('resolved[11] = height;', source)
            self.assertIn('pen -= element[20];', source)
            self.assertIn('glyph[4] - (element[19] ? element[21] : 0)', source)
            self.assertIn('if (element[18] && i >= 5) { code += 57344; }', source)
        self.assertEqual(scene, before)

    def test_fixed_boxes_do_not_use_live_hugging_and_hug_cache_is_budgeted(self):
        scene = self.scene()
        fixed = copy.deepcopy(scene)
        fixed['elements'][0]['boxSizing'] = 'fixed'
        pack = exporter.scene_font_pack(scene)
        catalogue = exporter._catalogue()
        codes = {scene['elements'][0]['font']: exporter._element_codes(scene['elements'][0], catalogue, False)}
        hug_cost = exporter._resource_cost(scene, pack, catalogue, codes, {}, False)
        fixed_cost = exporter._resource_cost(fixed, pack, catalogue, codes, {}, False)
        self.assertGreaterEqual(hug_cost-fixed_cost, 512)
        with tempfile.TemporaryDirectory() as directory:
            project = fixtures.DesignerExportTests().project(directory)
            exporter.prepare_scene_project(project, fixed)
            source = (project/'source/DesignerView.mc').read_text()
            encoded = re.search(r'private var _elements as Array<Array> = (.*);', source)
            self.assertFalse(json.loads(encoded.group(1))[0][19])


if __name__ == '__main__':
    unittest.main()
