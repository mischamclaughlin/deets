"""Activity elements and canonical icon coverage shared by canvas and export."""
import copy
import functools
from pathlib import Path
import struct
import subprocess

# Original colour-ready Tabler assets from the parent Garmin watch face.
# Walking deliberately uses the parent's footsteps symbol; it has no walk icon.
ICON_MASKS = {"stepsIcon": "footsteps", "walkIcon": "footsteps", "runIcon": "run", "floorsIcon": "stairs"}
ICON_DIRECTORY = Path(__file__).resolve().parent.parent / "resources/drawables/icons"
ACTIVITY_GROUPS = {
    "steps": ("stepsIcon", "stepsWeek"),
    "floors": ("floorsIcon", "floorsWeek"),
    "weeklyWalk": ("walkIcon", "walkWeek"),
    "weeklyRun": ("runIcon", "runWeek"),
}
_NO_OPTIONS = object()
ACTIVITY_SOURCES = {"floors", "floorsWeek", "steps", "weeklyWalk", "weeklyRun", "stepsWeek", "walkWeek", "runWeek", *ICON_MASKS}


def icon_asset_paths():
    """Return rendering inputs for mapping and exported application fingerprints."""
    return tuple(ICON_DIRECTORY / f"{name}.png" for name in sorted(set(ICON_MASKS.values())))


@functools.lru_cache(maxsize=8)
def _icon_mask(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("An activity icon is not a PNG resource.")
    width, height = struct.unpack(">II", data[16:24])
    if not 1 <= width <= 128 or not 1 <= height <= 128:
        raise ValueError("An activity icon has unsupported native dimensions.")
    alpha = subprocess.check_output(["magick", "png:-", "-alpha", "extract", "-depth", "8", "gray:-"], input=data)
    if len(alpha) != width * height:
        raise ValueError("An activity icon has unexpected coverage dimensions.")
    return width, height, bytes(1 if value >= 128 else 0 for value in alpha)


@functools.lru_cache(maxsize=32)
def _icon_rectangles(data, width, height):
    source_width, source_height, pixels = _icon_mask(data)
    if width * source_height <= height * source_width:
        draw_width, draw_height = width, max(1, width * source_height // source_width)
    else:
        draw_width, draw_height = max(1, height * source_width // source_height), height
    offset_x, offset_y = (width - draw_width) // 2, (height - draw_height) // 2
    active, rectangles = {}, []
    for y in range(draw_height + 1):
        spans = []
        if y < draw_height:
            source_y = (2*y + 1) * source_height // (2*draw_height)
            left = None
            for x in range(draw_width + 1):
                source_x = (2*x + 1) * source_width // (2*draw_width)
                covered = x < draw_width and pixels[source_y * source_width + source_x]
                if covered and left is None:
                    left = x
                elif not covered and left is not None:
                    spans.append((left, x-left))
                    left = None
        for span in tuple(active):
            if span not in spans:
                top, span_height = active.pop(span)
                rectangles.append((offset_x + span[0], offset_y + top, span[1], span_height))
        for span in spans:
            if span in active:
                active[span][1] += 1
            else:
                active[span] = [y, 1]
    return tuple(rectangles)


def icon_ops(element):
    data = (ICON_DIRECTORY / f"{ICON_MASKS[element['source']]}.png").read_bytes()
    return [dict(kind="rect", x=element["x"]+x, y=element["y"]+y, width=width, height=height)
            for x, y, width, height in _icon_rectangles(data, element["width"], element["height"])]


def _new_activity_element(scene, source, identities):
    from designer_model import DEVICES, font_pack
    size = DEVICES[scene["device"]]
    width, height = ((112, 24) if source.endswith("Week") else
                     (112, font_pack(scene["device"])["fonts"]["widget"]["height"]))
    if source in ICON_MASKS:
        data = (ICON_DIRECTORY / f"{ICON_MASKS[source]}.png").read_bytes()
        width, height, _ = _icon_mask(data)
    identity, suffix = source, 2
    while identity in identities:
        identity = f"{source}-{suffix}"
        suffix += 1
    identities.add(identity)
    return dict(id=identity, source=source, font="widget", x=(size-width)//2,
        y=(size-height)//2, width=width, height=height, align="centre", colour=0xdceccf,
        nightColour=0x8d99ae, visible="both")


def _position_companions(value, companions):
    """Centre each companion on the data with an exact sixteen-pixel box gap."""
    for element in companions:
        element["x"] = value["x"] + (value["width"] - element["width"]) // 2
        element["y"] = (value["y"] - element["height"] - 16 if element["source"] in ICON_MASKS
                        else value["y"] + value["height"] + 16)


def _arrange_activity_group(scene, elements):
    """Centre the complete icon/data/graph stack in native pixels."""
    from designer_model import DEVICES
    value = elements[0]
    icon = next((item for item in elements[1:] if item["source"] in ICON_MASKS), None)
    graph = next((item for item in elements[1:] if item["source"].endswith("Week")), None)
    height = value["height"] + (icon["height"] + 16 if icon else 0) + (graph["height"] + 16 if graph else 0)
    value["y"] = (DEVICES[scene["device"]] - height) // 2 + (icon["height"] + 16 if icon else 0)
    _position_companions(value, elements[1:])


def activity_parent(scene, element_id):
    """Resolve a selected value or linked companion without guessing by position."""
    selected = next((item for item in scene["elements"] if item["id"] == element_id), None)
    if selected is None:
        raise ValueError("Choose an existing activity element.")
    if selected["source"] in ACTIVITY_GROUPS:
        return selected
    parent_id = selected.get("activityId")
    parent = next((item for item in scene["elements"] if item["id"] == parent_id), None)
    if parent is None or parent["source"] not in ACTIVITY_GROUPS:
        raise ValueError("Choose activity data or one of its linked elements.")
    return parent


def add_activity(scene, source, options=_NO_OPTIONS):
    """Add data and its chosen companions atomically, preserving independent parts."""
    from designer_model import validate_scene
    scene = validate_scene(scene)
    if source not in ACTIVITY_SOURCES:
        raise ValueError("Choose a supported activity element.")
    if source not in ACTIVITY_GROUPS:
        if options is not _NO_OPTIONS:
            raise ValueError("Icon and graph options belong to an activity data value.")
        sources = [source]
        include_value = False
    else:
        if options is _NO_OPTIONS:
            options = {}
        if (not isinstance(options, dict) or set(options) - {"value", "icon", "graph"}
                or any(type(value) is not bool for value in options.values())):
            raise ValueError("Choose boolean value, icon and graph options for the activity.")
        include_value = options.get("value", True)
        icon, graph = ACTIVITY_GROUPS[source]
        sources = ([source] if include_value else []) + ([icon] if options.get("icon", True) else []) + ([graph] if options.get("graph", False) else [])
        if not sources:
            raise ValueError("Choose at least one activity element to add.")
    if len(scene["elements"]) + len(sources) > 40:
        raise ValueError(f"This addition needs {len(sources)} element slots; a design can contain at most 40 elements.")
    edited = copy.deepcopy(scene)
    identities = {element["id"] for element in scene["elements"]}
    additions = [_new_activity_element(scene, item, identities) for item in sources]
    if include_value:
        parent = additions[0]
        parent["moveTogether"] = True
        for companion in additions[1:]:
            companion["activityId"] = parent["id"]
        _arrange_activity_group(scene, additions)
    elif source in ACTIVITY_GROUPS:
        # Attach each missing role to the newest compatible data value. If every
        # value already has that role, retain the explicitly requested loose icon.
        for companion in additions:
            parent = next((item for item in reversed(edited["elements"]) if item["source"] == source and
                not any(child.get("activityId") == item["id"] and child["source"] == companion["source"]
                        for child in edited["elements"] + additions if child is not companion)), None)
            if parent:
                companion["activityId"] = parent["id"]
                parent.setdefault("moveTogether", True)
                _position_companions(parent, [companion])
    edited["elements"].extend(additions)
    return validate_scene(edited)


def set_activity_graph(scene, element_id, enabled):
    """Toggle only this activity's graph; keep every existing box in place."""
    from designer_model import validate_scene
    if type(enabled) is not bool:
        raise ValueError("Choose whether the weekly graph is enabled.")
    scene = validate_scene(scene)
    parent = activity_parent(scene, element_id)
    graph_source = ACTIVITY_GROUPS[parent["source"]][1]
    existing = next((item for item in scene["elements"] if item.get("activityId") == parent["id"] and item["source"] == graph_source), None)
    if bool(existing) == enabled:
        return scene
    edited = copy.deepcopy(scene)
    if not enabled:
        edited["elements"] = [item for item in edited["elements"] if item["id"] != existing["id"]]
    else:
        if len(edited["elements"]) >= 40:
            raise ValueError("A design can contain at most 40 elements.")
        identities = {item["id"] for item in edited["elements"]}
        graph = _new_activity_element(edited, graph_source, identities)
        graph["activityId"] = parent["id"]
        _position_companions(parent, [graph])
        edited["elements"].append(graph)
    return validate_scene(edited)
