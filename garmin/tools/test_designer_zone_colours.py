"""Zone palettes retain native preview colours and independent live preset links."""
import copy
import json
import re
import tempfile
import unittest

import bridge
import designer_export
import test_designer_export as export_fixtures
from designer_activity import add_activity
from designer_actions import set_colour_presets, set_element_colour, set_element_colour_preset
from designer_charts import chart_ops, device_colour, shade
from designer_colours import DEFAULT_ZONE_COLOURS
from designer_model import validate_scene


class ZoneColourTests(unittest.TestCase):
    def scene(self, source="heartZones"):
        return add_activity({"version": 2, "name": "Zones", "device": "epix2pro47mm", "background": 0,
                             "edgeInset": 16, "elements": []}, source)

    def test_legacy_palettes_and_custom_bands_match_native_preview_in_both_appearances(self):
        for source in ("heartZones", "temperatureZones"):
            scene = self.scene(source)
            element = scene["elements"][0]
            identity = element["id"]
            for night in (False, True):
                self.assertEqual([op["colour"] for op in chart_ops(element, value=5 if source == "heartZones" else -5, night=night)],
                                 [colour if index == 0 else shade(colour, 24) for index, colour in enumerate(DEFAULT_ZONE_COLOURS)])
            edited = set_element_colour(scene, identity, "day:zone:0", 0xFA1234)
            edited = set_element_colour(edited, identity, "night:zone:0", 0x12FA34)
            self.assertEqual(edited["elements"][0]["zoneColours"], [0xFA1234, *DEFAULT_ZONE_COLOURS[1:]])
            for night, colour in ((False, 0xFA1234), (True, 0x12FA34)):
                operations = bridge.layout({"scene": edited, "night": night})["ops"]
                # Heart sample 64 activates the first band, temperature sample 17 the third.
                expected = colour if source == "heartZones" else shade(colour, 24)
                self.assertEqual(operations[0]["colour"], device_colour(expected))
            self.assertNotIn("zoneColours", scene["elements"][0])

    def test_band_presets_update_live_and_detach_without_recolouring_other_bands(self):
        scene = self.scene()
        identity = scene["elements"][0]["id"]
        preset = {"id": "accent", "name": "Accent", "colour": 0x123456}
        scene = set_colour_presets(scene, [preset])
        scene = set_element_colour_preset(scene, identity, "day:zone:2", "accent")
        scene = set_element_colour_preset(scene, identity, "night:zone:3", "accent")
        before = copy.deepcopy(scene)
        changed = set_colour_presets(scene, [{**preset, "colour": 0xFEDCBA}])
        self.assertEqual(scene, before)
        self.assertEqual(changed["elements"][0]["zoneColours"][2], 0xFEDCBA)
        self.assertEqual(changed["elements"][0]["nightZoneColours"][3], 0xFEDCBA)
        detached = set_colour_presets(changed, [])
        self.assertEqual(detached["elements"][0]["zoneColours"], changed["elements"][0]["zoneColours"])
        self.assertNotIn("zoneColourPresetIds", detached["elements"][0])
        self.assertNotIn("nightZoneColourPresetIds", detached["elements"][0])

    def test_whole_chart_colour_and_presets_apply_to_every_band_and_preserve_other_appearance(self):
        scene = self.scene()
        identity = scene["elements"][0]["id"]
        scene = set_colour_presets(scene, [{"id": "accent", "name": "Accent", "colour": 0x123456}])
        scene = set_element_colour_preset(scene, identity, "day:zone:2", "accent")
        scene = set_element_colour(scene, identity, "day", 0x654321)
        self.assertEqual(scene["elements"][0]["zoneColours"], [0x654321] * 5)
        self.assertNotIn("zoneColourPresetIds", scene["elements"][0])
        self.assertNotIn("nightZoneColours", scene["elements"][0])
        scene = set_element_colour_preset(scene, identity, "day", "accent")
        scene = set_colour_presets(scene, [{"id": "accent", "name": "Accent", "colour": 0xFEDCBA}])
        self.assertEqual(scene["elements"][0]["zoneColours"], [0xFEDCBA] * 5)
        scene = set_element_colour(scene, identity, "day:zone:1", 0)
        self.assertEqual(scene["elements"][0]["zoneColours"], [0xFEDCBA, 0, 0xFEDCBA, 0xFEDCBA, 0xFEDCBA])
        self.assertNotIn("colourPresetId", scene["elements"][0])

    def test_native_export_keeps_both_palettes_and_palette_edits_invalidate_mapping(self):
        for source in ("heartZones", "temperatureZones"):
            scene = self.scene(source)
            identity = scene["elements"][0]["id"]
            token = bridge.mapping(scene)
            scene = set_element_colour(scene, identity, "day:zone:0", 0x123456)
            scene = set_element_colour(scene, identity, "night:zone:4", 0xFEDCBA)
            self.assertNotEqual(bridge.mapping(scene), token)
            with tempfile.TemporaryDirectory() as temporary:
                project = export_fixtures.DesignerExportTests().project(temporary)
                designer_export.prepare_scene_project(project, scene)
                native = (project / "source/DesignerView.mc").read_text()
                rows = json.loads(re.search(r"private var _elements as Array<Array> = (.*);", native).group(1))
                self.assertEqual(rows[0][23], scene["elements"][0]["zoneColours"])
                self.assertEqual(rows[0][24], scene["elements"][0]["nightZoneColours"])
                self.assertIn("night ? element[24] : element[23]", native)

    def test_invalid_palettes_channels_and_links_are_rejected_atomically(self):
        scene = self.scene()
        before = copy.deepcopy(scene)
        identity = scene["elements"][0]["id"]
        for channel in ("day:zone:5", "day:zone:-1", "night:zone:0extra", [], True):
            with self.assertRaises(ValueError):
                set_element_colour(scene, identity, channel, 0)
        for field, value in (("zoneColours", []), ("zoneColours", [0] * 6), ("zoneColours", [0, 0, True, 0, 0]),
                             ("zoneColourPresetIds", [None] * 5), ("nightZoneColours", [0, 0, -1, 0, 0])):
            invalid = copy.deepcopy(scene)
            invalid["elements"][0][field] = value
            with self.assertRaises(ValueError):
                validate_scene(invalid)
        self.assertEqual(scene, before)

    def test_zone_links_reject_unknown_and_stale_values_and_other_sources(self):
        scene = self.scene()
        identity = scene["elements"][0]["id"]
        scene = set_colour_presets(scene, [{"id": "accent", "name": "Accent", "colour": 0x123456}])
        scene = set_element_colour_preset(scene, identity, "day:zone:0", "accent")
        for links in (["missing", None, None, None, None], [True, None, None, None, None], ["accent"]):
            invalid = copy.deepcopy(scene)
            invalid["elements"][0]["zoneColourPresetIds"] = links
            with self.assertRaises(ValueError):
                validate_scene(invalid)
        invalid = copy.deepcopy(scene)
        invalid["elements"][0]["zoneColours"][0] = 0
        with self.assertRaises(ValueError):
            validate_scene(invalid)
        other = self.scene("stepsWeek")
        with self.assertRaises(ValueError):
            set_element_colour(other, other["elements"][0]["id"], "day:zone:0", 0)

    def test_whole_chart_unlink_detaches_all_bands_and_keeps_both_palettes(self):
        for appearance, links_key, other_links_key in (("day", "zoneColourPresetIds", "nightZoneColourPresetIds"),
                                                       ("night", "nightZoneColourPresetIds", "zoneColourPresetIds")):
            scene = self.scene()
            identity = scene["elements"][0]["id"]
            preset = {"id": "accent", "name": "Accent", "colour": 0x123456}
            scene = set_colour_presets(scene, [preset])
            scene = set_element_colour_preset(scene, identity, "day:zone:2", "accent")
            scene = set_element_colour_preset(scene, identity, "night:zone:3", "accent")
            before = copy.deepcopy(scene)
            scene = set_element_colour_preset(scene, identity, appearance, None)
            element = scene["elements"][0]
            self.assertNotIn(links_key, element)
            self.assertEqual(element[other_links_key], before["elements"][0][other_links_key])
            self.assertEqual(element["zoneColours"], before["elements"][0]["zoneColours"])
            self.assertEqual(element["nightZoneColours"], before["elements"][0]["nightZoneColours"])
            changed = set_colour_presets(scene, [{**preset, "colour": 0xFEDCBA}])
            palette_key = "zoneColours" if appearance == "day" else "nightZoneColours"
            self.assertEqual(changed["elements"][0][palette_key], before["elements"][0][palette_key])
