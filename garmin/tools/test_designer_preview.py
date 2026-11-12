"""Scenarios use canonical native masks without changing accepted scene/export state."""
import copy
import unittest
import bridge
import designer_model as model
from designer_charts import device_colour
from designer_activity import add_activity, icon_ops
from designer_preview import scenario_values
from designer_typography import add_time

DEFAULT = dict(time='10:08:23', date='2026-10-26', readings='sample', weather='sample')


class PreviewTests(unittest.TestCase):
    def scene(self):
        return dict(version=2, name='Preview', device='epix2pro47mm', background=0, edgeInset=16, elements=[])

    def test_sample_scenario_matches_default_native_pixels(self):
        scene = add_time(self.scene())
        for source in ('temperature', 'steps', 'sunriseSunset'):
            scene = add_activity(scene, source, dict(icon=True, graph=True))
        # Custom solar time is derived from the selected time, so compare clocks/steps/weather separately.
        scene['elements'] = [e for e in scene['elements'] if e['source'] not in ('solarTimeline', 'sunriseSunset', 'sunriseSunsetIcon')]
        normal = bridge.layout(dict(scene=scene))
        preview = bridge.layout(dict(scene=scene, preview=DEFAULT))
        self.assertEqual(preview['ops'], normal['ops'])
        self.assertEqual(preview['assets'], normal['assets'])
        self.assertEqual(preview['scene'], normal['scene'])
        self.assertTrue(preview['mapping'].startswith('preview:'))
        self.assertNotEqual(preview['mapping'], normal['mapping'])

    def test_clock_date_values_are_deterministic_and_calendar_checked(self):
        values = scenario_values(dict(DEFAULT, time='23:59:58', date='2028-02-29'), model.CATALOG)
        self.assertEqual(values['numericDate'], '29/02/28')
        self.assertEqual(values['weekday'], 'TUE')
        self.assertEqual(values['timeSeconds'], '23:59:58')
        self.assertEqual(values['secondsRing'], 58)
        self.assertEqual(scenario_values(dict(DEFAULT, date='2028-02-01'), model.CATALOG)['date'], 'TUE 1 FEB 2028')
        for changes in (dict(time='24:00:00'), dict(date='2026-02-29'), dict(date='2100-01-01'),
                        dict(readings=[]), dict(weather='../../sun'), dict(extra=True)):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                scenario_values(dict(DEFAULT, **changes), model.CATALOG)

    def test_weather_variants_and_missing_charts_use_native_coverage_without_scene_mutation(self):
        scene = add_activity(self.scene(), 'temperature', dict(icon=True, graph=True))
        before = copy.deepcopy(scene)
        icon = next(e for e in scene['elements'] if e['source'] == 'temperatureIcon')
        for variant in ('sun', 'cloud', 'cloud-rain', 'cloud-storm', 'snowflake', 'wind', 'mist'):
            preview = bridge.layout(dict(scene=scene, preview=dict(DEFAULT, weather=variant)))
            expected = [{**op, 'elementId': icon['id'], 'colour': device_colour(icon['colour'])} for op in icon_ops(icon, variant)]
            actual = [op for op in preview['ops'] if op['elementId'] == icon['id']]
            self.assertEqual(actual, expected)
        for reading in ('large', 'missing'):
            for night in (False, True):
                preview = bridge.layout(dict(scene=scene, night=night, preview=dict(DEFAULT, readings=reading)))
                self.assertEqual(preview['scene'], before)
                self.assertTrue(preview['ops'])
        self.assertEqual(scene, before)
        self.assertFalse(bridge.layout(dict(scene=scene))['mapping'].startswith('preview:'))

    def test_all_activity_graphs_render_large_and_missing_without_mutating_the_document(self):
        from designer_activity import ACTIVITY_GROUPS
        # Exercise each complete group without exceeding the document's 40-layer limit.
        for source in ACTIVITY_GROUPS:
            with self.subTest(source=source):
                scene = add_activity(self.scene(), source, dict(icon=True, graph=ACTIVITY_GROUPS[source][1] is not None))
                before = copy.deepcopy(scene)
                for readings in ('large', 'missing'):
                    for night in (False, True):
                        rendered = bridge.layout(dict(scene=scene, night=night, preview=dict(DEFAULT, readings=readings)))
                        self.assertEqual(rendered['scene'], before)
                        self.assertTrue(rendered['ops'])
                self.assertEqual(scene, before)

    def test_preview_token_is_rejected_before_compilation(self):
        scene = self.scene()
        preview = bridge.layout(dict(scene=scene, preview=DEFAULT))
        with self.assertRaisesRegex(ValueError, 'render the canvas again'):
            bridge.compile_scene(dict(scene=scene, mapping=preview['mapping']))


if __name__ == '__main__':
    unittest.main()
