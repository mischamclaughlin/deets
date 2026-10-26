"""Canonical native-pixel scene, bitmap glyphs and layout for the web designer.

The browser and exported Monkey C consume the same cropped binary atlas pixels,
advances and element rectangles. No browser fonts or fractional layout are used.
"""

import copy
import functools
import re
import struct
import subprocess
import zlib
from pathlib import Path

from designer_charts import SAMPLES as CHART_SAMPLES

ROOT = Path(__file__).resolve().parent.parent
DEVICES = {"epix2pro42mm": 390, "epix2pro47mm": 416, "epix2pro51mm": 454}
FONT_FILES = {
    "widget": "jetbrains_mono_widget",
    "date": "jetbrains_mono_date",
    "time": "jetbrains_mono_time",
    "numeric": "jetbrains_mono_numeric_time",
    "tall": "jetbrains_mono_minutes",
}
FONT_LABELS = {
    "widget": "Widget · NL Thin", "date": "Numeric date · NL Thin",
    "time": "Time · Regular", "numeric": "Large numeric · Regular",
    "tall": "Tall digits · Regular",
}


def _source(identity, label, group, sample, kind="text", complication=None):
    result = {"id": identity, "label": label, "group": group, "sample": sample, "kind": kind}
    if complication is not None:
        result["type"] = complication
    result["allowedFonts"] = (
        ["widget", "time"] if identity == "time" else
        ["widget", "time", "numeric", "tall"] if identity in {"hours", "minutes", "seconds"} else
        ["widget", "date"] if identity == "numericDate" else ["widget"]
    )
    return result


CATALOG = [
    _source("time", "Time", "Clock & date", "10:08"),
    _source("hours", "Hours", "Clock & date", "10"),
    _source("minutes", "Minutes", "Clock & date", "08"),
    _source("seconds", "Seconds", "Clock & date", "23"),
    _source("date", "Date", "Clock & date", "MON 26 OCT 2026"),
    _source("numericDate", "Numeric date", "Clock & date", "26/10/26"),
    _source("weekday", "Weekday", "Clock & date", "MON"),
    _source("day", "Day of month", "Clock & date", "26"),
    _source("month", "Month", "Clock & date", "OCT"),
    _source("year", "Year", "Clock & date", "2026"),
    _source("heartRate", "Heart rate", "Health & activity", "64", complication=18),
    _source("steps", "Daily steps", "Health & activity", "8642", complication=2),
    _source("floors", "Floors climbed", "Health & activity", "12", complication=4),
    _source("weeklyRun", "Weekly running distance", "Health & activity", "24.8", complication=19),
    _source("temperature", "Temperature", "Weather & sun", "17", complication=38),
    _source("highLow", "High / low temperature", "Weather & sun", "20/10", complication=39),
    _source("temperatureHigh", "High temperature", "Weather & sun", "20", complication=39),
    _source("temperatureLow", "Low temperature", "Weather & sun", "10", complication=39),
    _source("sunriseSunset", "Next sunrise / sunset", "Weather & sun", "07:24", complication=13),
    _source("battery", "Battery percentage", "Device", "78%"),
    _source("alarms", "Alarms", "Device", "2 ALARMS"),
    _source("label", "Text label", "Design", "EPIX CANVAS"),
    _source("stepsWeek", "Weekly steps", "Charts", [4200, 8642, 6300, 9500, 7100, 11100, 5200], "bars", 2),
    _source("floorsWeek", "Weekly floors", "Charts", [4, 12, 7, 15, 10, 18, 6], "bars", 4),
    _source("runWeek", "Weekly running", "Charts", [0, 5.2, 0, 8.1, 3.5, 8.0, 0], "bars", 19),
    _source("heartZones", "Heart-rate zones", "Charts", 2, "zones", 18),
    _source("temperatureZones", "Temperature zones", "Charts", 2, "zones", 38),
    _source("solarTimeline", "Solar timeline", "Charts", [0.30, 0.73, 0.5], "solar", 13),
    _source("secondsRing", "Seconds ring", "Charts", 23, "ring"),
]
for _entry in CATALOG:
    if _entry["id"] in CHART_SAMPLES:
        _entry["sample"] = copy.deepcopy(CHART_SAMPLES[_entry["id"]])
SOURCES = {source["id"]: source for source in CATALOG}


def _png_rgba(width, height, pixels):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    scanlines = b"".join(b"\0" + pixels[y * width * 4:(y + 1) * width * 4] for y in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(scanlines, 9)) + chunk(b"IEND", b""))


def _font_paths(device):
    directory = ROOT / f"resources-{device}" / "fonts"
    return [(directory / f"{stem}.fnt", directory / f"{stem}_0.png") for stem in FONT_FILES.values()]


def font_pack(device):
    if device not in DEVICES:
        raise ValueError("Choose a supported epix Pro device.")
    paths = _font_paths(device)
    signature = tuple((path.stat().st_mtime_ns, path.stat().st_size) for pair in paths for path in pair)
    return _font_pack_cached(device, signature)


@functools.lru_cache(maxsize=6)
def _font_pack_cached(device, signature):
    del signature  # Resource timestamps form the cache key; files remain the source.
    fonts, images = {}, {}
    for (key, _), (descriptor, atlas) in zip(FONT_FILES.items(), _font_paths(device)):
        source = descriptor.read_text()
        common = next(line for line in source.splitlines() if line.startswith("common "))
        common_fields = {name: int(value) for name, value in re.findall(r"(\w+)=(-?\d+)", common)}
        atlas_width, atlas_height = common_fields["scaleW"], common_fields["scaleH"]
        # Existing font atlases are greyscale coverage masks. Both renderers get
        # precisely the same binary raster, avoiding browser antialiasing drift.
        raw = subprocess.check_output(["magick", str(atlas), "-colorspace", "gray", "-depth", "8", "gray:-"])
        if len(raw) != atlas_width * atlas_height:
            raise ValueError("A designer font atlas has unexpected dimensions.")
        alpha = bytes(255 if value >= 128 else 0 for value in raw)
        pixels = bytearray(len(alpha) * 4)
        for index, coverage in enumerate(alpha):
            pixels[index * 4:index * 4 + 4] = bytes((255, 255, 255, coverage))
        images[key] = _png_rgba(atlas_width, atlas_height, pixels)
        glyphs, tops, bottoms = {}, [], []
        for line in source.splitlines():
            if not line.startswith("char "):
                continue
            fields = {name: int(value) for name, value in re.findall(r"(\w+)=(-?\d+)", line)}
            points = []
            for y in range(fields["height"]):
                for x in range(fields["width"]):
                    if alpha[(fields["y"] + y) * atlas_width + fields["x"] + x]:
                        points.append((x, y))
            if not points:
                glyphs[str(fields["id"])] = {"x": fields["x"], "y": fields["y"], "width": 0, "height": 0,
                    "xoffset": 0, "yoffset": 0, "xadvance": fields["xadvance"]}
                continue
            left = min(point[0] for point in points)
            right = max(point[0] for point in points) + 1
            top = min(point[1] for point in points)
            bottom = max(point[1] for point in points) + 1
            logical_top = fields["yoffset"] + top
            logical_bottom = fields["yoffset"] + bottom
            tops.append(logical_top)
            bottoms.append(logical_bottom)
            glyphs[str(fields["id"])] = {
                "x": fields["x"] + left, "y": fields["y"] + top,
                "width": right - left, "height": bottom - top,
                "xoffset": 0, "yoffset": logical_top, "xadvance": right - left + 1,
            }
        if not tops:
            raise ValueError("A designer font atlas has no visible glyphs.")
        top = min(tops)
        for glyph in glyphs.values():
            if glyph["height"]:
                glyph["yoffset"] -= top
        fonts[key] = {"height": max(bottoms) - top, "atlasWidth": atlas_width,
            "atlasHeight": atlas_height, "glyphs": glyphs, "label": FONT_LABELS[key]}
    return {"fonts": fonts, "images": images}


def catalogue(device):
    pack = font_pack(device)
    fonts = copy.deepcopy(pack["fonts"])
    for key, font in fonts.items():
        font["url"] = f"/api/designer-asset?device={device}&font={key}"
        font["assetUrl"] = font["url"]
    return {"version": 2, "device": device, "size": DEVICES[device],
            "sources": copy.deepcopy(CATALOG), "fonts": fonts,
            "samples": {source["id"]: copy.deepcopy(source["sample"]) for source in CATALOG}}


def _integer(value, label, minimum, maximum):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{label} must be an integer from {minimum} to {maximum}.")
    return value


def validate_scene(payload):
    if not isinstance(payload, dict) or set(payload) != {"version", "name", "device", "background", "elements"}:
        raise ValueError("Expected a version-2 watch-face scene.")
    if type(payload["version"]) is not int or payload["version"] != 2:
        raise ValueError("This scene version is unsupported.")
    name = payload["name"]
    if not isinstance(name, str) or not name.strip() or len(name) > 60:
        raise ValueError("Give the design a name from 1 to 60 characters.")
    device = payload["device"]
    if not isinstance(device, str) or device not in DEVICES:
        raise ValueError("Choose a supported epix Pro device.")
    size = DEVICES[device]
    background = _integer(payload["background"], "Background colour", 0, 0xFFFFFF)
    if not isinstance(payload["elements"], list) or len(payload["elements"]) > 40:
        raise ValueError("A design can contain at most 40 elements.")
    pack = font_pack(device)
    elements, identifiers = [], set()
    required = {"id", "source", "font", "x", "y", "width", "align", "colour", "nightColour", "visible"}
    for original in payload["elements"]:
        if not isinstance(original, dict) or not required <= set(original) or set(original) - required - {"height", "text"}:
            raise ValueError("An element has unsupported or missing fields.")
        identity = original["id"]
        if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", identity) or identity in identifiers:
            raise ValueError("Each element needs a unique identifier.")
        identifiers.add(identity)
        source = original["source"]
        if not isinstance(source, str) or source not in SOURCES:
            raise ValueError("Choose a supported data source.")
        info = SOURCES[source]
        font = original["font"]
        if font not in info["allowedFonts"]:
            raise ValueError("That font does not contain every character needed by this data source.")
        x = _integer(original["x"], "Element X", 0, size - 1)
        y = _integer(original["y"], "Element Y", 0, size - 1)
        width = _integer(original["width"], "Element width", 1, size - x)
        if info["kind"] == "bars" and width < 25:
            raise ValueError("Weekly bars need at least 25 native pixels of width.")
        if info["kind"] == "zones" and width < 17:
            raise ValueError("Zone bands need at least 17 native pixels of width.")
        default_height = (pack["fonts"][font]["height"] if info["kind"] == "text" else
                          18 if info["kind"] == "bars" else width if info["kind"] == "ring" else 14)
        height = _integer(original.get("height", default_height), "Element height", 1, size - y)
        if info["kind"] == "text" and height != pack["fonts"][font]["height"]:
            raise ValueError("Text height must match its native bitmap font.")
        if info["kind"] == "ring" and (width != height or width < 4):
            raise ValueError("A seconds ring must be square and at least four pixels wide.")
        if info["kind"] == "solar" and height < 3:
            raise ValueError("A solar timeline needs at least three pixels of height.")
        if not isinstance(original["align"], str) or original["align"] not in {"left", "centre", "right"}:
            raise ValueError("Choose left, centre or right alignment.")
        if not isinstance(original["visible"], str) or original["visible"] not in {"both", "day", "night"}:
            raise ValueError("Choose day, night or both for element visibility.")
        colour = _integer(original["colour"], "Element colour", 0, 0xFFFFFF)
        night_colour = _integer(original["nightColour"], "Night colour", 0, 0xFFFFFF)
        result = {"id": identity, "source": source, "font": font, "x": x, "y": y,
                  "width": width, "height": height, "align": original["align"], "colour": colour,
                  "nightColour": night_colour, "visible": original["visible"]}
        if "text" in original or source == "label":
            text = original.get("text", "EPIX CANVAS")
            if not isinstance(text, str) or len(text) > 80 or any(str(ord(char)) not in pack["fonts"][font]["glyphs"] for char in text):
                raise ValueError("Labels support up to 80 characters from the selected bitmap font.")
            result["text"] = text
        elements.append(result)
    return {"version": 2, "name": name.strip(), "device": device,
            "background": background, "elements": elements}


def layout_text(text, element, font):
    """Lay out and clip a text run to its integer native-pixel element box."""
    glyphs = []
    for character in str(text):
        glyph = font["glyphs"].get(str(ord(character)), font["glyphs"].get("63"))
        if glyph is not None:
            glyphs.append(glyph)
    total = max(0, sum(glyph["xadvance"] for glyph in glyphs) - (1 if glyphs else 0))
    alignment = element.get("align", "left")
    offset = ((element["width"] - total) // 2 if alignment == "centre" else
              element["width"] - total if alignment == "right" else 0)
    cursor = element["x"] + offset
    top = element["y"]
    clip_right = element["x"] + element["width"]
    clip_bottom = top + element.get("height", font["height"])
    operations = []
    for glyph in glyphs:
        x, y = cursor + glyph["xoffset"], top + glyph["yoffset"]
        left, upper = max(x, element["x"]), max(y, top)
        right, bottom = min(x + glyph["width"], clip_right), min(y + glyph["height"], clip_bottom)
        if right > left and bottom > upper:
            operations.append({"x": left, "y": upper,
                "sx": glyph["x"] + left - x, "sy": glyph["y"] + upper - y,
                "width": right - left, "height": bottom - upper})
        cursor += glyph["xadvance"]
    return operations


def render_text_ops(scene, values=None, night=False):
    if values is None:
        values = {source["id"]: source["sample"] for source in CATALOG}
    pack = font_pack(scene["device"])
    operations = []
    for element in scene["elements"]:
        if SOURCES[element["source"]]["kind"] != "text":
            continue
        if element["visible"] == ("day" if night else "night"):
            continue
        text = element.get("text", "") if element["source"] == "label" else values.get(element["source"], "--")
        if text is None:
            text = "--"
        for operation in layout_text(str(text), element, pack["fonts"][element["font"]]):
            operations.append({**operation, "kind": "bitmap", "font": element["font"], "asset": element["font"],
                "colour": element["nightColour"] if night else element["colour"], "elementId": element["id"]})
    return operations
