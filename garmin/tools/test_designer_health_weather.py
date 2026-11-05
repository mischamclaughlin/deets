"""Health/recovery and wind/rain additions retain the canonical editing/export path."""
import copy
from pathlib import Path
import tempfile
import unittest

import bridge
from designer_activity import ACTIVITY_GROUPS, add_activity, icon_ops
from designer_export import _element_codes, prepare_scene_project
from designer_model import CATALOG, DEVICES, SOURCES, validate_scene
from designer_preview import scenario_values
from designer_typography import apply, refresh_fonts
import test_designer_export as fixtures

SOURCES_TO_ADD = ('bodyBattery', 'stress', 'recoveryTime', 'rainChance', 'wind')


class HealthWeatherTests(unittest.TestCase):
    def scene(self, device='epix2pro47mm'):
        return dict(version=2, name='Health and weather', device=device, background=0,
                    edgeInset=16, elements=[])

    def test_every_reading_adds_atomic_linked_value_and_icon_on_every_device(self):
        for device in DEVICES:
            for source in SOURCES_TO_ADD:
                with self.subTest(device=device, source=source):
                    original = self.scene(device)
                    scene = add_activity(original, source)
                    self.assertEqual(original['elements'], [])
                    value, icon = scene['elements']
                    self.assertEqual(value['source'], source)
                    self.assertEqual(icon['source'], ACTIVITY_GROUPS[source][0])
                    self.assertEqual(icon['activityId'], value['id'])
                    self.assertTrue(value['moveTogether'])
                    self.assertEqual(value['y'] - icon['y'] - icon['height'], 16)
                    self.assertTrue(icon_ops(icon))
                    for night in (False, True):
                        mapped = bridge.layout(dict(scene=scene, night=night))
                        self.assertEqual(mapped['scene'], scene)
                        self.assertEqual({op['elementId'] for op in mapped['ops']}, {value['id'], icon['id']})
                    self.assertEqual(validate_scene(scene), scene)

    def test_new_long_values_fit_their_default_boxes_on_every_device(self):
        from designer_model import font_pack, text_ink_bounds
        for device in DEVICES:
            for source, text in (("wind", "720 KM/H WSW"), ("recoveryTime", "96H 59M")):
                value = add_activity(self.scene(device), source)['elements'][0]
                font = font_pack(device)['fonts'][value['font']]
                self.assertLessEqual(text_ink_bounds(text, value, font)[2], value['width'])

    def test_values_icons_duplicates_and_typography_use_existing_editor_contracts(self):
        for source in SOURCES_TO_ADD:
            scene = add_activity(self.scene(), source, dict(icon=False))
            self.assertEqual([item['source'] for item in scene['elements']], [source])
            scene = add_activity(scene, source, dict(value=False))
            self.assertEqual(scene['elements'][1]['activityId'], scene['elements'][0]['id'])
            scene = add_activity(scene, source)
            self.assertNotEqual(scene['elements'][0]['id'], scene['elements'][2]['id'])
            styled = apply(scene, scene['elements'][0]['id'],
                dict(family='widget', size=24, thickness=0, width=100, letterSpacing=1))
            self.assertEqual(styled['elements'][0]['typography']['size'], 24)
            self.assertEqual(refresh_fonts(styled)['elements'], styled['elements'])
            with self.assertRaisesRegex(ValueError, 'does not have'):
                add_activity(scene, source, dict(graph=True))

    def test_missing_and_large_previews_cover_new_readings_without_mutating_scenes(self):
        scenario = dict(time='23:59:59', date='2026-11-05', readings='missing', weather='sample')
        missing = scenario_values(scenario, CATALOG)
        self.assertTrue(all(missing[source] == '--' for source in SOURCES_TO_ADD))
        weather_missing = scenario_values(dict(scenario, readings='sample', weather='missing'), CATALOG)
        self.assertEqual(weather_missing['rainChance'], '--')
        self.assertEqual(weather_missing['wind'], '--')
        self.assertEqual(weather_missing['bodyBattery'], '76%')
        large = scenario_values(dict(scenario, readings='large'), CATALOG)
        self.assertEqual(large['bodyBattery'], '100%')
        self.assertEqual(large['rainChance'], '100%')
        self.assertEqual(large['recoveryTime'], '96H 59M')
        self.assertEqual(large['wind'], '199 KM/H WNW')
        scene = self.scene()
        for source in SOURCES_TO_ADD:
            scene = add_activity(scene, source)
        original = copy.deepcopy(scene)
        mapped = bridge.layout(dict(scene=scene, preview=scenario))
        self.assertTrue(mapped['mapping'].startswith('preview:'))
        self.assertEqual(scene, original)

    def test_native_exports_subscribe_only_selected_health_metrics_and_include_all_runtime_glyphs(self):
        scene = self.scene()
        for source in SOURCES_TO_ADD:
            scene = add_activity(scene, source)
        for proof in (False, True):
            with tempfile.TemporaryDirectory() as temporary:
                project = fixtures.DesignerExportTests().project(temporary)
                prepare_scene_project(project, scene, proof=proof)
                provider = (project / 'source/EpixCanvasComplications.mc').read_text()
                view = (project / 'source/DesignerView.mc').read_text()
                self.assertIn('_slotTypes = [21, 22, 23];', provider)
                self.assertIn('designerBoundedValue(value, 100)', provider)
                self.assertIn('minutes % 60', provider)
                self.assertIn('Weather.getCurrentConditions()', provider)
                self.assertIn('minute != _designerWeatherMinute || statute != _designerWeatherStatute', provider)
                self.assertIn('distanceUnits == System.UNIT_STATUTE', provider)
                self.assertIn('2.2369362921 : 3.6', provider)
                self.assertIn('_provider.designerWeatherValue(source)', view)
                self.assertNotIn('Weather.getCurrentConditions()', view)
                self.assertNotIn('@', view)
        for source, text in [('bodyBattery', '100%--'), ('stress', '100--'),
                ('recoveryTime', '16666H 40M--'), ('rainChance', '100%--'),
                ('wind', '447 MPH NNE'), ('wind', '720 KM/H WSW')]:
            codes = _element_codes(dict(source=source), SOURCES, False)
            self.assertTrue(set(map(ord, text)) <= codes, (source, text))
        weather_scene = add_activity(self.scene(), 'wind')
        with tempfile.TemporaryDirectory() as temporary:
            project = fixtures.DesignerExportTests().project(temporary)
            prepare_scene_project(project, weather_scene)
            provider = (project / 'source/EpixCanvasComplications.mc').read_text()
            self.assertIn('_slotTypes = [];', provider)


if __name__ == '__main__':
    unittest.main()
