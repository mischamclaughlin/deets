"""Activity elements and canonical icon coverage shared by canvas and export."""
import copy
import functools
from pathlib import Path
import struct
import subprocess

# Original colour-ready Tabler assets from the parent Garmin watch face.
# Walking deliberately uses the parent's footsteps symbol; it has no walk icon.
ICON_MASKS = {"stepsIcon": "footsteps", "walkIcon": "footsteps", "runIcon": "run"}
ICON_DIRECTORY = Path(__file__).resolve().parent.parent / "resources/drawables/icons"
ACTIVITY_SOURCES = {"steps", "weeklyWalk", "weeklyRun", "stepsWeek", "walkWeek", "runWeek", *ICON_MASKS}


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


def add_activity(scene, source):
    from designer_model import validate_scene, DEVICES, font_pack
    scene = validate_scene(scene)
    if source not in ACTIVITY_SOURCES:
        raise ValueError("Choose a supported activity element.")
    if len(scene["elements"]) >= 40:
        raise ValueError("A design can contain at most 40 elements.")
    size = DEVICES[scene["device"]]
    width, height = ((112, 24) if source.endswith("Week") else
                     (112, font_pack(scene["device"])["fonts"]["widget"]["height"]))
    if source in ICON_MASKS:
        data = (ICON_DIRECTORY / f"{ICON_MASKS[source]}.png").read_bytes()
        width, height, _ = _icon_mask(data)
    identities = {element["id"] for element in scene["elements"]}
    identity, suffix = source, 2
    while identity in identities:
        identity = f"{source}-{suffix}"
        suffix += 1
    edited = copy.deepcopy(scene)
    edited["elements"].append(dict(id=identity, source=source, font="widget", x=(size-width)//2,
        y=(size-height)//2, width=width, height=height, align="centre", colour=0xdceccf,
        nightColour=0x8d99ae, visible="both"))
    return validate_scene(edited)
