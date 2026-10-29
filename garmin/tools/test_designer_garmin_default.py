"""Garmin defaults and custom fonts share bounded, antialiased native resources."""
import base64
import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import designer_typography as typography
import test_designer_typography as fixtures


class GarminDefaultTests(unittest.TestCase):
    def test_default_scene_refresh_uses_garmin_and_is_idempotent(self):
        original = fixtures.TypographyTests().scene()
        before = copy.deepcopy(original)
        changed = typography.refresh_fonts(original)
        self.assertEqual(original, before)
        self.assertEqual(changed['fontFamily'], 'garmin')
        self.assertEqual(changed['elements'][0]['typography']['family'], 'garmin')
        self.assertEqual(typography.refresh_fonts(changed), changed)
        date = typography.add_date(changed)['elements'][-1]
        self.assertEqual(date['typography']['family'], 'garmin')

    def test_refresh_preserves_explicit_family_and_independent_fonts(self):
        scene = typography.set_watch_font(fixtures.TypographyTests().scene(), 'time')
        scene = typography.add_date(scene)
        scene = typography.apply(scene, 'date', {**scene['elements'][-1]['typography'], 'family': 'widget'})
        changed = typography.refresh_fonts(scene)
        self.assertEqual(changed['fontFamily'], 'time')
        self.assertEqual(changed['elements'][-1]['typography']['family'], 'widget')

    def test_all_families_keep_partial_coverage_after_styling(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(typography, 'CACHE', Path(directory)):
            for family in ('garmin', 'time', 'widget'):
                for thickness in (-1, 0, 1):
                    with self.subTest(family=family, thickness=thickness):
                        _, record = typography.generate('epix2pro47mm', {
                            'family': family, 'size': 70, 'width': 125,
                            'thickness': thickness, 'letterSpacing': -2})
                        _, _, alpha = typography._raw(base64.b64decode(record['image']))
                        self.assertTrue(any(0 < value < 255 for value in alpha))
                        self.assertTrue(set(alpha) <= set(range(0, 256, 17)))
                        self.assertEqual(record['font']['coverageBits'], 4)


if __name__ == '__main__':
    unittest.main()
