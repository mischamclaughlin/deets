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


def _arrange_activity_group(scene, elements):
    """Centre native boxes as one layout: icon beside value, graph underneath."""
    from designer_model import DEVICES
    value = elements[0]
    icon = next((element for element in elements[1:] if element["source"] in ICON_MASKS), None)
    graph = next((element for element in elements[1:] if element["source"].endswith("Week")), None)
    gap = 8
    row_width = value["width"] + (icon["width"] + gap if icon else 0)
    row_height = max(value["height"], icon["height"] if icon else 0)
    group_width = max(row_width, graph["width"] if graph else 0)
    group_height = row_height + (gap + graph["height"] if graph else 0)
    size = DEVICES[scene["device"]]
    left, top = (size-group_width)//2, (size-group_height)//2
    row_left = left + (group_width-row_width)//2
    if icon:
        icon.update(x=row_left, y=top+(row_height-icon["height"])//2)
    value.update(x=row_left+(icon["width"]+gap if icon else 0), y=top+(row_height-value["height"])//2)
    if graph:
        graph.update(x=left+(group_width-graph["width"])//2, y=top+row_height+gap)


def add_activity(scene, source, options=_NO_OPTIONS):
    """Add a value and its optional companions atomically, retaining legacy adds."""
    from designer_model import validate_scene
    scene = validate_scene(scene)
    if source not in ACTIVITY_SOURCES:
        raise ValueError("Choose a supported activity element.")
    sources = [source]
    if options is not _NO_OPTIONS:
        if source not in ACTIVITY_GROUPS:
            raise ValueError("Icon and graph options belong to an activity data value.")
        if (not isinstance(options, dict) or set(options) - {"icon", "graph"}
                or any(type(value) is not bool for value in options.values())):
            raise ValueError("Choose boolean icon and graph options for the activity value.")
        icon, graph = ACTIVITY_GROUPS[source]
        if options.get("icon", False):
            sources.append(icon)
        if options.get("graph", False):
            sources.append(graph)
    if len(scene["elements"]) + len(sources) > 40:
        raise ValueError(f"This addition needs {len(sources)} element slots; a design can contain at most 40 elements.")
    edited = copy.deepcopy(scene)
    identities = {element["id"] for element in scene["elements"]}
    additions = [_new_activity_element(scene, item, identities) for item in sources]
    if options is not _NO_OPTIONS:
        _arrange_activity_group(scene, additions)
    edited["elements"].extend(additions)
    return validate_scene(edited)
