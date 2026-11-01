"""Exact colour-independent icon glyphs for the generated Garmin renderer."""

from designer_activity import ICON_MASKS, ICON_VARIANTS, icon_ops


def icon_signature(element):
    """Positions and colours do not change an icon's binary native coverage."""
    return ICON_VARIANTS.get(element["source"], (ICON_MASKS[element["source"]],)), element["width"], element["height"]


def icon_font(element):
    """Rasterise canonical rectangles once, rather than retaining VM arrays.

    Every variant keeps its complete element box as one glyph, so neither native
    font measurement nor antialiasing can change the original integer coverage.
    """
    from designer_model import _png_rgba
    variants, width, height = icon_signature(element)
    atlas_width = width * len(variants)
    pixels = bytearray(atlas_width * height * 4)
    glyphs = {}
    local = {**element, "x": 0, "y": 0}
    for index, variant in enumerate(variants):
        for rectangle in icon_ops(local, variant):
            for y in range(rectangle["y"], rectangle["y"] + rectangle["height"]):
                for x in range(rectangle["x"], rectangle["x"] + rectangle["width"]):
                    offset = (y * atlas_width + index * width + x) * 4
                    pixels[offset:offset + 4] = b"\xff\xff\xff\xff"
        glyphs[str(0xE200 + index)] = dict(x=index * width, y=0, width=width,
            height=height, xoffset=0, yoffset=0, xadvance=width)
    return dict(height=height, atlasWidth=atlas_width, atlasHeight=height,
                glyphs=glyphs), _png_rgba(atlas_width, height, pixels)
