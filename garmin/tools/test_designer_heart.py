"""Heart-rate data and the original native icon share editor and export paths."""
import copy
import json
import re
import struct
import tempfile
import unittest

import bridge
import designer_activity as activity
import designer_export as exporter
import designer_model as model
import designer_typography as typography
from designer_charts import chart_ops
import test_designer_export as export_fixtures


class HeartTests(unittest.TestCase):
    def scene(self, device="epix2pro47mm"):
        return dict(version=2, name="Heart rate", device=device, background=0, edgeInset=16, elements=[])

    def test_heart_rate_and_icon_add_as_linked_pair_on_every_device(self):
        for device in model.DEVICES:
            original = self.scene(device)
            saved = copy.deepcopy(original)
            mapped = bridge.dispatch(dict(operation="add", payload=dict(scene=original, source="heartRate")))
            value, icon = mapped["scene"]["elements"]
            self.assertEqual(original, saved)
            self.assertEqual([value["source"], icon["source"]], ["heartRate", "heartIcon"])
            self.assertEqual(icon["activityId"], value["id"])
            self.assertTrue(value["moveTogether"])
            self.assertEqual(value["y"] - icon["y"] - icon["height"], 16)
            self.assertTrue(any(operation["elementId"] == icon["id"] for operation in mapped["ops"]))
            self.assertEqual(model.validate_scene(mapped["scene"]), mapped["scene"])

    def test_individual_parts_and_typography_keep_expected_controls(self):
        value_only = activity.add_activity(self.scene(), "heartRate", {"icon": False})
        self.assertEqual([element["source"] for element in value_only["elements"]], ["heartRate"])
        icon_only = activity.add_activity(value_only, "heartRate", {"value": False, "icon": True})
        self.assertEqual(icon_only["elements"][-1]["activityId"], value_only["elements"][0]["id"])
        standalone = activity.add_activity(self.scene(), "heartIcon")
        self.assertEqual(standalone["elements"][0]["source"], "heartIcon")
        self.assertNotIn("activityId", standalone["elements"][0])
        styled = typography.apply(icon_only, icon_only["elements"][0]["id"],
                                  dict(family="widget", size=28, thickness=0, width=100, letterSpacing=1))
        self.assertEqual(styled["elements"][0]["typography"]["size"], 28)

    def test_heart_graph_requests_fail_without_changing_scene(self):
        scene = activity.add_activity(self.scene(), "heartRate")
        saved = copy.deepcopy(scene)
        with self.assertRaisesRegex(ValueError, "does not have a weekly graph"):
            activity.add_activity(scene, "heartRate", {"graph": True})
        with self.assertRaisesRegex(ValueError, "does not have a weekly graph"):
            activity.set_activity_graph(scene, scene["elements"][1]["id"], True)
        self.assertEqual(activity.set_activity_graph(scene, scene["elements"][0]["id"], False), scene)
        self.assertEqual(scene, saved)

    def test_heart_icon_is_original_asset_with_day_and_night_native_export_rows(self):
        data = (activity.ICON_DIRECTORY / "heart.png").read_bytes()
        dimensions = struct.unpack(">II", data[16:24])
        for device in model.DEVICES:
            scene = activity.add_activity(self.scene(device), "heartRate")
            icon = scene["elements"][1]
            self.assertEqual((icon["width"], icon["height"]), dimensions)
            for night in (False, True):
                mapped = bridge.layout(dict(scene=scene, night=night))
                actual = [operation for operation in mapped["ops"] if operation["elementId"] == icon["id"]]
                self.assertTrue(actual)
                with tempfile.TemporaryDirectory() as directory:
                    project = export_fixtures.DesignerExportTests().project(directory)
                    exporter.prepare_scene_project(project, scene)
                    source = (project / "source/DesignerView.mc").read_text()
                    encoded = re.search(r"private var _elements as Array<Array> = (.*);", source)
                    rows = json.loads(encoded.group(1))
                    self.assertEqual([row[0] for row in rows], ["heartRate", "heartIcon"])
                    rectangles = rows[1][13 if night else 12]
                    self.assertEqual(rectangles, [[operation[key] for key in ("x", "y", "width", "height", "colour")]
                                                 for operation in chart_ops(icon, night=night)])
                    provider = (project / "source/EpixCanvasComplications.mc").read_text()
                    self.assertIn('_slotTypes = [18];', provider)
                    self.assertIn('case "heartRate": return _provider.designerValue(18);', source)


if __name__ == "__main__":
    unittest.main()
