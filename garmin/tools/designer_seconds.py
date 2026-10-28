"""Exact mixed-size seconds masks without changing the source font's glyphs."""
import copy
import functools
import json

HALF_CODE_OFFSET = 0xE000
HALF_CHARACTERS = ":0123456789"


def display_text(text, element):
    if element.get("source") == "timeSeconds" and element.get("secondsSize", "full") == "half":
        return str(text)[:5] + "".join(chr(ord(char) + HALF_CODE_OFFSET) for char in str(text)[5:])
    return str(text)


def with_half_seconds(font, image):
    return _expanded(json.dumps(font, sort_keys=True), image)


@functools.lru_cache(maxsize=64)
def _expanded(descriptor, image):
    from designer_model import _png_rgba
    from designer_typography import _raw
    font = json.loads(descriptor)
    atlas_width, atlas_height, raw = _raw(image)
    half_height = max(1, font["height"] // 2)
    additions = []
    for char in HALF_CHARACTERS:
        glyph = font["glyphs"][str(ord(char))]
        target_width = max(1, glyph["width"] // 2)
        cell = [[False] * glyph["width"] for _ in range(font["height"])]
        for y in range(glyph["height"]):
            for x in range(glyph["width"]):
                cell[y + glyph["yoffset"]][x] = raw[(y + glyph["y"]) * atlas_width + x + glyph["x"]] >= 128
        # Area sampling preserves thin dots and strokes at the smallest supported size.
        rows = [[any(cell[yy][xx]
                    for yy in range(y * font["height"] // half_height, (y + 1) * font["height"] // half_height)
                    for xx in range(x * glyph["width"] // target_width, (x + 1) * glyph["width"] // target_width))
                 for x in range(target_width)] for y in range(half_height)]
        ink = [(x, y) for y, row in enumerate(rows) for x, on in enumerate(row) if on]
        if not ink:
            raise ValueError("The selected font has no visible seconds glyph.")
        left, right = min(x for x, _ in ink), max(x for x, _ in ink) + 1
        top, bottom = min(y for _, y in ink), max(y for _, y in ink) + 1
        additions.append((char, glyph, font["height"] - half_height + top,
                          [row[left:right] for row in rows[top:bottom]]))
    new_width = atlas_width + sum(len(rows[0]) + 1 for _, _, _, rows in additions)
    height = max(atlas_height, font["height"])
    if new_width > 4096 or height > 2048:
        raise ValueError("The half-size seconds atlas exceeds the native font bounds.")
    pixels = bytearray(new_width * height * 4)
    for y in range(atlas_height):
        for x in range(atlas_width):
            if raw[y * atlas_width + x] >= 128:
                index = (y * new_width + x) * 4
                pixels[index:index + 4] = b"\xff\xff\xff\xff"
    result = copy.deepcopy(font)
    cursor = atlas_width
    for char, original, offset, rows in additions:
        width = len(rows[0])
        result["glyphs"][str(ord(char) + HALF_CODE_OFFSET)] = {
            "x": cursor, "y": offset, "width": width, "height": len(rows),
            "xoffset": 0, "yoffset": offset, "xadvance": max(1, original["xadvance"] // 2),
        }
        for y, row in enumerate(rows):
            for x, on in enumerate(row):
                if on:
                    index = ((y + offset) * new_width + cursor + x) * 4
                    pixels[index:index + 4] = b"\xff\xff\xff\xff"
        cursor += width + 1
    result.update(atlasWidth=new_width, atlasHeight=height)
    return result, _png_rgba(new_width, height, pixels)
