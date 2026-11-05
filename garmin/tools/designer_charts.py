"""Integer rectangle primitives shared by the builder and its Garmin generator."""
import math
import functools

SAMPLES = {
    'stepsWeek': [4000, 8200, 6000, 10000, 7500, 3000, 5000],
    'floorsWeek': [4, 8, 6, 10, 7, 3, 5],
    'runWeek': [0, 5.2, 0, 8.1, 3.5, 8.0, 0],
    'walkWeek': [2, 4, 3, 0, 5, 1, 3.6],
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
    """Use the ring boundary unless the user selects the clearance guide."""
    width = element["width"]
    if not element.get("ringTicksToCircumference", False):
        return width / 2
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
    outer = centre if outer_radius is None else outer_radius
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



def ring_asset_key(width, outer_radius=None, inner_radius=-1):
    return f"ring:{width}:{outer_radius}:{inner_radius}"


def _clip_polygon(points, axis, boundary, keep_greater):
    """Clip a convex tick polygon to one pixel edge."""
    result = []
    for start, end in zip(points, points[1:] + points[:1]):
        a, b = start[axis] - boundary, end[axis] - boundary
        inside_a, inside_b = (a >= 0, b >= 0) if keep_greater else (a <= 0, b <= 0)
        if inside_a != inside_b:
            fraction = a / (a - b)
            result.append(tuple(start[i] + fraction * (end[i] - start[i]) for i in (0, 1)))
        if inside_b:
            result.append(end)
    return result


def _pixel_coverage(polygon, x, y):
    clipped = polygon
    for axis, boundary, greater in ((0, x, True), (0, x+1, False), (1, y, True), (1, y+1, False)):
        clipped = _clip_polygon(clipped, axis, boundary, greater)
        if len(clipped) < 3:
            return 0
    # Translate before the shoelace sum to avoid cancellation near large coordinates.
    clipped = [(px-x, py-y) for px, py in clipped]
    area = abs(sum(a[0]*b[1] - b[0]*a[1] for a, b in zip(clipped, clipped[1:] + clipped[:1]))) / 2
    return min(255, max(0, math.floor(area * 15 + .5) * 17))


@functools.lru_cache(maxsize=64)
def ring_font(width, outer_radius=None, inner_radius=-1):
    """Analytic pixel coverage shared by preview and native tick font resources."""
    from designer_model import _png_rgba
    scale, centre = min(1, width / 40), width / 2
    outer = centre if outer_radius is None else outer_radius
    cells = []
    for second in range(60):
        angle = second * math.pi / 30
        rx, ry = math.sin(angle), -math.cos(angle)
        length = (15 if second % 15 == 0 else 11 if second % 5 == 0 else 7) * scale
        half = (6 if second % 15 == 0 else 4 if second % 5 == 0 else 2) * scale / 2
        inner = max(0, outer-length) if inner_radius < 0 else max(0, min(outer, inner_radius))
        polygon = [(centre + rx*r - ry*t, centre + ry*r + rx*t)
                   for r, t in ((inner, -half), (outer, -half), (outer, half), (inner, half))]
        pixels = {}
        if outer > inner:
            for y in range(max(0, math.floor(min(p[1] for p in polygon))), min(width, math.ceil(max(p[1] for p in polygon)))):
                for x in range(max(0, math.floor(min(p[0] for p in polygon))), min(width, math.ceil(max(p[0] for p in polygon)))):
                    alpha = _pixel_coverage(polygon, x, y)
                    if alpha:
                        pixels[x, y] = alpha
        cells.append(pixels)
    # Shelf packing bounds long stretched ticks without allocating a full watch per tick.
    placements, cursor_x, cursor_y, row_height, atlas_width = [], 0, 0, 0, 1
    for pixels in cells:
        left = min((x for x, _ in pixels), default=0)
        top = min((y for _, y in pixels), default=0)
        w = max((x for x, _ in pixels), default=-1) - left + 1
        h = max((y for _, y in pixels), default=-1) - top + 1
        if cursor_x + w > 4096:
            cursor_x, cursor_y, row_height = 0, cursor_y + row_height + 1, 0
        placements.append((cursor_x, cursor_y, left, top, w, h))
        atlas_width = max(atlas_width, cursor_x + w)
        cursor_x += w + 1
        row_height = max(row_height, h)
    atlas_height = max(1, cursor_y + row_height)
    if atlas_height > 2048:
        raise ValueError("The seconds-ring atlas exceeds the native resource bounds.")
    pixels = bytearray(atlas_width * atlas_height * 4)
    glyphs = {}
    for second, (cell, placement) in enumerate(zip(cells, placements)):
        ax, ay, left, top, w, h = placement
        glyphs[str(0xE100 + second)] = dict(x=ax, y=ay, width=w, height=h,
            xoffset=left, yoffset=top, xadvance=max(1, w+1))
        for (x, y), alpha in cell.items():
            offset = ((ay+y-top) * atlas_width + ax+x-left) * 4
            pixels[offset:offset+4] = bytes((255, 255, 255, alpha))
    return dict(height=max(1, max(glyph["height"] for glyph in glyphs.values())), atlasWidth=atlas_width, atlasHeight=atlas_height,
                glyphs=glyphs, coverageBits=4, label="Seconds ticks"), _png_rgba(atlas_width, atlas_height, pixels)


def chart_ops(element, value=None, night=False, *, ring_radius=None, ring_inner_radius=-1):
    source = element['source']
    from designer_activity import ICON_MASKS, icon_ops
    if source in ICON_MASKS or source == "customIcon":
        return [{**op, 'colour': element['nightColour' if night else 'colour']} for op in icon_ops(element)]
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
        from designer_colours import zone_colours
        for i, c in enumerate(zone_colours(element, night)):
            h = height if i == active else max(1, math.floor(height * 0.4))
            left, right = i * usable // 5, (i + 1) * usable // 5
            rect(x + left + i * 3, y + (height - h) // 2, right - left, h, c if i == active else shade(c, 24))
    elif source == 'solarTimeline':
        sunrise, sunset, now = value
        rect(x, y + height // 2, width, 1, shade(colour, 24))
        if sunrise is None or sunset is None or sunrise == sunset:
            return ops
        daylight = (sunset - sunrise) % 86400
        displayed_sunrise = (86400 - daylight) // 2
        a, b = width * displayed_sunrise // 86400, width * (displayed_sunrise + daylight) // 86400
        daylight_top = max(0, height // 2 - 1)
        daylight_bottom = min(height, height // 2 + 2)
        rect(x + a, y + daylight_top, b - a, daylight_bottom - daylight_top, colour)
        solar_noon = (sunrise + daylight // 2) % 86400
        now = (now + 43200 - solar_noon) % 86400
        rect(x + min(width - 1, max(0, width * now // 86400)), y, 1, height, colour)
    elif source == 'secondsRing':
        font, _ = ring_font(width, ring_radius, ring_inner_radius)
        key = ring_asset_key(width, ring_radius, ring_inner_radius)
        for i in range(60):
            glyph = font["glyphs"][str(0xE100+i)]
            if not glyph["width"] or not glyph["height"]:
                continue
            brightness = 100 if i == value else 68 if i < value else 24
            ops.append(dict(kind="bitmap", font=key, elementId=element.get("id", "secondsRing"),
                x=x+glyph["xoffset"], y=y+glyph["yoffset"], sx=glyph["x"], sy=glyph["y"],
                width=glyph["width"], height=glyph["height"], colour=shade(colour, brightness)))
    return ops
