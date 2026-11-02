"""Compiler-owned editable metadata, kept outside the watch renderer."""
import base64
import json
import xml.etree.ElementTree as ET
import zlib

MAX_DOCUMENT_BYTES = 1024 * 1024
START = "DEETS_EDITABLE_V1:"
END = ":END_DEETS_EDITABLE_V1"


def write_editable_document(project, scene, grid=None):
    document = {"format": "deets", "version": 1, "scene": scene}
    if grid is not None:
        if not isinstance(grid, dict):
            raise ValueError("Choose valid editable grid settings.")
        document["grid"] = grid
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(encoded) > MAX_DOCUMENT_BYTES:
        raise ValueError("The editable design must be no larger than 1 MB.")
    value = START + base64.b64encode(zlib.compress(encoded, level=9)).decode("ascii") + END
    resources = ET.Element("strings")
    # Settings-only resources are stripped from PRGs. Keep a normal resource,
    # never referenced or loaded by the watch's application or drawing code.
    ET.SubElement(resources, "string", {"id": "DeetsEditableDesign"}).text = value
    ET.ElementTree(resources).write(project / "resources/deets_editable.xml", encoding="utf-8", xml_declaration=True)
