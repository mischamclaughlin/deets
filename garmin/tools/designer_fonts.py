"""Garmin font resources built from the same canonical masks used by the canvas."""

from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zlib


FONT_GRAPHICS_BUDGET = 2 * 1024 * 1024


def graphics_cost(pack, needed_codes):
    """Conservative coverage-storage allowance within the targets' 3 MiB pool.

    Reserve one byte per visible glyph pixel and fixed glyph overhead for the
    exported greyscale font coverage. This is a separate rejection guard from the
    application-heap estimate, not a measurement of firmware allocation.
    """
    return sum(64 + glyph["width"] * glyph["height"]
               for key, codes in needed_codes.items()
               for code, glyph in pack["fonts"][key]["glyphs"].items()
               if int(code) in codes and glyph["width"] > 0 and glyph["height"] > 0)


def _coverage_png(mask):
    from designer_typography import _raw
    width, height, coverage = _raw(mask)

    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))

    rows = b"".join(b"\0" + coverage[y * width:(y + 1) * width] for y in range(height))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def write_fonts(project, pack, used_fonts, needed_codes):
    """Write one colour-independent resource per style, in an isolated project.

    Glyphs retain the canonical atlas rectangles and advances. Resource yoffset
    is zero because the shared layout already supplies each visible glyph's
    origin, including punctuation, divider positioning and half-size seconds.
    Zero-area glyphs advance the layout but never enter a native draw operation.
    """
    project = Path(project)
    if project.resolve() == Path(__file__).resolve().parent.parent:
        raise ValueError("Native font resources require an isolated project copy.")
    assets = project / "resources/designer-fonts"
    assets.mkdir(parents=True, exist_ok=True)
    resources = ET.Element("fonts")
    identifiers = []
    for index, key in enumerate(used_fonts):
        font = pack["fonts"][key]
        glyphs = [(int(code), glyph) for code, glyph in font["glyphs"].items()
                  if int(code) in needed_codes[key] and glyph["width"] > 0 and glyph["height"] > 0]
        if not glyphs:
            raise ValueError("The selected native font has no visible supported glyphs.")
        filename = f"font-{index}"
        (assets / f"{filename}.png").write_bytes(_coverage_png(pack["images"][key]))
        lines = [
            f'info face="Deets font {index}" size={font["height"]} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=4 padding=0,0,0,0 spacing=0,0 outline=0',
            f'common lineHeight={font["height"]} base={font["height"]} scaleW={font["atlasWidth"]} scaleH={font["atlasHeight"]} pages=1 packed=0',
            f'page id=0 file="{filename}.png"',
            f"chars count={len(glyphs)}",
        ]
        for code, glyph in sorted(glyphs):
            lines.append(f'char id={code} x={glyph["x"]} y={glyph["y"]} width={glyph["width"]} height={glyph["height"]} xoffset=0 yoffset=0 xadvance={glyph["xadvance"]} page=0 chnl=15')
        (assets / f"{filename}.fnt").write_text("\n".join(lines) + "\n")
        identifier = f"DesignerFont{index}"
        ET.SubElement(resources, "font", {"id": identifier,
                      "filename": f"designer-fonts/{filename}.fnt", "antialias": "true"})
        identifiers.append(f"Rez.Fonts.{identifier}")
    ET.ElementTree(resources).write(project / "resources/designer-fonts.xml",
                                    encoding="utf-8", xml_declaration=True)
    return identifiers
