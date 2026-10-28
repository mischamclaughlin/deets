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
DIVIDER_CODES = CODES + "./|"
DIVIDER_SYMBOLS = {":", ".", "-", "/", "|"}


def family_setting(family):
    if not isinstance(family, str) or (family not in {"time", "widget"} and not re.fullmatch(r"upload:[a-f0-9]{64}", family)):
        raise ValueError("Choose an included font or upload a TTF/OTF font.")
    return family


def inherits(element):
    return element.get("inheritFont", "typography" not in element)


def element_settings(element, device):
    if "typography" in element:
        return dict(element["typography"])
    from designer_model import font_pack
    height = (font_pack(device)["fonts"][element["font"]]["height"]
              if element["source"] == "secondsRing" else element["height"])
    return {"family": "widget" if element["font"] == "widget" else "time",
        "size": height, "thickness": 0, "width": 100, "letterSpacing": 1}


def settings(value):
    if not isinstance(value, dict) or set(value) != {"family", "size", "thickness", "width", "letterSpacing"}:
        raise ValueError("Choose a font, size, thickness, width and letter spacing.")
    family_setting(value["family"])
    for field, low, high in (("size", 12, 160), ("thickness", -2, 6), ("width", 50, 200), ("letterSpacing", -4, 24)):
        if type(value[field]) is not int or not low <= value[field] <= high:
            raise ValueError(f"Typography {field} must be an integer from {low} to {high}.")
    return dict(value)


def text_defaults(value):
    if not isinstance(value, dict) or set(value) != {"size", "thickness", "width", "letterSpacing"}:
        raise ValueError("Choose default size, thickness, width and letter spacing.")
    checked = settings({"family": "time", **value})
    return {key: checked[key] for key in value}


def text_presets(value, default_id):
    if not isinstance(value, list) or not 1 <= len(value) <= 20:
        raise ValueError("Keep from 1 to 20 named text presets.")
    presets, identities, names = [], set(), set()
    for original in value:
        if not isinstance(original, dict) or set(original) != {"id", "name", "size", "thickness", "width", "letterSpacing"}:
            raise ValueError("Each text preset needs an identifier, name and numeric typography settings.")
        identity, name = original["id"], original["name"]
        if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", identity) or identity in identities:
            raise ValueError("Each text preset needs a unique valid identifier.")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40 or name.strip().casefold() in names:
            raise ValueError("Give each text preset a unique name from 1 to 40 characters.")
        identities.add(identity)
        names.add(name.strip().casefold())
        presets.append({"id": identity, "name": name.strip(), **text_defaults({key: original[key] for key in ("size", "thickness", "width", "letterSpacing")})})
    if not isinstance(default_id, str) or default_id not in identities:
        raise ValueError("Choose an existing text preset as the default for new text.")
    return presets


def preset_settings(preset):
    return {key: preset[key] for key in ("size", "thickness", "width", "letterSpacing")}


def scene_text_defaults(scene):
    if "textPresets" in scene:
        presets = text_presets(scene["textPresets"], scene.get("defaultTextPresetId"))
        return preset_settings(next(preset for preset in presets if preset["id"] == scene["defaultTextPresetId"]))
    if "textDefaults" in scene:
        return text_defaults(scene["textDefaults"])
    from designer_model import font_pack
    return {"size": font_pack(scene["device"])["fonts"]["time"]["height"],
            "thickness": 0, "width": 100, "letterSpacing": 1}


def scene_text_presets(scene):
    if "textPresets" in scene:
        return text_presets(scene["textPresets"], scene.get("defaultTextPresetId"))
    from designer_model import font_pack
    return [{"id": "time", "name": "Time", **scene_text_defaults(scene)},
            {"id": "widgets", "name": "Widgets", "size": font_pack(scene["device"])["fonts"]["widget"]["height"],
             "thickness": 0, "width": 100, "letterSpacing": 1}]


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


def generate(device, value, *, divider=False):
    from designer_model import font_pack, _png_rgba
    value = settings(value)
    codes = DIVIDER_CODES if divider else CODES
    family = value["family"]
    cells = {}
    if family in {"time", "widget"}:
        pack = font_pack(device)
        font = pack["fonts"][family]
        width, _, raw = _raw(pack["images"][family])
        native_height = font["height"]
        for char in codes:
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
        for char in codes:
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


def _clock_values(source, symbol=":"):
    if source == "divider":
        return (symbol,)
    if source == "timeSeconds":
        return (f"{hour:02d}:{minute:02d}:{second:02d}" for hour in range(24) for minute in range(60) for second in range(60))
    if source == "hours":
        return (f"{hour:02d}" for hour in range(24))
    if source in {"minutes", "seconds"}:
        return (f"{minute:02d}" for minute in range(60))
    return (f"{hour:02d}:{minute:02d}" for hour in range(24) for minute in range(60))


def _clock_width(font, source, symbol=":", seconds_size="full"):
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
    if source == "timeSeconds":
        from designer_seconds import HALF_CODE_OFFSET
        def tail(text):
            return "".join(chr(ord(char) + HALF_CODE_OFFSET) for char in text) if seconds_size == "half" else text
        components = ([f"{hour:02d}" for hour in range(24)], [":"],
                      [f"{minute:02d}" for minute in range(60)], [tail(":")],
                      [tail(f"{second:02d}") for second in range(60)])
        advance, right = 0, 0
        for choices in components:
            maximum_advance = 0
            maximum_right = 0
            for text in choices:
                pen, edge = 0, 0
                for char in text:
                    glyph = font["glyphs"][str(ord(char))]
                    edge = max(edge, pen + glyph["width"])
                    pen += glyph["xadvance"]
                maximum_advance = max(maximum_advance, pen)
                maximum_right = max(maximum_right, edge)
            right = max(right, advance + maximum_right)
            advance += maximum_advance
        return right if font.get("inkBounds", False) else max(0, advance - 1)
    return max(text_width(text) for text in _clock_values(source, symbol))


def _clock_target(scene, element_id):
    target = next((element for element in scene["elements"] if element["id"] == element_id), None)
    if not target or target["source"] not in {"time", "timeSeconds", "hours", "minutes", "divider", "seconds", "secondsRing"}:
        raise ValueError("Select a time element to edit its clock settings.")
    return target


def _fit_clock(scene, element_id, metrics, *, validate=True, preserve_parity=False, **changes):
    from designer_model import validate_scene
    edited = copy.deepcopy(scene)
    element = _clock_target(edited, element_id)
    source = changes.get("source", element["source"])
    if source == "secondsRing":
        if element["source"] != "secondsRing":
            from designer_model import DEVICES
            size = DEVICES[scene["device"]]
            element.update(x=0, y=0, width=size, height=size)
        element.update(**changes)
    else:
        seconds_size = changes.get("secondsSize", element.get("secondsSize", "full"))
        if source == "timeSeconds" and seconds_size == "half":
            from designer_model import scene_font_pack
            future = copy.deepcopy(edited)
            _clock_target(future, element_id).update(**changes)
            metrics = scene_font_pack(future)["fonts"][changes.get("font", element["font"])]
        width, height = _clock_width(metrics, source, changes.get("dividerSymbol", element.get("dividerSymbol", ":")), seconds_size), metrics["height"]
        if preserve_parity and (width - element["width"]) % 2:
            width += 1
        element.update(x=(2*element["x"] + element["width"] - width)//2,
                       y=(2*element["y"] + element["height"] - height)//2,
                       width=width, height=height, **changes)
    if not validate:
        return edited
    try:
        return validate_scene(edited)
    except ValueError as error:
        raise ValueError("This text setting does not fit at the element's position inside the watch boundary. Reduce size or width, or move it towards the centre.") from error


def set_clock_source(scene, element_id, source):
    """Change the shown clock component while preserving its font and centre."""
    from designer_model import validate_scene, scene_font_pack
    if not isinstance(source, str) or source not in {"time", "timeSeconds", "hours", "minutes", "seconds", "secondsRing"}:
        raise ValueError("Choose HH:MM, HH:MM:SS, hours only, minutes only, seconds or an outer ring.")
    scene = validate_scene(scene)
    target = _clock_target(scene, element_id)
    if target["source"] == "divider":
        raise ValueError("Choose a time element; dividers are independent Library elements.")
    font = scene_font_pack(scene)["fonts"][target["font"]]
    return _fit_clock(scene, element_id, font, source=source)


def apply(scene, element_id, value):
    from designer_model import validate_scene
    scene = validate_scene(scene)
    target = _clock_target(scene, element_id)
    value = settings(value)
    inherited = inherits(target)
    if inherited:
        value["family"] = scene.get("fontFamily", "time")
    key, record = generate(scene["device"], value, divider=target["source"] == "divider")
    return _fit_clock(scene, element_id, record["font"], font=key, typography=value, inheritFont=inherited)


def add_time(scene):
    """Create a fresh clock using native metrics without copying another clock's state."""
    from designer_model import validate_scene, font_pack, DEVICES
    scene = validate_scene(scene)
    if len(scene["elements"]) >= 40:
        raise ValueError("A design can contain at most 40 elements.")
    font = font_pack(scene["device"])["fonts"]["time"]
    key, value = "time", None
    if "textDefaults" in scene or "textPresets" in scene or scene.get("fontFamily", "time") != "time":
        value = {"family": scene.get("fontFamily", "time"), **scene_text_defaults(scene)}
        key, record = generate(scene["device"], value)
        font = record["font"]
    width, height = _clock_width(font, "time"), font["height"]
    size = DEVICES[scene["device"]]
    identifiers = {element["id"] for element in scene["elements"]}
    identity, index = "time", 2
    while identity in identifiers:
        identity = f"time-{index}"
        index += 1
    edited = copy.deepcopy(scene)
    edited["elements"].append({
        "id": identity, "source": "time", "font": key, "inheritFont": True,
        **({"typography": value} if value else {}),
        "x": (size - width) // 2, "y": (size - height) // 2,
        "width": width, "height": height, "align": "centre",
        "colour": 0xdceccf, "nightColour": 0x8d99ae, "visible": "both",
    })
    try:
        return validate_scene(edited)
    except ValueError as error:
        raise ValueError("A new time element cannot fit inside this boundary. Reduce the edge clearance first.") from error


def set_watch_font(scene, family):
    """Resolve every inheriting clock in one atomic scene edit."""
    from designer_model import validate_scene
    scene = validate_scene(scene)
    family = family_setting(family)
    edited = copy.deepcopy(scene)
    edited["fontFamily"] = family
    generated = {}
    if family.startswith("upload:"):
        # Validate even a watch with no inheritors before accepting its default.
        value = {"family": family, "size": 88, "thickness": 0, "width": 100, "letterSpacing": 1}
        generated[(False, tuple(sorted(value.items())))] = generate(scene["device"], value)
    for element in scene["elements"]:
        if element["source"] not in {"time", "timeSeconds", "hours", "minutes", "divider", "seconds", "secondsRing"} or not inherits(element):
            continue
        value = {**element_settings(element, scene["device"]), "family": family}
        signature = (element["source"] == "divider", tuple(sorted(value.items())))
        if signature not in generated:
            generated[signature] = generate(scene["device"], value, divider=element["source"] == "divider")
        key, record = generated[signature]
        edited = _fit_clock(edited, element["id"], record["font"], validate=False,
                            font=key, typography=value, inheritFont=True)
    try:
        return validate_scene(edited)
    except ValueError as error:
        raise ValueError("This watch font does not fit every inheriting element. Reduce its size or width, or move it towards the centre.") from error


def set_inheritance(scene, element_id, inherit):
    from designer_model import validate_scene
    if type(inherit) is not bool:
        raise ValueError("Choose whether to inherit the watch font.")
    scene = validate_scene(scene)
    target = _clock_target(scene, element_id)
    edited = copy.deepcopy(scene)
    _clock_target(edited, element_id)["inheritFont"] = inherit
    if not inherit:
        return validate_scene(edited)
    value = {**element_settings(target, scene["device"]), "family": scene.get("fontFamily", "time")}
    key, record = generate(scene["device"], value, divider=target["source"] == "divider")
    return _fit_clock(edited, element_id, record["font"], font=key, typography=value, inheritFont=True)


def add_divider(scene):
    """Create a separate centred divider with the watch's current family."""
    from designer_model import validate_scene, DEVICES
    scene = validate_scene(scene)
    if len(scene["elements"]) >= 40:
        raise ValueError("A design can contain at most 40 elements.")
    value = {"family": scene.get("fontFamily", "time"), **scene_text_defaults(scene)}
    key, record = generate(scene["device"], value, divider=True)
    width, height = _clock_width(record["font"], "divider"), record["font"]["height"]
    size = DEVICES[scene["device"]]
    identifiers = {element["id"] for element in scene["elements"]}
    identity, index = "divider", 2
    while identity in identifiers:
        identity = f"divider-{index}"
        index += 1
    edited = copy.deepcopy(scene)
    edited["elements"].append({"id": identity, "source": "divider", "font": key,
        "inheritFont": True, "typography": value, "dividerSymbol": ":", "dividerPosition": "middle",
        "x": (size-width)//2, "y": (size-height)//2, "width": width, "height": height,
        "align": "centre", "colour": 0xdceccf, "nightColour": 0x8d99ae, "visible": "both"})
    return validate_scene(edited)


def set_divider_symbol(scene, element_id, symbol):
    from designer_model import validate_scene, scene_font_pack
    if not isinstance(symbol, str) or symbol not in DIVIDER_SYMBOLS:
        raise ValueError("Choose colon, dot, dash, slash or vertical bar for the divider.")
    scene = validate_scene(scene)
    target = _clock_target(scene, element_id)
    if target["source"] != "divider":
        raise ValueError("Select a divider element to change its symbol.")
    font = scene_font_pack(scene)["fonts"][target["font"]]
    changes = {"dividerSymbol": symbol}
    if str(ord(symbol)) not in font["glyphs"]:
        value = element_settings(target, scene["device"])
        if inherits(target):
            value["family"] = scene.get("fontFamily", "time")
        key, record = generate(scene["device"], value, divider=True)
        font = record["font"]
        changes.update(font=key, typography=value, inheritFont=inherits(target))
    return _fit_clock(scene, element_id, font, **changes)


def set_seconds_size(scene, element_id, size):
    from designer_model import validate_scene, scene_font_pack
    if not isinstance(size, str) or size not in {"full", "half"}:
        raise ValueError("Choose full or half size for seconds.")
    scene = validate_scene(scene)
    target = _clock_target(scene, element_id)
    if target["source"] != "timeSeconds":
        raise ValueError("Select an HH:MM:SS element to change its seconds size.")
    metrics = scene_font_pack(scene)["fonts"][target["font"]]
    return _fit_clock(scene, element_id, metrics, preserve_parity=True, secondsSize=size)
