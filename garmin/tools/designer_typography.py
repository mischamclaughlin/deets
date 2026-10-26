"""Bounded, local native glyph generation for editable clock typography."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import struct

CACHE = Path(tempfile.gettempdir()) / "deets-fonts-v1"
CODES = "0123456789:-?"


def settings(value):
    if not isinstance(value, dict) or set(value) != {"family", "size", "thickness", "width", "letterSpacing"}:
        raise ValueError("Choose a font, size, thickness, width and letter spacing.")
    family = value["family"]
    if not isinstance(family, str) or (family not in {"time", "widget"} and not re.fullmatch(r"upload:[a-f0-9]{64}", family)):
        raise ValueError("Choose an included font or upload a TTF/OTF font.")
    for field, low, high in (("size", 12, 160), ("thickness", -2, 6), ("width", 50, 200), ("letterSpacing", -4, 24)):
        if type(value[field]) is not int or not low <= value[field] <= high:
            raise ValueError(f"Typography {field} must be an integer from {low} to {high}.")
    return dict(value)


def _magick(arguments, data=None):
    try:
        return subprocess.check_output(["magick", "-limit", "memory", "64MiB", "-limit", "map", "64MiB", "-limit", "disk", "64MiB", "-limit", "width", "4096", "-limit", "height", "2048", *arguments], input=data, stderr=subprocess.DEVNULL, timeout=8)
    except (OSError, subprocess.SubprocessError):
        raise ValueError("This font could not be rasterised. Choose a supported TTF or OTF font.") from None


def _raw(image):
    width, height = struct.unpack(">II", image[16:24])
    if not 0 < width <= 4096 or not 0 < height <= 2048:
        raise ValueError("The generated font dimensions exceed the local limit.")
    raw = _magick(["png:-", "-alpha", "extract", "-depth", "8", "gray:-"], image)
    if len(raw) != width * height:
        raise ValueError("The font raster has unexpected dimensions.")
    return width, height, raw


def _resize(rows, width, height):
    old_height, old_width = len(rows), len(rows[0])
    return [[rows[min(old_height - 1, y * old_height // height)][min(old_width - 1, x * old_width // width)]
             for x in range(width)] for y in range(height)]


def _morph(rows, amount):
    if not amount:
        return rows
    radius = abs(amount)
    operation = any if amount > 0 else all
    height, width = len(rows), len(rows[0])
    horizontal = [[operation(rows[y][xx] if 0 <= xx < width else False for xx in range(x-radius, x+radius+1))
                   for x in range(width)] for y in range(height)]
    return [[operation(horizontal[yy][x] if 0 <= yy < height else False for yy in range(y-radius, y+radius+1))
             for x in range(width)] for y in range(height)]


def generate(device, value):
    from designer_model import font_pack, _png_rgba
    value = settings(value)
    family = value["family"]
    cells = {}
    if family in {"time", "widget"}:
        pack = font_pack(device)
        font = pack["fonts"][family]
        width, _, raw = _raw(pack["images"][family])
        native_height = font["height"]
        for char in CODES:
            glyph = font["glyphs"].get(str(ord(char)))
            source_width, source_raw, source_height = width, raw, native_height
            if not glyph or not glyph["width"]:
                fallback = pack["fonts"]["widget"]
                glyph = fallback["glyphs"][str(ord(char))]
                source_width, _, source_raw = _raw(pack["images"]["widget"])
                source_height = fallback["height"]
            cell = [[False] * glyph["width"] for _ in range(source_height)]
            for y in range(glyph["height"]):
                for x in range(glyph["width"]):
                    cell[y + glyph["yoffset"]][x] = source_raw[(glyph["y"] + y) * source_width + glyph["x"] + x] >= 128
            if source_height != native_height:
                cell = _resize(cell, max(1, round(glyph["width"] * native_height/source_height)), native_height)
            cells[char] = cell
    else:
        identity = family.split(":")[1]
        path = CACHE / f"{identity}.font"
        if not path.is_file() or path.stat().st_size > 5 * 1024 * 1024:
            raise ValueError("Upload this font again; its local font file is unavailable.")
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != identity or data[:4] not in (b"\x00\x01\x00\x00", b"OTTO"):
            raise ValueError("The uploaded font is invalid or has changed.")
        for char in CODES:
            # Explicit paths prevent font names, filenames and label text becoming commands.
            image = _magick(["-background", "none", "-fill", "white", "-font", str(path), "-pointsize", str(value["size"]), f"label:{char}", "png:-"])
            width, height, raw = _raw(image)
            cells[char] = [[raw[y * width + x] >= 128 for x in range(width)] for y in range(height)]
        native_height = max(len(cell) for cell in cells.values())
        for char, cell in cells.items():
            cell.extend([[False] * len(cell[0]) for _ in range(native_height - len(cell))])
    # Resize common-height cells together so punctuation retains its baseline.
    pad = max(0, value["thickness"])
    transformed = {}
    for char, rows in cells.items():
        target_width = max(1, round(len(rows[0]) * value["size"] / native_height * value["width"] / 100))
        rows = _resize(rows, target_width, value["size"])
        if pad:
            rows = [[False] * (target_width + 2*pad) for _ in range(pad)] + [[False]*pad + row + [False]*pad for row in rows] + [[False]*(target_width + 2*pad) for _ in range(pad)]
        transformed[char] = _morph(rows, value["thickness"])
    points = [(y, x) for rows in transformed.values() for y, row in enumerate(rows) for x, ink in enumerate(row) if ink]
    if not points:
        raise ValueError("These settings remove every font stroke; increase thickness or size.")
    top, bottom = min(y for y, _ in points), max(y for y, _ in points) + 1
    glyph_rows = {}
    for char, rows in transformed.items():
        rows = _resize(rows[top:bottom], len(rows[0]), value["size"])
        ink = [(x, y) for y, row in enumerate(rows) for x, on in enumerate(row) if on]
        if not ink:
            raise ValueError("These settings remove a required clock character; increase thickness or size.")
        left, right = min(x for x, _ in ink), max(x for x, _ in ink) + 1
        upper, lower = min(y for _, y in ink), max(y for _, y in ink) + 1
        glyph_rows[char] = (upper, [row[left:right] for row in rows[upper:lower]])
    atlas_width = sum(len(rows[0]) + 1 for _, rows in glyph_rows.values())
    if atlas_width > 4096:
        raise ValueError("This font is too wide; reduce size or width.")
    pixels = bytearray(atlas_width * value["size"] * 4)
    glyphs, cursor = {}, 0
    for char, (offset, rows) in glyph_rows.items():
        width, height = len(rows[0]), len(rows)
        glyphs[str(ord(char))] = {"x": cursor, "y": offset, "width": width, "height": height, "xoffset": 0, "yoffset": offset, "xadvance": max(1, width + value["letterSpacing"])}
        for y, row in enumerate(rows):
            for x, ink in enumerate(row):
                if ink:
                    start = ((y + offset) * atlas_width + cursor + x) * 4
                    pixels[start:start+4] = b"\xff\xff\xff\xff"
        cursor += width + 1
    font = {"height": value["size"], "atlasWidth": atlas_width, "atlasHeight": value["size"], "glyphs": glyphs, "label": "Custom clock", "inkBounds": True}
    image = _png_rgba(atlas_width, value["size"], pixels)
    record = {"font": font, "image": base64.b64encode(image).decode(), "typography": value, "device": device}
    content = json.dumps(record, sort_keys=True, separators=(",", ":")).encode()
    identity = hashlib.sha256(content).hexdigest()
    CACHE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=CACHE, delete=False) as temporary:
        temporary.write(content)
        temporary_path = Path(temporary.name)
    temporary_path.replace(CACHE / f"{identity}.json")
    return f"generated:{identity}", record


def load(key, device):
    if not isinstance(key, str) or not re.fullmatch(r"generated:[a-f0-9]{64}", key):
        raise ValueError("Choose a supported native font.")
    path = CACHE / f"{key.split(':')[1]}.json"
    if not path.is_file() or path.stat().st_size > 2_000_000:
        raise ValueError("This generated font is unavailable; apply its typography again.")
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != key.split(":")[1]:
        raise ValueError("The generated font changed; apply its typography again.")
    record = json.loads(content)
    if record["device"] != device:
        raise ValueError("Regenerate this font for the selected watch.")
    settings(record["typography"])
    record["image"] = base64.b64decode(record["image"], validate=True)
    return record


def _clock_values(source):
    if source == "hours":
        return (f"{hour:02d}" for hour in range(24))
    if source == "minutes":
        return (f"{minute:02d}" for minute in range(60))
    return (f"{hour:02d}:{minute:02d}" for hour in range(24) for minute in range(60))


def _clock_width(font, source):
    """Reserve the widest live value using the renderer's exact measurement rule."""
    def text_width(text):
        glyphs = [font["glyphs"][str(ord(char))] for char in text]
        if not font.get("inkBounds", False):
            return max(0, sum(glyph["xadvance"] for glyph in glyphs) - 1)
        pen, right = 0, 0
        for glyph in glyphs:
            right = max(right, pen + glyph["width"])
            pen += glyph["xadvance"]
        return right
    return max(text_width(text) for text in _clock_values(source))


def _clock_target(scene, element_id):
    target = next((element for element in scene["elements"] if element["id"] == element_id), None)
    if not target or target["source"] not in {"time", "hours", "minutes"}:
        raise ValueError("Select a time element to edit its clock settings.")
    return target


def _fit_clock(scene, element_id, metrics, **changes):
    from designer_model import validate_scene
    edited = copy.deepcopy(scene)
    element = _clock_target(edited, element_id)
    source = changes.get("source", element["source"])
    width, height = _clock_width(metrics, source), metrics["height"]
    element.update(x=(2*element["x"] + element["width"] - width)//2,
                   y=(2*element["y"] + element["height"] - height)//2,
                   width=width, height=height, **changes)
    try:
        return validate_scene(edited)
    except ValueError as error:
        raise ValueError("This clock setting does not fit at the element's position inside the watch boundary. Reduce size or width, or move it towards the centre.") from error


def set_clock_source(scene, element_id, source):
    """Change the shown clock component while preserving its font and centre."""
    from designer_model import validate_scene, scene_font_pack
    if not isinstance(source, str) or source not in {"time", "hours", "minutes"}:
        raise ValueError("Choose HH:MM, hours only or minutes only.")
    scene = validate_scene(scene)
    target = _clock_target(scene, element_id)
    font = scene_font_pack(scene)["fonts"][target["font"]]
    return _fit_clock(scene, element_id, font, source=source)


def apply(scene, element_id, value):
    from designer_model import validate_scene
    scene = validate_scene(scene)
    _clock_target(scene, element_id)
    key, record = generate(scene["device"], value)
    return _fit_clock(scene, element_id, record["font"], font=key, typography=settings(value))
