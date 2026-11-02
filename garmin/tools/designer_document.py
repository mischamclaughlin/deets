"""Compiler-owned editable metadata, kept outside the watch renderer."""
import base64
import json
import re
import xml.etree.ElementTree as ET
import zlib

MAX_DOCUMENT_BYTES = 1024 * 1024
START = "DEETS_EDITABLE_V1:"
END = ":END_DEETS_EDITABLE_V1"
_NO_LAYOUT = object()


def validate_layout(layout, scene):
    """Bound browser-only locks and groups without admitting them into native geometry."""
    invalid = "Choose valid editable layer locks and groups."
    if not isinstance(layout, dict) or set(layout) != {"lockedIds", "groups"}:
        raise ValueError(invalid)
    ids = {element["id"] for element in scene["elements"]}

    def valid_members(members):
        return (isinstance(members, list) and len(members) <= 40 and
                all(isinstance(member, str) and member in ids for member in members) and
                len(set(members)) == len(members))

    if not valid_members(layout["lockedIds"]) or not isinstance(layout["groups"], list) or len(layout["groups"]) > 20:
        raise ValueError(invalid)
    group_ids, used = set(), set()
    for group in layout["groups"]:
        if (not isinstance(group, dict) or set(group) != {"id", "name", "elementIds"} or
                not isinstance(group["id"], str) or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{0,63}", group["id"]) or
                group["id"] in group_ids or not isinstance(group["name"], str) or not group["name"].strip() or
                len(group["name"].encode("utf-16-le")) // 2 > 60 or not valid_members(group["elementIds"]) or
                len(group["elementIds"]) < 2 or any(member in used for member in group["elementIds"])):
            raise ValueError(invalid)
        group_ids.add(group["id"])
        used.update(group["elementIds"])
    return layout


def write_editable_document(project, scene, grid=None, layout=_NO_LAYOUT):
    document = {"format": "deets", "version": 1, "scene": scene}
    if grid is not None:
        if not isinstance(grid, dict):
            raise ValueError("Choose valid editable grid settings.")
        document["grid"] = grid
    if layout is not _NO_LAYOUT:
        document["layout"] = validate_layout(layout, scene)
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(encoded) > MAX_DOCUMENT_BYTES:
        raise ValueError("The editable design must be no larger than 1 MB.")
    value = START + base64.b64encode(zlib.compress(encoded, level=9)).decode("ascii") + END
    resources = ET.Element("strings")
    # Settings-only resources are stripped from PRGs. Keep a normal resource,
    # never referenced or loaded by the watch's application or drawing code.
    ET.SubElement(resources, "string", {"id": "DeetsEditableDesign"}).text = value
    ET.ElementTree(resources).write(project / "resources/deets_editable.xml", encoding="utf-8", xml_declaration=True)
