"""Integer rectangle primitives shared by the builder and its Garmin generator."""
import math

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


def ring_positions(width):
    return [(round(width / 2 + math.sin(i * math.pi / 30) * (width / 2 - 2)) - 1,
             round(width / 2 - math.cos(i * math.pi / 30) * (width / 2 - 2)) - 1) for i in range(60)]


def chart_ops(element, value=None, night=False):
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
        for i, (tx, ty) in enumerate(ring_positions(width)):
            rect(x + tx, y + ty, 2, 2, colour if i == value else shade(colour, 68 if i < value else 24))
    return ops
