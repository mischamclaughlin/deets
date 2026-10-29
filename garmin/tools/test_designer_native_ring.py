"""Native ring resources share canonical coverage and keep colour-independent assets."""
import copy
from pathlib import Path
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

import designer_charts as charts
import designer_export as exporter
import designer_typography as typography
import test_designer_export as fixtures


class NativeRingTests(unittest.TestCase):
    def scene(self):
        scene = fixtures.DesignerExportTests().scene()
        scene['elements'] = [{
            'id': 'ring', 'source': 'secondsRing', 'font': 'widget',
            'x': 10, 'y': 10, 'width': 396, 'height': 396, 'align': 'left',
            'colour': 0x4D9DE0, 'nightColour': 0x8D99AE, 'visible': 'both'}]
        return scene

    def test_native_resource_preserves_ring_coverage_and_glyph_positions(self):
        scene = self.scene()
        original = copy.deepcopy(scene)
        font, image = charts.ring_font(*charts.ring_signature(scene, scene['elements'][0]))
        with tempfile.TemporaryDirectory() as directory:
            project = fixtures.DesignerExportTests().project(directory)
            exporter.prepare_scene_project(project, scene)
            coverage = subprocess.check_output(['magick', str(project / 'resources/designer-fonts/font-0.png'),
                                                '-depth', '8', 'gray:-'])
            self.assertEqual(coverage, typography._raw(image)[2])
            self.assertTrue(any(0 < value < 255 for value in coverage))
            descriptor = (project / 'resources/designer-fonts/font-0.fnt').read_text()
            self.assertEqual(descriptor.count('char id='), 60)
            source = (project / 'source/DesignerView.mc').read_text()
            self.assertIn('0 => ' + exporter._mc(exporter._ring_positions(font)), source)
            self.assertNotIn('packed >>', source)
        self.assertEqual(scene, original)

    def test_equal_ring_geometry_shares_native_resources_across_colours(self):
        scene = self.scene()
        scene['elements'].append({**scene['elements'][0], 'id': 'ring-copy',
                                  'colour': 0xFF0000, 'nightColour': 0x001122})
        with tempfile.TemporaryDirectory() as directory:
            project = fixtures.DesignerExportTests().project(directory)
            exporter.prepare_scene_project(project, scene)
            resources = ET.parse(project / 'resources/designer-fonts.xml').getroot()
            self.assertEqual(len(list(resources.iter('font'))), 1)
            self.assertTrue(all(font.attrib['antialias'] == 'true' for font in resources.iter('font')))

    def test_zero_length_ring_needs_no_native_font(self):
        scene = self.scene()
        scene.update(edgeInset=0)
        scene['elements'][0]['ringTicksStretchToCircumference'] = True
        with tempfile.TemporaryDirectory() as directory:
            project = fixtures.DesignerExportTests().project(directory)
            exporter.prepare_scene_project(project, scene)
            resources = ET.parse(project / 'resources/designer-fonts.xml').getroot()
            self.assertEqual(list(resources.iter('font')), [])
            source = (project / 'source/DesignerView.mc').read_text()
            self.assertIn('if (position.size() == 0) { continue; }', source)


if __name__ == '__main__':
    unittest.main()
