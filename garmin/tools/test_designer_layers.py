"""Layer order is shared by mapped ink and the generated native scene."""
import copy
import itertools
import json
import re
import tempfile
import unittest

import bridge
import designer_activity as activity
import designer_export as exporter
import designer_model as model
import test_designer_export as export_fixtures


class LayerTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm"):
        centre = model.DEVICES[device] // 2
        base = dict(font="widget", x=centre-40, y=centre-30, width=80, height=60,
                    align="centre", colour=0xff0000, nightColour=0x0000ff, visible="both")
        return dict(version=2, name="Layers", device=device, background=0, elements=[
            dict(base, id="back", source="label", text="BACK", boxSizing="fixed"),
            dict(base, id="day", source="label", text="DAY", visible="day", boxSizing="fixed"),
            dict(base, id="night", source="label", text="NIGHT", visible="night", boxSizing="fixed"),
            dict(base, id="icon", source="stepsIcon"),
        ])

    def test_overlapping_native_operations_follow_reordered_layers_in_day_and_night(self):
        for device in model.DEVICES:
            original = self.scene(device)
            for order in ((0, 1, 2, 3), (3, 2, 0, 1), (1, 0, 3, 2)):
                scene = {**original, "elements": [original["elements"][index] for index in order]}
                for night in (False, True):
                    with self.subTest(device=device, order=order, night=night):
                        mapped = bridge.layout({"scene": scene, "night": night})
                        expected = [element["id"] for element in scene["elements"]
                                    if element["visible"] != ("day" if night else "night")]
                        owners = [owner for owner, _ in itertools.groupby(
                            operation["elementId"] for operation in mapped["ops"])]
                        self.assertEqual(owners, expected)
                        self.assertEqual([area["id"] for area in mapped["areas"]], expected)

    def test_generated_native_rows_preserve_the_same_order_and_visibility(self):
        for device in model.DEVICES:
            scene = self.scene(device)
            scene["elements"] = [scene["elements"][index] for index in (3, 2, 0, 1)]
            for night in (False, True):
                with self.subTest(device=device, night=night), tempfile.TemporaryDirectory() as directory:
                    project = export_fixtures.DesignerExportTests().project(directory)
                    exporter.prepare_scene_project(project, scene, proof=True, preview_night=night)
                    source = (project / "source/DesignerView.mc").read_text()
                    encoded = re.search(r"private var _elements as Array<Array> = (.*);", source)
                    self.assertIsNotNone(encoded)
                    rows = json.loads(encoded.group(1))
                    self.assertEqual([row[9] or row[0] for row in rows], ["stepsIcon", "NIGHT", "BACK", "DAY"])
                    self.assertEqual([row[8] for row in rows], [0, 2, 0, 1])

    def test_reordering_companions_before_data_preserves_activity_links(self):
        scene = activity.add_activity({"version": 2, "name": "Linked layers", "device": "epix2pro47mm",
                                       "background": 0, "elements": []},
                                      "steps", {"value": True, "icon": True, "graph": True})
        before = copy.deepcopy(scene)
        reordered = {**scene, "elements": list(reversed(scene["elements"]))}
        self.assertEqual(model.validate_scene(reordered), reordered)
        self.assertEqual(scene, before)
        self.assertEqual([element["activityId"] for element in reordered["elements"][:-1]],
                         [scene["elements"][0]["id"]] * 2)
        self.assertEqual([area["id"] for area in bridge.layout({"scene": reordered})["areas"]],
                         [element["id"] for element in reordered["elements"]])


if __name__ == "__main__":
    unittest.main()
