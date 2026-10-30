"""Activity insertion, icon clipping and native export contracts."""
import copy
import tempfile
import unittest
from pathlib import Path

from designer_activity import ACTIVITY_SOURCES, ICON_MASKS, add_activity
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
            original = self.scene(device)
            edited = copy.deepcopy(original)
            for source in sorted(ACTIVITY_SOURCES):
                edited = add_activity(edited, source)
                edited = add_activity(edited, source)
            self.assertEqual(original, self.scene(device))
            self.assertEqual(len(edited['elements']), 18)
            self.assertEqual(len({e['id'] for e in edited['elements']}), 18)
            self.assertEqual(validate_scene(edited), edited)
            mapped = bridge.layout({'scene': edited})
            self.assertEqual(len(mapped['areas']), 18)
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
        self.assertNotEqual(masks[0], masks[1])
        self.assertNotEqual(masks[1], masks[2])

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
        for source in sorted(ACTIVITY_SOURCES):
            scene = add_activity(scene, source)
        for proof in (False, True):
            with tempfile.TemporaryDirectory() as directory:
                project = export_tests.DesignerExportTests().project(directory)
                prepare_scene_project(project, scene, proof=proof)
                code = (Path(project)/'source/DesignerView.mc').read_text()
                provider = (Path(project)/'source/EpixCanvasComplications.mc').read_text()
                self.assertIn('case "walkWeek": return _snapshot.weeklyWalkDistances;', code)
                self.assertIn('case "weeklyWalk": return _provider.designerValue(-5);', code)
                self.assertIn('_slotTypes = [-5, 2, 19];', provider)
                self.assertIn('_widgetTypes = [-5, 2, 19];', provider)
                self.assertIn('|| element[10].equals("icon")', code)
                for element in scene['elements']:
                    if element['source'] in ICON_MASKS:
                        from designer_export import _mc
                        rectangles = [[op[k] for k in ('x','y','width','height','colour')] for op in chart_ops(element)]
                        self.assertIn(_mc(rectangles), code)
