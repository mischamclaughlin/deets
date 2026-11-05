"""Sidebar clock/date choices add their requested variant atomically."""
import copy
import unittest

import bridge
from designer_model import DEVICES, validate_scene

CLOCKS = ('time', 'timeSeconds', 'hours', 'minutes', 'seconds', 'secondsRing')
DATES = ('numericDate', 'date', 'weekday', 'day', 'month', 'year')


class SidebarVariantTests(unittest.TestCase):
    def scene(self, device='epix2pro47mm'):
        return dict(version=2, name='Sidebar choices', device=device, background=0,
                    edgeInset=16, elements=[])

    def add(self, scene, source, **extra):
        return bridge.dispatch(dict(operation='add', payload=dict(scene=scene, source=source, **extra)))

    def test_all_clock_and_date_choices_add_requested_variant_on_every_device(self):
        for device in DEVICES:
            for source in CLOCKS + DATES:
                with self.subTest(device=device, source=source):
                    original = self.scene(device)
                    before = copy.deepcopy(original)
                    mapped = self.add(original, source)
                    self.assertEqual(original, before)
                    self.assertEqual(len(mapped['scene']['elements']), 1)
                    self.assertEqual(mapped['scene']['elements'][0]['source'], source)
                    self.assertEqual(validate_scene(mapped['scene']), mapped['scene'])
                    self.assertTrue(mapped['ops'])
                    self.assertEqual(mapped['areas'][0]['source'], source)
                    self.assertEqual(mapped['mapping'], bridge.mapping(mapped['scene']))

    def test_duplicate_choices_keep_original_elements_and_allocate_unique_ids(self):
        scene = self.scene()
        for source in CLOCKS + DATES:
            original = self.add(scene, source)['scene']
            before = copy.deepcopy(original)
            duplicated = self.add(original, source)['scene']
            self.assertEqual(original, before)
            self.assertEqual(duplicated['elements'][0], original['elements'][0])
            self.assertNotEqual(duplicated['elements'][0]['id'], duplicated['elements'][1]['id'])
            self.assertEqual([item['source'] for item in duplicated['elements']], [source, source])

    def test_invalid_requests_never_mutate_the_accepted_scene(self):
        scene = self.add(self.scene(), 'time')['scene']
        before = copy.deepcopy(scene)
        payloads = [dict(scene=scene), dict(scene=scene, source='unknown'),
                    dict(scene=scene, source='hours', options={}),
                    dict(scene=scene, source='date', options={}),
                    dict(scene=scene, source='secondsRing', extra=True)]
        for payload in payloads:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                bridge.dispatch(dict(operation='add', payload=payload))
            self.assertEqual(scene, before)


if __name__ == '__main__':
    unittest.main()
