"""Additional data remains portable, bounded and native throughout editing/export."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import bridge
from designer_activity import add_activity, ACTIVITY_GROUPS, ICON_MASKS
from designer_actions import copy_element
from designer_device import convert_device
from designer_export import prepare_scene_project, scene_application_id, _element_codes
from designer_metrics import METRICS, METRICS_PATH, TYPE_METRICS
from designer_model import CATALOG, DEVICES, SOURCES, validate_scene, font_pack, text_ink_bounds
from designer_preview import scenario_values
from designer_typography import apply, refresh_fonts
import test_designer_export as fixtures


class AdditionalMetricTests(unittest.TestCase):
    def scene(self, device='epix2pro47mm'):
        return dict(version=2, name='Additional data', device=device, background=0, edgeInset=16, elements=[])

    def test_every_metric_and_icon_adds_on_all_devices_with_fully_visible_default_samples(self):
        self.assertEqual(len(METRICS), 20)
        for device in DEVICES:
            for entry in METRICS:
                source = entry['source']
                original = self.scene(device)
                scene = add_activity(original, source)
                self.assertEqual(original['elements'], [])
                value, icon = scene['elements']
                self.assertEqual([value['source'], icon['source']], [source, source + 'Icon'])
                self.assertEqual(icon['activityId'], value['id'])
                self.assertEqual(ICON_MASKS[icon['source']], entry['icon'])
                for sample in (entry['sample'], entry['largeSample']):
                    self.assertLessEqual(text_ink_bounds(sample, value, font_pack(device)['fonts'][value['font']])[2], value['width'])
                for night in (False, True):
                    mapped = bridge.layout(dict(scene=scene, night=night))
                    self.assertEqual({op['elementId'] for op in mapped['ops']}, {value['id'], icon['id']})
                independent = add_activity(original, source + 'Icon')
                self.assertEqual(len(independent['elements']), 1)
                self.assertNotIn('activityId', independent['elements'][0])

    def test_previews_cover_missing_and_large_values_without_touching_saved_scene(self):
        scenario = dict(time='12:34:56', date='2026-11-05', readings='missing', weather='sample')
        values = scenario_values(scenario, CATALOG)
        for entry in METRICS:
            self.assertEqual(values[entry['source']], '--')
        large = scenario_values(dict(scenario, readings='large'), CATALOG)
        weather = scenario_values(dict(scenario, readings='sample', weather='missing'), CATALOG)
        for entry in METRICS:
            self.assertEqual(large[entry['source']], entry['largeSample'])
            self.assertEqual(weather[entry['source']], '--' if 'weatherField' in entry else entry['sample'])
            scene = add_activity(self.scene(), entry['source'])
            before = copy.deepcopy(scene)
            mapped = bridge.layout(dict(scene=scene, preview=scenario))
            self.assertTrue(mapped['mapping'].startswith('preview:'))
            self.assertEqual(scene, before)
            self.assertTrue(mapped['ops'])

    def test_duplicating_reloading_and_changing_devices_keeps_new_sources_portable(self):
        for source in ('calories', 'altitude', 'calendarEvent', 'trainingStatus', 'humidity'):
            scene = add_activity(self.scene(), source)
            duplicated = copy_element(scene, scene['elements'][0]['id'])
            self.assertEqual(len({item['id'] for item in duplicated['elements']}), len(duplicated['elements']))
            self.assertEqual(validate_scene(json.loads(json.dumps(duplicated))), duplicated)
            self.assertEqual(refresh_fonts(duplicated)['elements'], duplicated['elements'])
            for device in DEVICES:
                converted = convert_device(duplicated, device)
                self.assertTrue(all(item['source'] in {source, source + 'Icon'} for item in converted['elements']))
                self.assertEqual(validate_scene(converted), converted)
            styled = apply(scene, scene['elements'][0]['id'], dict(family='widget', size=24, thickness=0, width=100, letterSpacing=1))
            self.assertEqual(styled['elements'][0]['typography']['size'], 24)

    def test_export_generated_projects_keep_permissions_and_include_every_live_character(self):
        for offset in range(0, len(METRICS), 4):
            entries = METRICS[offset:offset+4]
            scene = self.scene()
            for entry in entries:
                scene = add_activity(scene, entry['source'])
            for proof in (False, True):
                with tempfile.TemporaryDirectory() as temporary:
                    project = fixtures.DesignerExportTests().project(temporary)
                    prepare_scene_project(project, scene, proof=proof)
                    self.assertTrue((project / 'source/DesignerMetricFormatting.mc').is_file())
                    self.assertNotIn('@METRIC_TEXT_CASES@', (project / 'source/DesignerView.mc').read_text())
                    self.assertEqual(len(list((project / 'resources/designer-fonts').glob('*.fnt'))), 1 + len({(entry['icon'], scene['elements'][2*i+1]['width'], scene['elements'][2*i+1]['height']) for i, entry in enumerate(entries)}))
            for entry in entries:
                codes = _element_codes(dict(source=entry['source']), SOURCES, False)
                self.assertTrue(set(map(ord, entry['sample'] + entry['largeSample'] + '--')) <= codes)
                self.assertTrue(set(map(ord, '0123456789 MI KM FT M HPA C F:--?')) <= codes)

    def test_descriptor_changes_invalidate_mapping_and_native_application_identity(self):
        scene = add_activity(self.scene(), 'calories')
        with tempfile.TemporaryDirectory() as temporary:
            descriptor = Path(temporary) / 'metrics.json'
            descriptor.write_bytes(METRICS_PATH.read_bytes())
            with patch('designer_metrics.METRICS_PATH', descriptor):
                mapping, identity = bridge.mapping(scene), scene_application_id(scene)
                descriptor.write_bytes(descriptor.read_bytes() + b'\n')
                self.assertNotEqual(bridge.mapping(scene), mapping)
                self.assertNotEqual(scene_application_id(scene), identity)


if __name__ == '__main__':
    unittest.main()
