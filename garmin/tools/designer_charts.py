"""Integer rectangle primitives shared by the builder and its Garmin generator."""
import math
import functools

SAMPLES = {
    'stepsWeek': [4000, 8200, 6000, 10000, 7500, 3000, 5000],
    'floorsWeek': [4, 8, 6, 10, 7, 3, 5],
    'runWeek': [4, 8, 6, 10, 7, 3, 5],
    'heartZones': 64, 'temperatureZones': 17,
    'solarTimeline': [25200, 64800, 36503], 'secondsRing': 23,
}


def device_colour(colour):
    """Match the epix simulator's 16-bit RGB framebuffer, including truncation."""
    red = ((colour >> 19) & 31) * 255 // 31
    green = ((colour >> 10) & 63) * 255 // 63
    blue = ((colour >> 3) & 31) * 255 // 31
    return red << 16 | green << 8 | blue


def shade(colour, percent):
    return sum((((colour >> shift) & 255) * percent // 100) << shift for shift in (16, 8, 0))


def pack_ring_rect(x, y, width, height):
    """Keep a native rectangle in one positive 28-bit VM number."""
    return x | (y << 9) | ((width - 1) << 18) | ((height - 1) << 23)


def unpack_ring_rect(value):
    return value & 511, (value >> 9) & 511, ((value >> 18) & 31) + 1, ((value >> 23) & 31) + 1


def _ring_rectangles(pixels):
    rows = {}
    for x, y in pixels:
        rows.setdefault(y, []).append(x)
    active, rectangles = {}, []
    for y in range(min(rows, default=0), max(rows, default=-1) + 2):
        spans, left, previous = [], None, None
        for x in sorted(rows.get(y, [])):
            if previous is not None and x != previous + 1:
                spans.append((left, previous - left + 1))
                left = None
            if left is None:
                left = x
            previous = x
        if left is not None:
            spans.append((left, previous - left + 1))
        current = set(spans)
        for span in list(active):
            if span not in current:
                top, height = active.pop(span)
                rectangles.append((span[0], top, span[1], height))
        for span in spans:
            if span in active:
                top, height = active[span]
                active[span] = top, height + 1
            else:
                active[span] = y, 1
    packed = []
    for x, y, width, height in rectangles:
        for dy in range(0, height, 32):
            for dx in range(0, width, 32):
                packed.append(pack_ring_rect(x + dx, y + dy, min(32, width - dx), min(32, height - dy)))
    return tuple(packed)


def ring_tick_radius(scene, element):
    """Place every tick's outer tip on the content-clearance circumference."""
    width = element["width"]
    scale = min(1, width / 40)
    if not element.get("ringTicksToCircumference", False):
        return width / 2 - 4 * scale
    from designer_model import DEVICES
    guide_radius = DEVICES[scene["device"]] / 2 - scene.get("edgeInset", 0)
    return max(0, min(width / 2, guide_radius))


def ring_tick_inner_radius(scene, element):
    """A negative sentinel keeps the normal varied lengths unchanged."""
    if not element.get("ringTicksStretchToCircumference", False):
        return -1
    from designer_model import DEVICES
    guide_radius = DEVICES[scene["device"]] / 2 - scene.get("edgeInset", 0)
    return max(0, min(ring_tick_radius(scene, element), guide_radius))


def ring_signature(scene, element):
    return element["width"], ring_tick_radius(scene, element), ring_tick_inner_radius(scene, element)


@functools.lru_cache(maxsize=64)
def ring_geometry(width, outer_radius=None, inner_radius=-1):
    """Parent watch tick hierarchy, rasterised once to shared integer masks.

    Native drawing decodes these same rectangles rather than rasterising its own
    polygons. Small legacy rings scale their strokes to remain inside the box.
    """
    scale = min(1, width / 40)
    centre = width / 2
    outer = centre - 4 * scale if outer_radius is None else outer_radius
    groups = []
    for second in range(60):
        angle = second * math.pi / 30
        radial_x, radial_y = math.sin(angle), -math.cos(angle)
        length = (15 if second % 15 == 0 else 11 if second % 5 == 0 else 7) * scale
        half_width = (6 if second % 15 == 0 else 4 if second % 5 == 0 else 2) * scale / 2
        inner = max(0, outer - length) if inner_radius < 0 else max(0, min(outer, inner_radius))
        corners = [(centre + radial_x * radius - radial_y * side,
                    centre + radial_y * radius + radial_x * side)
                   for radius in (inner, outer) for side in (-half_width, half_width)]
        pixels = set()
        for y in range(max(0, math.floor(min(point[1] for point in corners))), min(width, math.ceil(max(point[1] for point in corners)))):
            for x in range(max(0, math.floor(min(point[0] for point in corners))), min(width, math.ceil(max(point[0] for point in corners)))):
                dx, dy = x + 0.5 - centre, y + 0.5 - centre
                radial = dx * radial_x + dy * radial_y
                tangent = -dx * radial_y + dy * radial_x
                if inner - 1e-9 <= radial <= outer + 1e-9 and abs(tangent) <= half_width + 1e-9:
                    pixels.add((x, y))
        groups.append(_ring_rectangles(pixels))
    return tuple(groups)


def chart_ops(element, value=None, night=False, *, ring_radius=None, ring_inner_radius=-1):
    source = element['source']
    value = SAMPLES[source] if value is None else value
    x, y, width, height = (element[k] for k in ('x', 'y', 'width', 'height'))
    colour = element['nightColour' if night else 'colour']
    ops = []
    def rect(px, py, w, h, c):
        if w > 0 and h > 0:
            ops.append({'kind': 'rect', 'x': px, 'y': py, 'width': w, 'height': h, 'colour': c})
    if source.endswith('Week'):
        maximum = max([1] + [v for v in value if v is not None])
        usable = width - 18
        for i, v in enumerate(value):
            left, right = i * usable // 7, (i + 1) * usable // 7
            h = 1 if v is None else max(1, math.floor(height * max(0, v) / maximum))
            rect(x + left + i * 3, y + height - h, right - left, h, shade(colour, 24) if v is None else colour)
    elif source.endswith('Zones'):
        boundaries = [110, 130, 150, 170] if source == 'heartZones' else [0, 10, 20, 30]
        active = sum(value > boundary for boundary in boundaries)
        usable = width - 12
        for i, c in enumerate([0x4D9DE0, 0x35D7FF, 0x27813F, 0xFF7A00, 0xFF4D67]):
            h = height if i == active else max(1, math.floor(height * 0.4))
            left, right = i * usable // 5, (i + 1) * usable // 5
            rect(x + left + i * 3, y + (height - h) // 2, right - left, h, c if i == active else shade(c, 24))
    elif source == 'solarTimeline':
        sunrise, sunset, now = value
        rect(x, y + height // 2, width, 1, shade(colour, 24))
        if sunrise is not None and sunset is not None:
            a, b = width * sunrise // 86400, width * sunset // 86400
            if b >= a:
                rect(x + a, y + height // 2 - 1, b - a, 3, colour)
            else:
                rect(x, y + height // 2 - 1, b, 3, colour)
                rect(x + a, y + height // 2 - 1, width - a, 3, colour)
        rect(x + min(width - 1, max(0, width * now // 86400)), y, 1, height, colour)
    elif source == 'secondsRing':
        for i, group in enumerate(ring_geometry(width, ring_radius, ring_inner_radius)):
            brightness = 100 if i == value else 68 if i < value else 24
            for packed in group:
                tx, ty, tw, th = unpack_ring_rect(packed)
                rect(x + tx, y + ty, tw, th, shade(colour, brightness))
    return ops
