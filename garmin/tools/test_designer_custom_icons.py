"""Portable imported icons retain canonical masks through editing and export."""
import copy
import json
from pathlib import Path
import re
import tempfile
import unittest

import bridge
from designer_actions import copy_element
from designer_activity import icon_ops, validate_custom_icon
from designer_charts import device_colour
from designer_device import convert_device
from designer_export import prepare_scene_project, scene_application_id
from designer_export_icons import icon_font, icon_signature
from designer_fonts import _coverage_png
from designer_model import DEVICES, validate_scene
from designer_typography import _raw, refresh_fonts
import test_designer_export as fixtures


class CustomIconTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm"):
        # Three non-symmetric rows make bit order and aspect-ratio errors visible.
        return dict(version=2, name="Imported", device=device, background=0,
            edgeInset=16, elements=[dict(id="custom", source="customIcon", font="widget",
                x=180, y=180, width=30, height=20, align="centre", colour=0xffffff,
                nightColour=0x999999, visible="both",
                icon=dict(name="Arrow", width=3, height=2, bits="b8"))])

    def points(self, operations):
        return {(x, y) for op in operations
            for y in range(op['y'], op['y'] + op['height'])
            for x in range(op['x'], op['x'] + op['width'])}

    def test_mask_validation_rejects_malformed_unbounded_blank_and_noncanonical_data(self):
        valid = self.scene()['elements'][0]['icon']
        self.assertEqual(validate_custom_icon(valid), valid)
        cases = [None, [], {}, dict(valid, extra=True), dict(valid, name=''),
            dict(valid, name='x' * 61), dict(valid, name='bad\x00name'),
            dict(valid, width=True), dict(valid, width=0), dict(valid, width=65),
            dict(valid, height=0), dict(valid, height=65), dict(valid, bits=None),
            dict(valid, bits='B8'), dict(valid, bits='b'), dict(valid, bits='b800'),
            dict(valid, bits='zz'), dict(valid, bits='00'), dict(valid, bits='b9')]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_custom_icon(value)
        largest = dict(valid, width=64, height=64, bits='ff' * 512)
        self.assertEqual(validate_custom_icon(largest), largest)
        for source, icon in [('customIcon', None), ('stepsIcon', valid)]:
            scene = self.scene()
            scene['elements'][0].update(source=source, icon=icon)
            with self.assertRaises(ValueError):
                validate_scene(scene)
        scene = self.scene()
        del scene['elements'][0]['icon']
        with self.assertRaises(ValueError):
            validate_scene(scene)

    def test_row_major_coverage_scales_to_fit_and_stays_inside_element(self):
        element = self.scene()['elements'][0]
        element.update(x=10, y=20, width=3, height=2)
        self.assertEqual(self.points(icon_ops(element)), {(10, 20), (12, 20), (10, 21), (11, 21)})
        for width, height in ((1, 1), (6, 4), (13, 20), (31, 11)):
            element.update(width=width, height=height)
            operations = icon_ops(element)
            self.assertTrue(all(10 <= x < 10 + width and 20 <= y < 20 + height
                                for x, y in self.points(operations)))
            font, image = icon_font(element)
            atlas_width, atlas_height, alpha = _raw(image)
            actual = {(10 + x, 20 + y) for y in range(atlas_height)
                      for x in range(atlas_width) if alpha[y * atlas_width + x]}
            self.assertEqual(actual, self.points(operations))
            self.assertEqual(font['glyphs'][str(0xE200)]['xadvance'], width)

    def test_mapping_preserves_masks_colours_visibility_and_layer_order_on_every_watch(self):
        for device in DEVICES:
            scene = self.scene(device)
            second = copy.deepcopy(scene['elements'][0])
            second.update(id='second', colour=0xff0000, visible='day')
            scene['elements'].append(second)
            self.assertEqual(validate_scene(scene), scene)
            for night in (False, True):
                mapped = bridge.layout(dict(scene=scene, night=night))
                self.assertEqual(mapped['scene'], scene)
                ids = list(dict.fromkeys(op['elementId'] for op in mapped['ops']))
                self.assertEqual(ids, ['custom'] if night else ['custom', 'second'])
                first = [op for op in mapped['ops'] if op['elementId'] == 'custom']
                self.assertEqual(self.points(first), self.points(icon_ops(scene['elements'][0])))
                self.assertTrue(all(op['colour'] == device_colour(0x999999 if night else 0xffffff) for op in first))

    def test_copy_refresh_device_conversion_and_json_roundtrip_keep_portable_mask(self):
        scene = self.scene()
        before = copy.deepcopy(scene)
        duplicate = copy_element(scene, 'custom')
        self.assertEqual(len(duplicate['elements']), 2)
        self.assertEqual(duplicate['elements'][1]['icon'], scene['elements'][0]['icon'])
        refreshed = refresh_fonts(scene)
        self.assertEqual(refreshed['elements'][0]['icon'], scene['elements'][0]['icon'])
        for device in DEVICES:
            converted = convert_device(scene, device)
            self.assertEqual(converted['elements'][0]['icon'], scene['elements'][0]['icon'])
            self.assertEqual(validate_scene(json.loads(json.dumps(converted))), converted)
        self.assertEqual(scene, before)

    def test_mask_changes_invalidate_mapping_and_app_identity_and_share_equal_coverage(self):
        scene = self.scene()
        first = scene['elements'][0]
        renamed = dict(first, icon=dict(first['icon'], name='Renamed'), x=100, colour=0xff0000)
        self.assertEqual(icon_signature(first), icon_signature(renamed))
        self.assertEqual(icon_font(first), icon_font(renamed))
        edited = copy.deepcopy(scene)
        edited['elements'][0]['icon']['bits'] = '78'
        self.assertNotEqual(bridge.mapping(scene), bridge.mapping(edited))
        self.assertNotEqual(scene_application_id(scene), scene_application_id(edited))
        self.assertNotEqual(icon_signature(first), icon_signature(edited['elements'][0]))

    def test_live_and_proof_exports_use_same_coverage_without_loading_inline_masks_into_vm(self):
        scene = self.scene()
        duplicate = copy.deepcopy(scene['elements'][0])
        duplicate.update(id='second', x=220, colour=0xff0000)
        scene['elements'].append(duplicate)
        for proof in (False, True):
            with tempfile.TemporaryDirectory() as temporary:
                project = fixtures.DesignerExportTests().project(temporary)
                prepare_scene_project(project, scene, proof=proof)
                source = (project / 'source/DesignerView.mc').read_text()
                rows = json.loads(re.search(r'private var _elements as Array<Array> = (.*);', source).group(1))
                self.assertEqual(rows[0][1], rows[1][1])
                self.assertEqual(rows[0][10], 'icon')
                self.assertEqual(rows[0][12:14], [[], []])
                self.assertEqual(len(list((project / 'resources/designer-fonts').glob('*.fnt'))), 1)
                _, image = icon_font(scene['elements'][0])
                self.assertEqual((project / 'resources/designer-fonts/font-0.png').read_bytes(), _coverage_png(image))
                self.assertNotIn('"bits"', source)
                self.assertIn('dc.drawText(element[2], element[3], _nativeFonts[element[1]]', source)


if __name__ == '__main__':
    unittest.main()
