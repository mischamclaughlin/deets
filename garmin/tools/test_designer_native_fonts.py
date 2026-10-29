"""Production Garmin font resources preserve canonical masks and native layout."""

from contextlib import contextmanager
import copy
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET

import audit_font_rendering as audit
import bridge
import designer_export as exporter
from designer_charts import device_colour
import designer_model as model
import designer_seconds as seconds
import designer_typography as typography
import test_designer_export as fixtures


def descriptor(path):
    return {
        fields["id"]: fields
        for line in path.read_text().splitlines()
        if line.startswith("char id=")
        for fields in [
            {name: int(value) for name, value in re.findall(r"(\w+)=(-?\d+)", line)}
        ]
    }


@contextmanager
def prepared(scene):
    with tempfile.TemporaryDirectory() as temporary:
        project = fixtures.DesignerExportTests().project(temporary)
        exporter.prepare_scene_project(project, scene)
        yield project


class NativeFontTests(unittest.TestCase):
    def test_resource_masks_and_glyph_metrics_match_including_half_seconds(self):
        scene = audit.scenes("epix2pro47mm")["mixed"]
        scene = typography.set_clock_source(scene, "time", "timeSeconds")
        scene = typography.set_seconds_size(scene, "time", "half")
        scene = typography.add_divider(scene)
        divider_id = scene["elements"][-1]["id"]
        scene = typography.set_divider_symbol(scene, divider_id, "/")
        pack = model.scene_font_pack(scene)
        fonts = sorted({element["font"] for element in scene["elements"]})
        with prepared(scene) as project:
            half_codes = set()
            for index, key in enumerate(fonts):
                entries = descriptor(
                    project / f"resources/designer-fonts/font-{index}.fnt"
                )
                required = set().union(
                    *(
                        exporter._element_codes(element, model.SOURCES, False)
                        for element in scene["elements"]
                        if element["font"] == key
                    )
                )
                expected_codes = {
                    int(code)
                    for code, glyph in pack["fonts"][key]["glyphs"].items()
                    if int(code) in required
                    and glyph["width"] > 0
                    and glyph["height"] > 0
                }
                self.assertEqual(set(entries), expected_codes)
                for code, fields in entries.items():
                    glyph = pack["fonts"][key]["glyphs"][str(code)]
                    for field in ("x", "y", "width", "height", "xadvance"):
                        self.assertEqual(fields[field], glyph[field])
                    self.assertEqual(fields["xoffset"], 0)
                    self.assertEqual(fields["yoffset"], 0)
                    self.assertGreater(fields["width"] * fields["height"], 0)
                    if code >= seconds.HALF_CODE_OFFSET:
                        half_codes.add(code)
                _, _, expected = typography._raw(pack["images"][key])
                actual = subprocess.check_output(
                    [
                        "magick",
                        str(project / f"resources/designer-fonts/font-{index}.png"),
                        "-depth",
                        "8",
                        "gray:-",
                    ]
                )
                self.assertEqual(actual, expected)
            self.assertTrue(
                {
                    ord(char) + seconds.HALF_CODE_OFFSET
                    for char in seconds.HALF_CHARACTERS
                }
                <= half_codes
            )

    def test_day_and_night_colours_share_one_resource_per_style(self):
        scene = audit.scenes("epix2pro47mm")["simple"]
        scene = typography.add_time(scene)
        scene = typography.apply(
            scene, "time-2", dict(scene["elements"][0]["typography"])
        )
        for index, element in enumerate(scene["elements"]):
            element.update(colour=0x123456 + index, nightColour=0xABCDEF - index)
        first = model.validate_scene(scene)
        changed = copy.deepcopy(first)
        for index, element in enumerate(changed["elements"]):
            element.update(colour=0xFF0000 + index, nightColour=0x00FF00 + index)
        self.assertEqual(len({element["font"] for element in first["elements"]}), 1)
        with prepared(first) as original_project, prepared(changed) as changed_project:
            for project in (original_project, changed_project):
                resources = list(
                    ET.parse(project / "resources/designer-fonts.xml")
                    .getroot()
                    .iter("font")
                )
                self.assertEqual(len(resources), 1)
                self.assertEqual(resources[0].attrib["id"], "DesignerFont0")
            for filename in ("font-0.fnt", "font-0.png"):
                self.assertEqual(
                    (
                        original_project / "resources/designer-fonts" / filename
                    ).read_bytes(),
                    (
                        changed_project / "resources/designer-fonts" / filename
                    ).read_bytes(),
                )
            self.assertNotEqual(
                (original_project / "source/DesignerView.mc").read_bytes(),
                (changed_project / "source/DesignerView.mc").read_bytes(),
            )

    def test_blank_glyphs_keep_layout_advance_and_empty_scene_has_no_font_resources(
        self,
    ):
        scene = typography.add_date(audit.base("epix2pro47mm"))
        scene = typography.set_date_source(scene, "date", "date")
        element = scene["elements"][0]
        font = model.scene_font_pack(scene)["fonts"][element["font"]]
        operations = model.layout_text(
            "M M", {**element, "x": 0, "width": 500, "align": "left"}, font
        )
        self.assertEqual(len(operations), 2)
        self.assertEqual(
            operations[1]["x"],
            font["glyphs"]["77"]["xadvance"] + font["glyphs"]["32"]["xadvance"],
        )
        with prepared(scene) as project:
            entries = descriptor(project / "resources/designer-fonts/font-0.fnt")
            self.assertNotIn(32, entries)
        with prepared(audit.base("epix2pro47mm")) as project:
            resources = list(
                ET.parse(project / "resources/designer-fonts.xml")
                .getroot()
                .iter("font")
            )
            self.assertEqual(resources, [])
            self.assertEqual(
                list((project / "resources/designer-fonts").glob("*.fnt")), []
            )

    def test_text_colours_match_preview_palette_without_prequantising_ring_shades(self):
        scene = audit.scenes("epix2pro47mm")["simple"]
        scene["elements"][0].update(colour=0x123456, nightColour=0xABCDEF)
        scene = typography.add_time(scene)
        scene = typography.set_clock_source(scene, "time-2", "secondsRing")
        scene["elements"][1].update(colour=0x112233, nightColour=0x789ABC)
        before = copy.deepcopy(scene)
        for element in scene["elements"]:
            for field in ("colour", "nightColour"):
                self.assertNotEqual(device_colour(element[field]), element[field])
        with prepared(scene) as project:
            source = (project / "source/DesignerView.mc").read_text()
            encoded = re.search(
                r"private var _elements as Array<Array> = (.*);", source
            )
            self.assertIsNotNone(encoded)
            rows = {row[0]: row for row in json.loads(encoded.group(1))}
            self.assertEqual(
                rows["time"][6:8], [device_colour(0x123456), device_colour(0xABCDEF)]
            )
            self.assertEqual(rows["secondsRing"][6:8], [0x112233, 0x789ABC])
        self.assertEqual(scene, before)

    def test_native_resource_writer_changes_invalidate_export_identity(self):
        scene = audit.scenes("epix2pro47mm")["simple"]
        original = exporter.scene_application_id(scene)
        original_mapping = bridge.mapping(scene)
        read_bytes = Path.read_bytes

        def changed(path):
            value = read_bytes(path)
            return value + b"\n" if path.name == "designer_fonts.py" else value

        from unittest.mock import patch

        with patch.object(Path, "read_bytes", changed):
            self.assertNotEqual(exporter.scene_application_id(scene), original)
            self.assertNotEqual(bridge.mapping(scene), original_mapping)


if __name__ == "__main__":
    unittest.main()
