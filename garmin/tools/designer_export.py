"""Export the canonical designer scene into an isolated Monkey C project.

The browser and watch consume the same canonical atlas coverage and glyph metrics.
No font measurement, responsive scaling or independent watch-layout rules are
introduced by the exported renderer.
"""

import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from designer_model import CATALOG, scene_font_pack, validate_scene
from designer_charts import chart_ops, ring_font, ring_signature, device_colour
from designer_fonts import write_fonts, graphics_cost, FONT_GRAPHICS_BUDGET


TYPE_SOURCES = {
    "heartRate": 18, "temperature": 38, "highLow": 39,
    "floors": 4, "steps": 2, "weeklyRun": 19, "sunriseSunset": 13,
    "temperatureHigh": 39, "temperatureLow": 39,
    "stepsWeek": 2, "floorsWeek": 4, "runWeek": 19,
    "heartZones": 18, "temperatureZones": 38, "solarTimeline": 13,
}


def _renderer_fingerprint(scene):
    """Invalidate Garmin's per-app resource cache when rendering inputs change."""
    pack = scene_font_pack(scene)
    used_fonts = sorted({element["font"] for element in scene["elements"]
                         if _catalogue()[element["source"]]["kind"] == "text"})
    digest = hashlib.sha256()
    for filename in ("designer_export.py", "designer_model.py", "designer_charts.py", "designer_typography.py", "designer_seconds.py", "designer_actions.py", "designer_colours.py", "designer_fonts.py"):
        digest.update((Path(__file__).parent / filename).read_bytes())
    for key in used_fonts:
        digest.update(key.encode())
        digest.update(pack["images"][key])
        digest.update(json.dumps(pack["fonts"][key], sort_keys=True, separators=(",", ":")).encode())
    return digest.hexdigest()


def scene_application_id(scene, proof=False, preview_night=None):
    payload = json.dumps(
        {"namespace": "epix-canvas-scene-v2", "scene": scene,
         "proof": proof, "previewNight": preview_night,
         "renderer": _renderer_fingerprint(scene)},
        sort_keys=True, separators=(",", ":"), ensure_ascii=True,
    ).encode()
    return hashlib.md5(payload, usedforsecurity=False).hexdigest()


def _mc(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(_mc(item) for item in value) + "]"
    raise TypeError(f"Unsupported generated value: {type(value).__name__}")


def _catalogue():
    return {item["id"]: item for item in CATALOG}


def _font_code(pack, used_fonts, needed_codes):
    blocks = []
    for index, key in enumerate(used_fonts):
        font = pack["fonts"][key]
        glyphs = []
        for code, metrics in sorted(font["glyphs"].items(), key=lambda item: int(item[0])):
            if int(code) not in needed_codes[key]:
                continue
            row = [metrics[field] for field in ("x", "y", "width", "height", "yoffset", "xadvance", "xoffset")]
            glyphs.append(f"{int(code)} => {_mc(row)}")
        blocks.append(
            f"        _fonts.add({{{', '.join(glyphs)}}});\n"
            f"        _fontInkBounds.add({_mc(font.get('inkBounds', False))});"
        )
    return "\n".join(blocks)


def _element_codes(element, catalogue, proof):
    source = element["source"]
    if source == "divider":
        text = element.get("dividerSymbol", ":")
    elif source == "label":
        text = element.get("text", "")
    elif proof:
        text = str(catalogue[source].get("sample", "--"))
    elif source in {"hours", "minutes", "seconds", "day", "year"}:
        text = "0123456789"
    elif source in {"time", "timeSeconds"}:
        text = "0123456789:"
    elif source == "numericDate":
        text = "0123456789/"
    elif source in {"date", "weekday", "month", "alarms"}:
        text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 "
    elif source == "battery":
        text = "0123456789%--"
    else:
        text = "0123456789-./:"
    codes = {ord(character) for character in text} | {63}
    if source == "timeSeconds" and element.get("secondsSize", "full") == "half":
        from designer_seconds import HALF_CODE_OFFSET
        codes.update(ord(char) + HALF_CODE_OFFSET for char in "0123456789:")
    return codes


RESOURCE_BUDGET = 32 * 1024


def _resource_cost(scene, pack, catalogue, needed_codes, pair_codes, proof):
    """Conservative application-heap allowance above the provider baseline.

    Native fonts are shared across colours and preloaded once. Count font metadata,
    references and cached positions here; coverage storage has a separate graphics
    pool guard. Estimates are rejection guards, not measured allocation peaks.
    pair_codes remains accepted for callers of the historical audit interface.
    """
    del pair_codes
    metadata = sum(192 * sum(str(code) in pack["fonts"][font]["glyphs"] for code in codes)
                   for font, codes in needed_codes.items())
    references = 96 * len(needed_codes)
    cache_cost = 0
    for element in scene["elements"]:
        source = element["source"]
        if catalogue[source]["kind"] != "text":
            continue
        font = pack["fonts"][element["font"]]
        advances = [glyph["xadvance"] for code, glyph in font["glyphs"].items()
                    if int(code) in needed_codes[element["font"]] and glyph["xadvance"] > 0]
        maximum = len(element.get("text", "")) if source == "label" else 24
        if proof and source != "label":
            maximum = len(str(catalogue[source]["sample"]))
        visible = min(maximum, element["width"] // min(advances, default=1) + 2)
        cache_cost += 64 * visible + 48
        if element.get("boxSizing") == "hug":
            cache_cost += 512  # Dynamic bounds and the resolved clipping-box row.
    rectangles = 0
    if proof:
        for element in scene["elements"]:
            if catalogue[element["source"]]["kind"] not in {"text", "ring"}:
                rectangles += 40 * (len(chart_ops(element)) + len(chart_ops(element, night=True)))
    # Native tick coverage lives in the graphics pool, with only compact draw
    # positions in VM memory. Identical geometry shares one resource and table.
    rings = {ring_signature(scene, element) for element in scene["elements"] if element["source"] == "secondsRing"}
    ring_cost = sum(_ring_resource_cost(signature) for signature in rings)
    return metadata + references + cache_cost + rectangles + ring_cost + 80 * len(scene["elements"])


def _ring_positions(font):
    """Sixty stable draw slots; invisible ticks do not allocate native glyphs."""
    return [[glyph["xoffset"], glyph["yoffset"], 0xE100 + index]
            if glyph is not None and glyph["width"] > 0 and glyph["height"] > 0 else []
            for index in range(60)
            for glyph in [font["glyphs"].get(str(0xE100 + index))]]


def _ring_resource_cost(signature):
    positions = _ring_positions(ring_font(*signature)[0])
    visible = sum(bool(position) for position in positions)
    return 64 + 48 * 60 + 48 * visible + (96 if visible else 0)



def _provider_patch(project, types, widget_types):
    path = project / "source/EpixCanvasComplications.mc"
    code = path.read_text()
    marker = "    private function loadSelections() {"
    if marker not in code:
        raise ValueError("The complication provider's designer hook needs updating.")
    extension = f"""    // Generated designer bindings retain the original firmware fallbacks.
    function designerConfigure() {{
        _slotTypes = {_mc(types)};
        _slotValues = {_mc(['--'] * len(types))};
        _widgetTypes = {_mc(widget_types)};
        _widgetValues = {_mc(['--'] * len(widget_types))};
        _nightWidgetTypes = [];
        refreshValues();
    }}

    function designerRefresh() {{ refreshValues(); }}
    function designerSnapshot() {{ return getSnapshot(); }}
    function designerValue(type) {{
        for (var i = 0; i < _slotTypes.size(); i += 1) {{
            if (_slotTypes[i] == type) {{ return _slotValues[i]; }}
        }}
        return "--";
    }}
    function designerAlarm() {{ return formatAlarmCount(); }}

"""
    path.write_text(code.replace(marker, extension + marker, 1))


def prepare_scene_project(project, scene, proof=False, preview_night=None):
    """Add only generated files to a temporary copy prepared by the local server."""
    scene = validate_scene(scene)
    if preview_night is not None and type(preview_night) is not bool:
        raise ValueError("Preview mode must be a boolean.")
    project = Path(project)
    if project.resolve() == Path(__file__).resolve().parent.parent:
        raise ValueError("Scene exports must be prepared in an isolated project copy.")
    canonical_pack = scene_font_pack(scene)
    pack = {"fonts": dict(canonical_pack["fonts"]), "images": dict(canonical_pack["images"])}
    catalogue = _catalogue()
    used_fonts = sorted({element["font"] for element in scene["elements"]
                         if catalogue[element["source"]]["kind"] == "text"})
    font_indices = {key: index for index, key in enumerate(used_fonts)}
    needed_codes = {key: set() for key in used_fonts}
    for element in scene["elements"]:
        if catalogue[element["source"]]["kind"] != "text":
            continue
        codes = _element_codes(element, catalogue, proof)
        needed_codes[element["font"]].update(codes)
    estimated_cost = _resource_cost(scene, pack, catalogue, needed_codes, {}, proof)
    if estimated_cost > RESOURCE_BUDGET:
        raise ValueError("This design exceeds the watch's conservative resource budget. "
                         "Use fewer font styles, shorter labels or fewer elements before exporting.")
    ring_indices = {signature: index for index, signature in enumerate(sorted({ring_signature(scene, element)
        for element in scene["elements"] if element["source"] == "secondsRing"}))}
    resource_fonts = list(used_fonts)
    resource_codes = {key: set(codes) for key, codes in needed_codes.items()}
    ring_fonts, rings = {}, {}
    for signature, identity in ring_indices.items():
        font, image = ring_font(*signature)
        positions = _ring_positions(font)
        rings[identity] = positions
        visible_codes = {position[2] for position in positions if position}
        if visible_codes:
            key = f"ring:{identity}"
            ring_fonts[identity] = len(resource_fonts)
            resource_fonts.append(key)
            resource_codes[key] = visible_codes
            pack["fonts"][key], pack["images"][key] = font, image
    if graphics_cost(pack, resource_codes) > FONT_GRAPHICS_BUDGET:
        raise ValueError("This design exceeds the conservative font graphics budget. Use fewer or smaller font styles before exporting.")
    rows = []
    for element in scene["elements"]:
        source = element["source"]
        kind = catalogue[source]["kind"]
        day_rectangles = []
        night_rectangles = []
        if proof and kind not in {"text", "ring"}:
            for night, destination in ((False, day_rectangles), (True, night_rectangles)):
                destination.extend([[operation[key] for key in ("x", "y", "width", "height", "colour")]
                                    for operation in chart_ops(element, night=night)])
        rows.append([
            source, (ring_fonts.get(ring_indices[ring_signature(scene, element)], 0) if source == "secondsRing"
                     else font_indices.get(element["font"], 0)), element["x"], element["y"],
            element["width"], {"left": 0, "centre": 1, "right": 2}[element["align"]],
            device_colour(element["colour"]) if kind == "text" else element["colour"],
            device_colour(element["nightColour"]) if kind == "text" else element["nightColour"],
            {"both": 0, "day": 1, "night": 2}[element["visible"]],
            (element.get("dividerSymbol", ":") if source == "divider" else element.get("text", "")), kind, element["height"], day_rectangles, night_rectangles,
            -1, -1,  # Reserved legacy colour-resource slots; fonts now use runtime colour.
            {"top": 0, "middle": 1, "bottom": 2}[element.get("dividerPosition", "middle")],
            ring_indices.get(ring_signature(scene, element), -1) if source == "secondsRing" else -1,
            source == "timeSeconds" and element.get("secondsSize", "full") == "half",
            element.get("boxSizing") == "hug", 0, 0,
        ])
    required_types = sorted({TYPE_SOURCES[e["source"]] for e in scene["elements"] if e["source"] in TYPE_SOURCES})
    widget_types = sorted({TYPE_SOURCES[e["source"]] for e in scene["elements"]
                           if e["source"] in {"stepsWeek", "floorsWeek", "runWeek"}})
    _provider_patch(project, required_types, widget_types)
    # Unreferenced legacy classes still consume Connect IQ VM memory. Keep only
    # the runtime modules required by this generated scene, in the temporary copy.
    retained = {"EpixCanvasApp.mc", "EpixCanvasData.mc", "EpixCanvasComplications.mc", "DesignerView.mc"}
    for source_file in (project / "source").glob("*.mc"):
        if source_file.name not in retained:
            source_file.unlink()
    # The generated renderer uses its own native fonts. Do not import unrelated
    # native fonts/icons/settings into the exported application's resource table.
    for descriptor in project.glob("resources-epix2pro*/fonts/fonts.xml"):
        descriptor.unlink()
    settings = project / "resources/settings/settings.xml"
    if settings.exists():
        settings.unlink()
    legacy_drawables = project / "resources/drawables/drawables.xml"
    if legacy_drawables.exists():
        launcher = ET.Element("drawables")
        ET.SubElement(launcher, "bitmap", {"id": "LauncherIcon", "filename": "launcher_icon.png"})
        ET.ElementTree(launcher).write(legacy_drawables, encoding="utf-8", xml_declaration=True)
    legacy_strings = project / "resources/strings/strings.xml"
    if legacy_strings.exists():
        strings = ET.Element("strings")
        ET.SubElement(strings, "string", {"id": "AppName"}).text = "Epix Canvas"
        ET.ElementTree(strings).write(legacy_strings, encoding="utf-8", xml_declaration=True)
    font_resources = write_fonts(project, pack, resource_fonts, resource_codes)
    manifest_path = project / "manifest.xml"
    manifest = ET.parse(manifest_path)
    application = manifest.find("{http://www.garmin.com/xml/connectiq}application")
    application.set("id", scene_application_id(scene, proof, preview_night))
    application.set("name", "@Strings.DesignerAppName")
    strings = ET.Element("strings")
    ET.SubElement(strings, "string", {"id": "DesignerAppName"}).text = scene["name"]
    ET.ElementTree(strings).write(project / "resources/designer_strings.xml", encoding="utf-8", xml_declaration=True)
    manifest.write(manifest_path, encoding="utf-8", xml_declaration=True)
    (project / "source/EpixCanvasApp.mc").write_text(APP_SOURCE)
    text_sources = {element["source"] for element in scene["elements"] if catalogue[element["source"]]["kind"] == "text"}
    proof_values = {item["id"]: item.get("sample", "--") for item in CATALOG if item["id"] in text_sources}
    proof_dictionary = ", ".join(f"{_mc(key)} => {_mc(value)}" for key, value in proof_values.items()
                                 if not isinstance(value, dict))
    ring_table = "{" + ", ".join(f"{width} => {_mc(positions)}" for width, positions in rings.items()) + "}"
    source = VIEW_SOURCE
    replacements = {
        "@ELEMENTS@": _mc(rows), "@FONTS@": _font_code(pack, used_fonts, needed_codes),
        "@BACKGROUND@": str(scene["background"]), "@PROOF@": _mc(proof),
        "@FORCED_NIGHT@": _mc(preview_night), "@SAMPLES@": "{" + proof_dictionary + "}",
        "@RING_TABLE@": ring_table,
        "@FONT_RESOURCES@": "[" + ", ".join(font_resources) + "]",
    }
    for marker, replacement in replacements.items():
        source = source.replace(marker, replacement)
    (project / "source/DesignerView.mc").write_text(source)
    return scene


APP_SOURCE = """using Toybox.Application;
using Toybox.WatchUi;

class EpixCanvasApp extends Application.AppBase {
    function initialize() { AppBase.initialize(); }
    function getInitialView() { return [new DesignerView()]; }
}
"""


VIEW_SOURCE = r'''using Toybox.Graphics;
using Toybox.WatchUi;
using Toybox.System;
using Toybox.Time;
using Toybox.Time.Gregorian;
using Toybox.Math;
import Toybox.Lang;

// Generated from the canonical scene. All positions are native integer pixels.
class DesignerView extends WatchUi.WatchFace {
    private var _elements as Array<Array> = @ELEMENTS@;
    private var _fonts as Array<Dictionary> = [];
    private var _fontInkBounds as Array<Boolean> = [];
    private var _nativeFonts as Array<WatchUi.FontResource> = [];
    private var _fontResources as Array<ResourceId> = @FONT_RESOURCES@;
    private var _lowPower = false;
    private var _forcedNight = @FORCED_NIGHT@;
    private var _proof = @PROOF@;
    private var _samples as Dictionary = @SAMPLES@;
    private var _provider as EpixCanvasComplicationProvider;
    private var _clockProvider as EpixCanvasDataProvider;
    private var _values as EpixCanvasData;
    private var _snapshot as EpixCanvasComplicationSnapshot;
    private var _ringPositions as Dictionary<Number, Array<Array<Number>>> = @RING_TABLE@;
    private var _glyphCache as Dictionary<Number, Array> = {};
    private var _dataMinute = null;

    function initialize() {
        WatchFace.initialize();
@FONTS@
        for (var i = 0; i < _fontResources.size(); i += 1) {
            _nativeFonts.add(WatchUi.loadResource(_fontResources[i]) as WatchUi.FontResource);
        }
        _provider = new EpixCanvasComplicationProvider();
        _provider.designerConfigure();
        _clockProvider = new EpixCanvasDataProvider();
        _values = _clockProvider.getSnapshot();
        _snapshot = _provider.designerSnapshot();
    }

    function onShow() { _provider.start(); }
    function onHide() { _provider.stop(); }
    function onEnterSleep() { _lowPower = true; WatchUi.requestUpdate(); }
    function onExitSleep() { _lowPower = false; WatchUi.requestUpdate(); }

    function onUpdate(dc) {
        var night = _forcedNight == null ? _lowPower : _forcedNight;
        var background = night ? 0 : @BACKGROUND@;
        dc.setColor(background, background);
        dc.clear();
        var clock = System.getClockTime();
        var minuteKey = clock.hour * 60 + clock.min;
        if (_dataMinute == null || _dataMinute != minuteKey) {
            _provider.designerRefresh();
            _dataMinute = minuteKey;
        }
        _snapshot = _provider.designerSnapshot();
        _values = _clockProvider.getSnapshot();
        for (var i = 0; i < _elements.size(); i += 1) {
            var element = _elements[i];
            if ((element[8] == 1 && night) || (element[8] == 2 && !night)) { continue; }
            var colour = night ? element[7] : element[6];
            if (element[10].equals("text")) {
                drawTextElement(dc, element, textFor(element[0], element[9]), i, night);
            } else {
                drawChart(dc, element, colour, night);
            }
        }
    }

    private function glyphFor(font as Dictionary, code as Number) as Array<Number> or Null {
        if (font.hasKey(code)) { return font[code] as Array<Number>; }
        if (font.hasKey(63)) { return font[63] as Array<Number>; }
        return null;
    }

    private function drawTextElement(dc as Graphics.Dc, element as Array, text as String, index as Number, night as Boolean) {
        var operations = [] as Array<Array<Number>>;
        var cached = _glyphCache.hasKey(index) ? _glyphCache[index] : null;
        if (cached != null && cached[0].equals(text)) {
            operations = cached[1] as Array<Array<Number>>;
            if (element[19]) { element = cached[2] as Array; }
        } else {
            if (element[19]) { element = hugElement(element, text); }
            operations = layoutText(element, text);
            _glyphCache[index] = element[19] ? [text, operations, element] : [text, operations];
        }
        var nativeFont = _nativeFonts[element[1]];
        dc.setColor(night ? element[7] : element[6], Graphics.COLOR_TRANSPARENT);
        dc.setClip(element[2], element[3], element[4], element[11]);
        for (var i = 0; i < operations.size(); i += 1) {
            var operation = operations[i];
            dc.drawText(operation[0], operation[1], nativeFont,
                        operation[2].toChar().toString(), Graphics.TEXT_JUSTIFY_LEFT);
        }
        dc.clearClip();
    }

    private function hugElement(element as Array, text as String) as Array {
        var font = _fonts[element[1]];
        var characters = text.toCharArray();
        var advance = 0;
        var inkLeft = 0;
        var inkRight = 0;
        var inkTop = 0;
        var inkBottom = 0;
        var hasInk = false;
        for (var i = 0; i < characters.size(); i += 1) {
            var code = characters[i].toNumber();
            if (element[18] && i >= 5) { code += 57344; }
            var glyph = glyphFor(font, code);
            if (glyph == null) { continue; }
            if (glyph[2] > 0 && glyph[3] > 0) {
                var left = advance + glyph[6];
                var right = left + glyph[2];
                var top = glyph[4];
                var bottom = top + glyph[3];
                if (!hasInk || left < inkLeft) { inkLeft = left; }
                if (!hasInk || right > inkRight) { inkRight = right; }
                if (!hasInk || top < inkTop) { inkTop = top; }
                if (!hasInk || bottom > inkBottom) { inkBottom = bottom; }
                hasInk = true;
            }
            advance += glyph[5];
        }
        var width = hasInk ? inkRight - inkLeft : 1;
        var height = hasInk ? inkBottom - inkTop : 1;
        var resolved = element.slice(0, element.size());
        resolved[2] = element[2] + Math.floor(element[4] / 2.0).toNumber() - Math.floor(width / 2.0).toNumber();
        resolved[3] = element[3] + Math.floor(element[11] / 2.0).toNumber() - Math.floor(height / 2.0).toNumber();
        resolved[4] = width;
        resolved[11] = height;
        resolved[20] = inkLeft;
        resolved[21] = inkTop;
        return resolved;
    }

    private function layoutText(element as Array, text as String) as Array<Array<Number>> {
        var operations = [] as Array<Array<Number>>;
        var font = _fonts[element[1]];
        var characters = text.toCharArray();
        var total = 0;
        var advance = 0;
        for (var i = 0; i < characters.size(); i += 1) {
            var measuredCode = characters[i].toNumber();
            if (element[18] && i >= 5) { measuredCode += 57344; }
            var glyph = glyphFor(font, measuredCode);
            if (glyph != null) {
                if (_fontInkBounds[element[1]]) {
                    var rightEdge = advance + glyph[2];
                    if (rightEdge > total) { total = rightEdge; }
                } else {
                    total += glyph[5];
                }
                advance += glyph[5];
            }
        }
        if (!_fontInkBounds[element[1]] && advance > 0) { total -= 1; }
        var pen = element[2];
        if (element[19]) {
            pen -= element[20];
        } else {
            if (element[5] == 1) { pen += Math.floor((element[4] - total) / 2.0).toNumber(); }
            if (element[5] == 2) { pen += element[4] - total; }
        }
        var left = element[2];
        var right = left + element[4];
        var top = element[3];
        var bottom = top + element[11];
        for (var i = 0; i < characters.size(); i += 1) {
            var code = characters[i].toNumber();
            if (element[18] && i >= 5) { code += 57344; }
            if (!font.hasKey(code)) { code = 63; }
            var glyph = glyphFor(font, code);
            if (glyph == null) { continue; }
            var dx = pen + glyph[6];
            var glyphY = top + glyph[4] - (element[19] ? element[21] : 0);
            if (element[0].equals("divider") && !element[19]) {
                var spare = element[11] - glyph[3];
                glyphY = top;
                if (element[16] == 1) { glyphY += Math.floor(spare / 2.0).toNumber(); }
                if (element[16] == 2) { glyphY += spare; }
            }
            var dy = glyphY;
            var sx = glyph[0];
            var sy = glyph[1];
            var width = glyph[2];
            var height = glyph[3];
            if (dx < left) { sx += left - dx; width -= left - dx; dx = left; }
            if (dy < top) { sy += top - dy; height -= top - dy; dy = top; }
            if (dx + width > right) { width = right - dx; }
            if (dy + height > bottom) { height = bottom - dy; }
            if (width > 0 && height > 0) {
                operations.add([pen + glyph[6], glyphY, code]);
            }
            pen += glyph[5];
        }
        return operations;
    }

    private function dateFor(source as String) as String {
        var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        var weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        var weekday = weekdays[info.day_of_week - 1];
        var month = months[info.month - 1];
        switch (source) {
            case "numericDate": return info.day.format("%02d") + "/" + info.month.format("%02d") + "/" + (info.year % 100).format("%02d");
            case "weekday": return weekday;
            case "day": return info.day.format("%d");
            case "month": return month;
            case "year": return info.year.format("%d");
        }
        return weekday + " " + info.day.format("%d") + " " + month + " " + info.year.format("%d");
    }

    private function textFor(source as String, literal as String) as String {
        if (source.equals("label") || source.equals("divider")) { return literal; }
        if (_proof && _samples.hasKey(source)) { return _samples[source].toString(); }
        switch (source) {
            case "time": return _values.timeText;
            case "timeSeconds": return _values.timeText + ":" + _values.seconds.format("%02d");
            case "hours": return _values.hourText;
            case "minutes": return _values.minuteText;
            case "seconds": return _values.seconds.format("%02d");
            case "date":
            case "numericDate":
            case "weekday":
            case "year":
            case "day":
            case "month": return dateFor(source);
            case "battery":
                try { return System.getSystemStats().battery.format("%.0f") + "%"; } catch (exception) { return "--"; }
            case "alarms": return _provider.designerAlarm();
            case "temperatureHigh":
                return _snapshot.temperatureHigh == null ? "--" : _snapshot.temperatureHigh.format("%.0f");
            case "temperatureLow":
                return _snapshot.temperatureLow == null ? "--" : _snapshot.temperatureLow.format("%.0f");
            case "heartRate": return _provider.designerValue(18);
            case "temperature": return _provider.designerValue(38);
            case "highLow": return _provider.designerValue(39);
            case "floors": return _provider.designerValue(4);
            case "steps": return _provider.designerValue(2);
            case "weeklyRun": return _provider.designerValue(19);
            case "sunriseSunset": return _provider.designerValue(13);
        }
        return "--";
    }

    private function chartValues(source as String) as Array {
        if (_proof && _samples.hasKey(source)) { return _samples[source] as Array; }
        switch (source) {
            case "stepsWeek": return _snapshot.weeklyStepCounts;
            case "floorsWeek": return _snapshot.weeklyFloorCounts;
            case "runWeek": return _snapshot.weeklyRunDistances;
        }
        return [null, null, null, null, null, null, null];
    }

    private function shade(colour, percent) {
        var red = ((((colour >> 16) & 255) * percent) / 100).toNumber();
        var green = ((((colour >> 8) & 255) * percent) / 100).toNumber();
        var blue = (((colour & 255) * percent) / 100).toNumber();
        return (red << 16) | (green << 8) | blue;
    }

    private function drawChart(dc as Graphics.Dc, element as Array, colour as Number, night as Boolean) {
        if (_proof && !element[10].equals("ring")) {
            var rectangles = (night ? element[13] : element[12]) as Array<Array<Number>>;
            for (var i = 0; i < rectangles.size(); i += 1) {
                var rectangle = rectangles[i];
                dc.setColor(rectangle[4], Graphics.COLOR_TRANSPARENT);
                dc.fillRectangle(rectangle[0], rectangle[1], rectangle[2], rectangle[3]);
            }
            return;
        }
        var source = element[0];
        var x = element[2];
        var y = element[3];
        var width = element[4];
        var boxHeight = element[11];
        if (element[10].equals("bars")) {
            var values = chartValues(source);
            var maximum = 1;
            for (var i = 0; i < 7; i += 1) {
                if (values[i] != null && values[i] > maximum) { maximum = values[i]; }
            }
            for (var i = 0; i < 7; i += 1) {
                var start = Math.floor(i * (width - 18) / 7.0).toNumber();
                var end = Math.floor((i + 1) * (width - 18) / 7.0).toNumber();
                var height = 1;
                if (values[i] != null && values[i] > 0) {
                    height = Math.floor(boxHeight * values[i] / maximum.toFloat()).toNumber();
                    if (height < 1) { height = 1; }
                }
                dc.setColor(values[i] == null ? shade(colour, 24) : colour, Graphics.COLOR_TRANSPARENT);
                dc.fillRectangle(x + start + 3 * i, y + boxHeight - height, end - start, height);
            }
        } else if (element[10].equals("zones")) {
            var value = null;
            var thresholds = [0, 110, 130, 150, 170, 999];
            if (source.equals("heartZones")) {
                value = _snapshot.heartRate;
                if (_snapshot.heartRateZones != null && _snapshot.heartRateZones.size() >= 6) {
                    thresholds = _snapshot.heartRateZones;
                }
            } else {
                value = _snapshot.currentTemperature;
                if (value != null && System.getDeviceSettings().temperatureUnits == System.UNIT_STATUTE) {
                    value = (value - 32) * 5.0 / 9.0;
                }
                thresholds = [-999, 0, 10, 20, 30, 999];
            }
            var active = 0;
            if (value != null) { while (active < 4 && value > thresholds[active + 1]) { active += 1; } }
            var colours = [0x4D9DE0, 0x35D7FF, 0x27813F, 0xFF7A00, 0xFF4D67];
            for (var i = 0; i < 5; i += 1) {
                var start = Math.floor(i * (width - 12) / 5.0).toNumber();
                var end = Math.floor((i + 1) * (width - 12) / 5.0).toNumber();
                var current = value != null && i == active;
                dc.setColor(current ? colours[i] : shade(colours[i], 24), Graphics.COLOR_TRANSPARENT);
                var height = current ? boxHeight : Math.floor(boxHeight * 0.4).toNumber();
                if (height < 1) { height = 1; }
                dc.fillRectangle(x + start + 3 * i, y + Math.floor((boxHeight - height) / 2.0).toNumber(), end - start, height);
            }
        } else if (element[10].equals("solar")) {
            var sunrise = _snapshot.sunriseSeconds;
            var sunset = _snapshot.sunsetSeconds;
            var clock = System.getClockTime();
            var now = clock.hour * 3600 + clock.min * 60 + clock.sec;
            dc.setColor(shade(colour, 24), Graphics.COLOR_TRANSPARENT);
            var middle = Math.floor(boxHeight / 2.0).toNumber();
            dc.fillRectangle(x, y + middle, width, 1);
            if (sunrise != null && sunset != null) {
                var start = Math.floor(width * sunrise / 86400.0).toNumber();
                var end = Math.floor(width * sunset / 86400.0).toNumber();
                dc.setColor(colour, Graphics.COLOR_TRANSPARENT);
                if (end >= start) {
                    dc.fillRectangle(x + start, y + middle - 1, end - start, 3);
                } else {
                    dc.fillRectangle(x, y + middle - 1, end, 3);
                    dc.fillRectangle(x + start, y + middle - 1, width - start, 3);
                }
            }
            var marker = Math.floor(width * now / 86400.0).toNumber();
            if (marker > width - 1) { marker = width - 1; }
            if (marker < 0) { marker = 0; }
            dc.setColor(colour, Graphics.COLOR_TRANSPARENT);
            dc.fillRectangle(x + marker, y, 1, boxHeight);
        } else if (element[10].equals("ring")) {
            drawRing(dc, element, colour);
        }
    }

    private function drawRing(dc as Graphics.Dc, element as Array, colour as Number) {
        var seconds = _proof ? 23 : _values.seconds;
        var ticks = ringTicks(element[17]);
        for (var i = 0; i < ticks.size(); i += 1) {
            var brightness = i < seconds ? 68 : (i == seconds ? 100 : 24);
            var position = ticks[i];
            if (position.size() == 0) { continue; }
            dc.setColor(shade(colour, brightness), Graphics.COLOR_TRANSPARENT);
            dc.drawText(element[2] + position[0], element[3] + position[1],
                _nativeFonts[element[1]], position[2].toChar().toString(), Graphics.TEXT_JUSTIFY_LEFT);
        }
    }

    private function ringTicks(identity as Number) as Array<Array<Number>> {
        if (_ringPositions.hasKey(identity)) { return _ringPositions[identity] as Array<Array<Number>>; }
        return [];
    }
}
'''
