"""Compare canvas pixels with an unscaled native Garmin screen capture.

Only pixel centres inside the round display are compared. RGB and alpha must
match exactly; hidden RGB is irrelevant when both pixels are fully transparent.
The comparison directory must be new, so captures and earlier results survive.
"""
import argparse
import json
from pathlib import Path
import struct
import subprocess
import sys

from designer_model import _png_rgba


def _read_png(path):
    path = Path(path)
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("Capture exceeds the 16 MB input limit.")
    data = path.read_bytes()
    if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("Each capture must be a PNG image.")
    width, height = struct.unpack(">II", data[16:24])
    if width != height or not 1 <= width <= 454:
        raise ValueError("Captures must be square and at most 454 pixels wide.")
    # PNG stdin prevents filename options, coders or pseudo-images being used.
    # Retag colour metadata without transforming the encoded framebuffer samples.
    result = subprocess.run(
        ["magick", "-limit", "memory", "32MiB", "-limit", "map", "32MiB",
         "-limit", "disk", "0", "png:-", "+profile", "*", "-set", "colorspace", "sRGB", "-alpha", "on",
         "-depth", "8", "rgba:-"],
        input=data, capture_output=True, timeout=20, check=False,
    )
    if result.returncode or len(result.stdout) != width * height * 4:
        raise ValueError("Capture could not be decoded as one RGBA PNG image.")
    return width, height, result.stdout


def compare_images(expected, actual, output_dir):
    """Write a fresh comparison bundle and return its JSON-compatible report."""
    width, height, canvas = _read_png(expected)
    actual_width, actual_height, native = _read_png(actual)
    if (width, height) != (actual_width, actual_height):
        raise ValueError("Canvas and native capture dimensions must match exactly; no resizing or cropping is applied.")
    destination = Path(output_dir)
    if destination.exists():
        raise ValueError("Choose a new comparison output directory.")
    changed = 0
    compared = 0
    left, top, right, bottom = width, height, -1, -1
    diff = bytearray(width * height * 4)
    for y in range(height):
        for x in range(width):
            # Integer arithmetic implements the pixel-centre circle exactly.
            if (2 * x + 1 - width) ** 2 + (2 * y + 1 - height) ** 2 > width ** 2:
                continue
            compared += 1
            offset = (y * width + x) * 4
            expected_pixel = canvas[offset:offset + 4]
            actual_pixel = native[offset:offset + 4]
            equal = (expected_pixel == actual_pixel or
                     expected_pixel[3] == actual_pixel[3] == 0)
            if equal:
                diff[offset:offset + 4] = bytes((0, 0, 0, 255))
            else:
                changed += 1
                left, top = min(left, x), min(top, y)
                right, bottom = max(right, x), max(bottom, y)
                diff[offset:offset + 4] = bytes((255, 0, 128, 255))
    report = {
        "match": changed == 0,
        "width": width,
        "height": height,
        "comparedPixels": compared,
        "changedPixels": changed,
        "boundingBox": None if changed == 0 else {
            "x": left, "y": top, "width": right - left + 1, "height": bottom - top + 1,
        },
        "tolerance": 0,
        "mask": "pixel-centre circle",
    }
    # Exclusive creation is also the final race check before writing artefacts.
    destination.mkdir(parents=True, exist_ok=False)
    (destination / "canvas.png").write_bytes(_png_rgba(width, height, canvas))
    (destination / "native.png").write_bytes(_png_rgba(width, height, native))
    (destination / "diff.png").write_bytes(_png_rgba(width, height, diff))
    (destination / "comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("expected", type=Path, help="Canvas PNG at native resolution")
    parser.add_argument("actual", type=Path, help="Garmin screen-capture PNG at native resolution")
    parser.add_argument("output_dir", type=Path, help="New directory for comparison artefacts")
    arguments = parser.parse_args(argv)
    try:
        report = compare_images(arguments.expected, arguments.actual, arguments.output_dir)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"Comparison input error: {error}", file=sys.stderr)
        return 2
    print(json.dumps(report))
    return 0 if report["match"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
