"""Activity insertion, icon clipping and native export contracts."""
import copy
import tempfile
import struct
import subprocess
import unittest
from unittest.mock import patch
from pathlib import Path

from designer_activity import ACTIVITY_GROUPS, ACTIVITY_SOURCES, ICON_MASKS, ICON_DIRECTORY, add_activity, icon_asset_paths
from designer_charts import chart_ops
from designer_model import DEVICES, validate_scene
import test_designer_export as export_tests
from designer_export import prepare_scene_project
import bridge


class ActivityTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm"):
        return dict(version=2, name="Activities", device=device, background=0, edgeInset=16, elements=[])

    def test_each_source_adds_unique_independent_elements_on_every_device(self):
        for device in DEVICES:
            for source in sorted(ACTIVITY_SOURCES):
                with self.subTest(device=device, source=source):
                    # Exercise every source independently rather than exceeding
                    # the document's forty-element limit as the catalogue grows.
                    original = add_activity(self.scene(device), 'steps')
                    saved = copy.deepcopy(original)
                    edited = add_activity(add_activity(original, source), source)
                    expected_count = len(original['elements']) + (4 if source in ACTIVITY_GROUPS else 2)
                    self.assertEqual(original, saved)
                    self.assertEqual(edited['elements'][:len(saved['elements'])], saved['elements'])
                    self.assertEqual(len(edited['elements']), expected_count)
                    self.assertEqual(len({e['id'] for e in edited['elements']}), expected_count)
                    self.assertEqual(validate_scene(edited), edited)
                    mapped = bridge.layout({'scene': edited})
                    self.assertEqual(len(mapped['areas']), expected_count)
                    self.assertTrue(mapped['ops'])

    def test_icons_keep_all_pixels_inside_their_boxes_and_use_night_colour(self):
        masks = []
        for source in ICON_MASKS:
            for width, height in ((1, 1), (12, 16), (24, 32), (37, 23)):
                element = dict(source=source, x=80, y=90, width=width, height=height,
                               colour=0xffffff, nightColour=0x123456)
                for night in (False, True):
                    ops = chart_ops(element, night=night)
                    self.assertTrue(all(op['x'] >= 80 and op['y'] >= 90 and
                        op['x']+op['width'] <= 80+width and op['y']+op['height'] <= 90+height for op in ops))
                    self.assertTrue(all(op['colour'] == element['nightColour' if night else 'colour'] for op in ops))
            masks.append(chart_ops(element))
        self.assertEqual(masks[0], masks[1])
        self.assertNotEqual(masks[1], masks[2])

    def test_original_parent_icon_coverage_is_preserved_at_native_size(self):
        self.assertEqual({path.name for path in icon_asset_paths()}, {
            'footsteps.png', 'run.png', 'stairs.png', 'heart.png', 'temperature.png', 'temperature-sun.png',
            'sunrise.png', 'sunset.png', 'sun.png', 'cloud.png', 'cloud-rain.png', 'cloud-storm.png',
            'snowflake.png', 'wind.png', 'mist.png'})
        for source, name in ICON_MASKS.items():
            data = (ICON_DIRECTORY / f'{name}.png').read_bytes()
            width, height = struct.unpack('>II', data[16:24])
            element = add_activity(self.scene(), source)['elements'][-1]
            self.assertEqual((element['width'], element['height']), (width, height))
            element.update(x=0, y=0)
            operations = chart_ops(element)
            actual = {(op['x']+x, op['y']+y) for op in operations
                      for y in range(op['height']) for x in range(op['width'])}
            alpha = subprocess.check_output(['magick', 'png:-', '-alpha', 'extract', '-depth', '8', 'gray:-'], input=data)
            expected = {(x, y) for y in range(height) for x in range(width) if alpha[y*width+x] >= 128}
            self.assertEqual(actual, expected)
            self.assertEqual(sum(op['width']*op['height'] for op in operations), len(actual))
            self.assertEqual(len(operations), len(set((op['x'], op['y'], op['width'], op['height']) for op in operations)))

    def test_icon_asset_changes_invalidate_both_mapping_and_export_identity(self):
        from designer_export import scene_application_id
        scene = self.scene()
        with tempfile.TemporaryDirectory() as directory:
            icon = Path(directory) / "icon.png"
            icon.write_bytes(b"first coverage")
            with patch("designer_activity.icon_asset_paths", return_value=(icon,)):
                mapping = bridge.mapping(scene)
                identity = scene_application_id(scene)
                icon.write_bytes(b"updated coverage")
                self.assertNotEqual(mapping, bridge.mapping(scene))
                self.assertNotEqual(identity, scene_application_id(scene))

    def test_add_bridge_accepts_activity_sources_and_rejects_unexpected_payloads(self):
        mapped = bridge.dispatch(dict(operation="add", payload=dict(scene=self.scene(), source="walkWeek")))
        self.assertEqual(mapped['scene']['elements'][0]['source'], 'walkWeek')
        self.assertEqual(len(mapped['ops']), 7)
        for payload in (dict(scene=self.scene(), source="unknown"),
                        dict(scene=self.scene(), source="steps", unexpected=True)):
            with self.assertRaises(ValueError):
                bridge.dispatch(dict(operation="add", payload=payload))

    def test_capacity_and_unknown_sources_are_rejected(self):
        scene = self.scene()
        for _ in range(40):
            scene = add_activity(scene, 'stepsIcon')
        with self.assertRaises(ValueError):
            add_activity(scene, 'steps')
        with self.assertRaises(ValueError):
            add_activity(self.scene(), 'unknown')

    def test_live_and_proof_exports_keep_icon_pixels_and_walking_bindings(self):
        scene = self.scene()
        # Keep the walking-provider regression focused on its original sources;
        # weather and heart-rate export have their own complete fixtures.
        walking_sources = {'floors', 'floorsWeek', 'steps', 'weeklyWalk', 'weeklyRun',
                           'stepsWeek', 'walkWeek', 'runWeek', 'floorsIcon', 'stepsIcon', 'walkIcon', 'runIcon'}
        for source in sorted(walking_sources):
            scene = add_activity(scene, source)
        for proof in (False, True):
            with tempfile.TemporaryDirectory() as directory:
                project = export_tests.DesignerExportTests().project(directory)
                prepare_scene_project(project, scene, proof=proof)
                code = (Path(project)/'source/DesignerView.mc').read_text()
                provider = (Path(project)/'source/EpixCanvasComplications.mc').read_text()
                self.assertIn('case "floors": return _provider.designerValue(4);', code)
                self.assertIn('case "floorsWeek": return _snapshot.weeklyFloorCounts;', code)
                self.assertIn('case "walkWeek": return _snapshot.weeklyWalkDistances;', code)
                self.assertIn('case "weeklyWalk": return _provider.designerValue(-5);', code)
                self.assertIn('_slotTypes = [-5, 2, 4, 19];', provider)
                self.assertIn('_widgetTypes = [-5, 2, 4, 19];', provider)
                self.assertIn('|| element[10].equals("icon")', code)
                for element in scene['elements']:
                    if element['source'] in ICON_MASKS:
                        from designer_export import _mc
                        rectangles = [[op[k] for k in ('x','y','width','height','colour')] for op in chart_ops(element)]
                        self.assertIn(_mc(rectangles), code)

    def test_activity_companions_are_atomic_native_layouts_on_every_device(self):
        from itertools import product
        from designer_activity import ACTIVITY_GROUPS
        for device, (source, companions), icon, graph in product(
                DEVICES, ACTIVITY_GROUPS.items(), (False, True), (False, True)):
            with self.subTest(device=device, source=source, icon=icon, graph=graph):
                original = add_activity(self.scene(device), 'steps')
                saved = copy.deepcopy(original)
                if graph and companions[1] is None:
                    with self.assertRaisesRegex(ValueError, 'does not have a weekly graph'):
                        add_activity(original, source, dict(icon=icon, graph=graph))
                    self.assertEqual(original, saved)
                    continue
                edited = add_activity(original, source, dict(icon=icon, graph=graph))
                self.assertEqual(original, saved)
                self.assertEqual(edited['elements'][:len(original['elements'])], original['elements'])
                added = edited['elements'][len(original['elements']):]
                expected = [source] + ([companions[0]] if icon else []) + ([companions[1]] if graph else [])
                self.assertEqual([element['source'] for element in added], expected)
                self.assertEqual(len({element['id'] for element in edited['elements']}), len(edited['elements']))
                for i, first in enumerate(added):
                    for second in added[i+1:]:
                        self.assertTrue(first['x']+first['width'] <= second['x'] or
                            second['x']+second['width'] <= first['x'] or
                            first['y']+first['height'] <= second['y'] or
                            second['y']+second['height'] <= first['y'])
                left = min(element['x'] for element in added)
                right = max(element['x']+element['width'] for element in added)
                top = min(element['y'] for element in added)
                bottom = max(element['y']+element['height'] for element in added)
                self.assertLessEqual(abs(left+right-DEVICES[device]), 1)
                self.assertLessEqual(abs(top+bottom-DEVICES[device]), 1)
                self.assertEqual(validate_scene(edited), edited)

    def test_activity_options_enforce_capacity_before_adding_any_companion(self):
        scene = self.scene()
        for _ in range(38):
            scene = add_activity(scene, 'stepsIcon')
        original = copy.deepcopy(scene)
        with self.assertRaisesRegex(ValueError, 'needs 3 element slots'):
            add_activity(scene, 'floors', dict(icon=True, graph=True))
        self.assertEqual(scene, original)
        edited = add_activity(scene, 'floors', dict(icon=True))
        self.assertEqual(len(edited['elements']), 40)
        self.assertEqual([item['source'] for item in edited['elements'][-2:]], ['floors', 'floorsIcon'])
        self.assertEqual(scene, original)

    def test_bridge_accepts_partial_options_and_rejects_invalid_option_payloads(self):
        for options, sources in (({}, ['steps', 'stepsIcon']), ({'icon': True}, ['steps', 'stepsIcon']),
                                 ({'icon': False}, ['steps']), ({'graph': True}, ['steps', 'stepsIcon', 'stepsWeek'])):
            mapped = bridge.dispatch(dict(operation='add', payload=dict(scene=self.scene(), source='steps', options=options)))
            self.assertEqual([item['source'] for item in mapped['scene']['elements']], sources)
        for options in (None, [], True, {'icon': 1}, {'graph': 'true'}, {'extra': False}, {'icon': None}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                bridge.dispatch(dict(operation='add', payload=dict(scene=self.scene(), source='steps', options=options)))
        for source in ('time', 'numericDate', 'divider', 'stepsIcon', 'stepsWeek'):
            with self.subTest(source=source), self.assertRaises(ValueError):
                bridge.dispatch(dict(operation='add', payload=dict(scene=self.scene(), source=source, options={})))

    def test_boundary_failure_never_changes_the_original_scene(self):
        scene = self.scene()
        scene['edgeInset'] = DEVICES[scene['device']] // 2 - 30
        saved = copy.deepcopy(scene)
        with self.assertRaises(ValueError):
            add_activity(scene, 'weeklyRun', dict(icon=True, graph=True))
        self.assertEqual(scene, saved)

    def test_default_stack_has_linked_icon_above_value_with_exact_gap(self):
        from designer_activity import ACTIVITY_GROUPS
        for device in DEVICES:
            for source in ACTIVITY_GROUPS:
                with self.subTest(device=device, source=source):
                    scene = add_activity(self.scene(device), source)
                    value, icon = scene['elements']
                    self.assertTrue(value['moveTogether'])
                    self.assertEqual(icon['activityId'], value['id'])
                    self.assertEqual(value['y'] - (icon['y'] + icon['height']), 16)
                    self.assertLessEqual(abs((2*value['x']+value['width'])-(2*icon['x']+icon['width'])), 1)

    def test_icon_only_attaches_to_latest_missing_role_without_duplicating_data(self):
        original = add_activity(self.scene(), 'steps', {'icon': False})
        original = add_activity(original, 'steps', {'icon': False})
        saved = copy.deepcopy(original)
        edited = add_activity(original, 'steps', {'value': False, 'icon': True})
        self.assertEqual(original, saved)
        self.assertEqual(len(edited['elements']), 3)
        self.assertEqual(edited['elements'][:2], saved['elements'])
        self.assertEqual(edited['elements'][-1]['activityId'], original['elements'][-1]['id'])
        self.assertEqual(edited['elements'][-1]['source'], 'stepsIcon')
        older = add_activity(edited, 'steps', {'value': False, 'icon': True})
        self.assertEqual(older['elements'][-1]['activityId'], original['elements'][0]['id'])
        loose = add_activity(older, 'steps', {'value': False, 'icon': True})
        self.assertNotIn('activityId', loose['elements'][-1])
        self.assertEqual(sum(item['source'] == 'steps' for item in loose['elements']), 2)

    def test_companion_only_empty_selection_and_invalid_value_flag_are_rejected(self):
        for options in ({'value': False, 'icon': False, 'graph': False}, {'value': 1}):
            with self.assertRaises(ValueError):
                add_activity(self.scene(), 'steps', options)
        loose = add_activity(self.scene(), 'steps', {'value': False, 'icon': False, 'graph': True})
        self.assertEqual([item['source'] for item in loose['elements']], ['stepsWeek'])
        self.assertNotIn('activityId', loose['elements'][0])

    def test_activity_metadata_rejects_dangling_wrong_and_duplicate_links(self):
        scene = add_activity(self.scene(), 'steps')
        for bad_link in ('missing', scene['elements'][1]['id'], True):
            invalid = copy.deepcopy(scene)
            invalid['elements'][1]['activityId'] = bad_link
            with self.assertRaises(ValueError):
                validate_scene(invalid)
        wrong = copy.deepcopy(scene)
        wrong['elements'][1]['source'] = 'runIcon'
        with self.assertRaises(ValueError):
            validate_scene(wrong)
        duplicate = copy.deepcopy(scene)
        duplicate['elements'].append({**duplicate['elements'][1], 'id': 'extra-icon'})
        with self.assertRaises(ValueError):
            validate_scene(duplicate)
        wrong_toggle = copy.deepcopy(scene)
        wrong_toggle['elements'][1]['moveTogether'] = True
        with self.assertRaises(ValueError):
            validate_scene(wrong_toggle)
        wrong_toggle = copy.deepcopy(scene)
        wrong_toggle['elements'][0]['moveTogether'] = 1
        with self.assertRaises(ValueError):
            validate_scene(wrong_toggle)
        scene['elements'][0]['moveTogether'] = False
        self.assertFalse(validate_scene(scene)['elements'][0]['moveTogether'])

    def test_graph_toggle_from_any_group_member_is_idempotent_and_keeps_data_fixed(self):
        from designer_activity import set_activity_graph
        scene = add_activity(self.scene(), 'floors')
        saved = copy.deepcopy(scene)
        enabled = set_activity_graph(scene, scene['elements'][1]['id'], True)
        self.assertEqual(scene, saved)
        self.assertEqual(enabled['elements'][:2], scene['elements'])
        graph = enabled['elements'][-1]
        self.assertEqual(graph['activityId'], scene['elements'][0]['id'])
        self.assertEqual(graph['y'] - (scene['elements'][0]['y'] + scene['elements'][0]['height']), 16)
        self.assertEqual(set_activity_graph(enabled, graph['id'], True), enabled)
        disabled = set_activity_graph(enabled, graph['id'], False)
        self.assertEqual(disabled, scene)
        self.assertEqual(set_activity_graph(disabled, scene['elements'][0]['id'], False), disabled)
        mapped = bridge.dispatch(dict(operation='activity-graph', payload=dict(scene=scene, elementId=scene['elements'][0]['id'], enabled=True)))
        self.assertEqual(len(mapped['scene']['elements']), 3)
        for payload in (dict(scene=scene, elementId=scene['elements'][0]['id'], enabled=1),
                        dict(scene=scene, elementId='missing', enabled=True),
                        dict(scene=scene, elementId=scene['elements'][0]['id'], enabled=True, extra=False)):
            with self.assertRaises(ValueError):
                bridge.dispatch(dict(operation='activity-graph', payload=payload))

    def test_graph_failure_is_atomic_at_capacity_and_near_boundary(self):
        from designer_activity import set_activity_graph
        scene = add_activity(self.scene(), 'steps')
        for _ in range(38):
            scene = add_activity(scene, 'stepsIcon')
        saved = copy.deepcopy(scene)
        with self.assertRaises(ValueError):
            set_activity_graph(scene, scene['elements'][0]['id'], True)
        self.assertEqual(scene, saved)
        near_edge = add_activity(self.scene(), 'steps', {'icon': False})
        near_edge['elements'][0]['y'] = 340
        near_edge = validate_scene(near_edge)
        saved = copy.deepcopy(near_edge)
        with self.assertRaises(ValueError):
            set_activity_graph(near_edge, near_edge['elements'][0]['id'], True)
        self.assertEqual(near_edge, saved)

    def test_copy_and_delete_preserve_valid_linked_activity_scenes(self):
        from designer_actions import copy_element, delete_element
        scene = add_activity(self.scene(), 'steps', {'graph': True})
        parent, icon, graph = scene['elements']
        copied_icon = copy_element(scene, icon['id'])
        duplicate = next(item for item in copied_icon['elements'] if item['id'] not in {old['id'] for old in scene['elements']})
        self.assertNotIn('activityId', duplicate)
        copied_value = copy_element(scene, parent['id'])
        duplicate = next(item for item in copied_value['elements'] if item['id'] not in {old['id'] for old in scene['elements']})
        self.assertNotIn('moveTogether', duplicate)
        deleted = delete_element(scene, parent['id'])
        self.assertEqual(len(deleted['elements']), 2)
        self.assertTrue(all('activityId' not in item for item in deleted['elements']))
        self.assertEqual(delete_element(scene, graph['id'])['elements'], scene['elements'][:2])
