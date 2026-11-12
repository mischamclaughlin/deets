"""Shared catalogue and pure generated formatting for additional Garmin readings."""
import json
from pathlib import Path

METRICS_PATH = Path(__file__).resolve().parents[2] / 'shared/data-metrics.json'
METRICS = json.loads(METRICS_PATH.read_text())
METRICS_BY_SOURCE = {entry['source']: entry for entry in METRICS}
TYPE_METRICS = {entry['source']: entry['complication'] for entry in METRICS if 'complication' in entry}
WEATHER_METRICS = [entry for entry in METRICS if 'weatherField' in entry]
CATEGORY_LABELS = {'health': 'Health & recovery', 'activity': 'Activity', 'training': 'Training',
                   'outdoors': 'Outdoors', 'weather': 'Weather & sun', 'device': 'Device & text'}
METRIC_CODES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-./:%? '

# This formatter is pure: the provider passes device-unit flags and API values.
# Native unit tests can exercise it without Garmin services or personal readings.
FORMATTER_SOURCE = '''import Toybox.Lang;

function deetsMetricNumber(value, minimum, maximum) {
    return (value instanceof Number || value instanceof Long || value instanceof Float || value instanceof Double) &&
        value == value && value >= minimum && value <= maximum;
}

function deetsMetricText(value) {
    if (!(value instanceof String) || value.length() == 0) { return "--"; }
    var output = "";
    var visible = false;
    var text = value as String;
    var characters = text.toUpper().toCharArray();
    var length = characters.size() < 32 ? characters.size() : 32;
    for (var i = 0; i < length; i += 1) {
        var character = characters[i].toString();
        if (!character.equals(" ")) { visible = true; }
        var code = characters[i].toNumber();
        if ((code >= 65 && code <= 90) || (code >= 48 && code <= 57) ||
                character.equals(" ") || character.equals(":") || character.equals("-") ||
                character.equals("/") || character.equals(".") || character.equals("%")) {
            output += character;
        } else { output += "?"; }
    }
    return visible ? output : "--";
}

function deetsFormatMetric(format, value, distanceStatute, elevationStatute, temperatureStatute) {
    if (format.equals("text")) { return deetsMetricText(value); }
    if (format.equals("altitude")) {
        if (!deetsMetricNumber(value, -1500, 100000)) { return "--"; }
        var altitude = elevationStatute ? value * 3.280839895 : value;
        return altitude.format("%.0f") + (elevationStatute ? " FT" : " M");
    }
    if (format.equals("temperature")) {
        if (!deetsMetricNumber(value, -150, 150)) { return "--"; }
        var temperature = temperatureStatute ? value * 1.8 + 32 : value;
        return temperature.format("%.0f") + (temperatureStatute ? " F" : " C");
    }
    if (!deetsMetricNumber(value, 0, 1000000000)) { return "--"; }
    if (format.equals("percent")) { return value <= 100 ? value.toNumber().format("%d") + "%" : "--"; }
    if (format.equals("decimal")) { return value <= 30 ? value.format("%.1f") : "--"; }
    if (format.equals("distance")) {
        var distance = value / (distanceStatute ? 1609.344 : 1000.0);
        return distance.format("%.1f") + (distanceStatute ? " MI" : " KM");
    }
    if (format.equals("pressure")) { return value > 0 && value <= 200000 ? (value / 100.0).format("%.0f") + " HPA" : "--"; }
    if (format.equals("duration")) {
        if (value > 604800) { return "--"; }
        var seconds = value.toNumber();
        var hours = (seconds / 3600).toNumber();
        var minutes = ((seconds % 3600) / 60).toNumber();
        return hours.format("%d") + ":" + minutes.format("%02d") + ":" + (seconds % 60).format("%02d");
    }
    return value.toNumber().format("%d");
}
'''


def provider_cases():
    return ''.join(f'            case {entry["complication"]}: return designerAdditionalMetric({json.dumps(entry["format"])}, value);\n'
                   for entry in METRICS if 'complication' in entry)


def provider_extension():
    fields = '\n'.join(f'''                    if (conditions has :{entry['weatherField']}) {{
                        _designerAdditionalWeather[{json.dumps(entry['source'])}] = designerAdditionalMetric({json.dumps(entry['format'])}, conditions.{entry['weatherField']});
                    }}''' for entry in WEATHER_METRICS)
    return '''    private var _designerAdditionalWeatherMinute = -1;
    private var _designerAdditionalWeatherTemperature = false;
    private var _designerAdditionalWeather as Dictionary = {};

    function designerAdditionalMetric(format, value) {
        try {
            var settings = System.getDeviceSettings();
            return deetsFormatMetric(format, value, settings.distanceUnits == System.UNIT_STATUTE,
                settings.elevationUnits == System.UNIT_STATUTE, settings.temperatureUnits == System.UNIT_STATUTE);
        } catch (exception) { return UNAVAILABLE; }
    }

    function designerAdditionalWeather(source) {
        try {
            var minute = (Time.now().value() / 60).toNumber();
            var temperature = System.getDeviceSettings().temperatureUnits == System.UNIT_STATUTE;
            if (minute != _designerAdditionalWeatherMinute || temperature != _designerAdditionalWeatherTemperature) {
                _designerAdditionalWeatherMinute = minute;
                _designerAdditionalWeatherTemperature = temperature;
                _designerAdditionalWeather = {};
                var conditions = Weather.getCurrentConditions();
                if (conditions != null) {
''' + fields + '''
                }
            }
            return _designerAdditionalWeather.hasKey(source) ? _designerAdditionalWeather[source] : UNAVAILABLE;
        } catch (exception) { return UNAVAILABLE; }
    }

'''


def text_cases():
    return ''.join(f'            case {json.dumps(entry["source"])}: return _provider.designerValue({entry["complication"]});\n'
                   if 'complication' in entry else
                   f'            case {json.dumps(entry["source"])}: return _provider.designerAdditionalWeather(source);\n'
                   for entry in METRICS)
