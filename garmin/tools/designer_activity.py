"""Activity elements and canonical icon coverage shared by canvas and export."""
import copy
import functools
import re
from pathlib import Path
import struct
import subprocess

from designer_metrics import METRICS, METRICS_BY_SOURCE

# Original colour-ready Tabler assets from the parent Garmin watch face.
# Walking deliberately uses the parent's footsteps symbol; it has no walk icon.
ICON_MASKS = {"stepsIcon": "footsteps", "walkIcon": "footsteps", "runIcon": "run", "floorsIcon": "stairs", "heartIcon": "heart",
              "temperatureIcon": "temperature", "highLowIcon": "temperature-sun", "sunriseSunsetIcon": "sunrise",
              "bodyBatteryIcon": "body-battery", "stressIcon": "stress", "recoveryTimeIcon": "recovery-time",
              "rainChanceIcon": "cloud-rain", "windIcon": "wind"}
ICON_VARIANTS = {
    "temperatureIcon": ("temperature", "sun", "cloud", "cloud-rain", "cloud-storm", "snowflake", "wind", "mist"),
    "sunriseSunsetIcon": ("sunrise", "sunset"),
}
ICON_DIRECTORY = Path(__file__).resolve().parent.parent / "resources/drawables/icons"
ACTIVITY_GROUPS = {
    "bodyBattery": ("bodyBatteryIcon", None),
    "stress": ("stressIcon", None),
    "recoveryTime": ("recoveryTimeIcon", None),
    "rainChance": ("rainChanceIcon", None),
    "wind": ("windIcon", None),
    "heartRate": ("heartIcon", "heartZones"),
    "temperature": ("temperatureIcon", "temperatureZones"),
    "highLow": ("highLowIcon", "temperatureZones"),
    "temperatureHigh": ("highLowIcon", None),
    "temperatureLow": ("highLowIcon", None),
    "sunriseSunset": ("sunriseSunsetIcon", "solarTimeline"),
    "steps": ("stepsIcon", "stepsWeek"),
    "floors": ("floorsIcon", "floorsWeek"),
    "weeklyWalk": ("walkIcon", "walkWeek"),
    "weeklyRun": ("runIcon", "runWeek"),
}
ICON_MASKS.update({entry['source'] + 'Icon': entry['icon'] for entry in METRICS})
ACTIVITY_GROUPS.update({entry['source']: (entry['source'] + 'Icon', None) for entry in METRICS})
_NO_OPTIONS = object()
GRAPH_SOURCES = {graph for _, graph in ACTIVITY_GROUPS.values() if graph is not None}
ACTIVITY_SOURCES = {*ACTIVITY_GROUPS, *GRAPH_SOURCES, *ICON_MASKS}


def validate_custom_icon(value):
    """Accept portable, bounded, row-major one-bit coverage; never file paths."""
    invalid = "Choose a non-empty imported icon up to 64 by 64 pixels."
    if not isinstance(value, dict) or set(value) != {"name", "width", "height", "bits"}:
        raise ValueError(invalid)
    name, width, height, bits = (value[key] for key in ("name", "width", "height", "bits"))
    if (not isinstance(name, str) or not name.strip() or len(name) > 60 or
            any(ord(character) < 32 or ord(character) == 127 for character in name) or
            type(width) is not int or type(height) is not int or
            not 1 <= width <= 64 or not 1 <= height <= 64):
        raise ValueError(invalid)
    count = width * height
    if (not isinstance(bits, str) or len(bits) != ((count + 7) // 8) * 2 or
            not re.fullmatch(r"[0-9a-f]+", bits)):
        raise ValueError(invalid)
    packed = bytes.fromhex(bits)
    padding = -count % 8
    if not any(packed) or (padding and packed[-1] & ((1 << padding) - 1)):
        raise ValueError(invalid)
    return dict(name=name.strip(), width=width, height=height, bits=bits)


def custom_icon_mask(value):
    icon = validate_custom_icon(value)
    packed = bytes.fromhex(icon["bits"])
    pixels = bytes((packed[index // 8] >> (7 - index % 8)) & 1
                   for index in range(icon["width"] * icon["height"]))
    return icon["width"], icon["height"], pixels


def icon_asset_paths():
    """Return rendering inputs for mapping and exported application fingerprints."""
    names = set(ICON_MASKS.values()) | {name for variants in ICON_VARIANTS.values() for name in variants}
    return tuple(ICON_DIRECTORY / f"{name}.png" for name in sorted(names))


@functools.lru_cache(maxsize=32)
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
    return _mask_rectangles(*_icon_mask(data), width, height)


@functools.lru_cache(maxsize=64)
def _mask_rectangles(source_width, source_height, pixels, width, height):
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


def icon_ops(element, variant=None):
    source = element["source"]
    if source == "customIcon":
        if variant is not None:
            raise ValueError("Imported icons do not have live variants.")
        rectangles = _mask_rectangles(*custom_icon_mask(element.get("icon")), element["width"], element["height"])
        return [dict(kind="rect", x=element["x"]+x, y=element["y"]+y, width=width, height=height)
                for x, y, width, height in rectangles]
    name = ICON_MASKS[source] if variant is None else variant
    if name not in ICON_VARIANTS.get(source, (ICON_MASKS[source],)):
        raise ValueError("Choose a supported variant for this icon.")
    data = (ICON_DIRECTORY / f"{name}.png").read_bytes()
    return [dict(kind="rect", x=element["x"]+x, y=element["y"]+y, width=width, height=height)
            for x, y, width, height in _icon_rectangles(data, element["width"], element["height"])]


def _new_activity_element(scene, source, identities):
    from designer_model import DEVICES, font_pack
    size = DEVICES[scene["device"]]
    width, height = ((112, 24) if source in GRAPH_SOURCES else
                     (112, font_pack(scene["device"])["fonts"]["widget"]["height"]))
    if source in {"wind", "recoveryTime"}:
        from designer_model import text_ink_bounds
        font = font_pack(scene["device"])["fonts"]["widget"]
        reference = "720 KM/H WSW" if source == "wind" else "96H 59M"
        width = max(width, text_ink_bounds(reference, {"source": source}, font)[2])
    if source in METRICS_BY_SOURCE:
        from designer_model import text_ink_bounds
        font = font_pack(scene["device"])["fonts"]["widget"]
        entry = METRICS_BY_SOURCE[source]
        for sample in (entry["sample"], entry["largeSample"]):
            width = max(width, text_ink_bounds(sample, {"source": source}, font)[2])
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
    graph_source = ACTIVITY_GROUPS[value["source"]][1]
    graph = next((item for item in elements[1:] if item["source"] == graph_source), None)
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
        if options.get("graph", False) and graph is None:
            raise ValueError("This activity does not have a weekly graph.")
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
    if graph_source is None:
        if enabled:
            raise ValueError("This activity does not have a weekly graph.")
        return scene
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
