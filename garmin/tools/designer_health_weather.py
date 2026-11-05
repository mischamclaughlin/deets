"""Generated provider-only bindings for health metrics and cached Garmin weather.

Weather readings are cached per minute and unit system, including unavailable
results. Drawing classes consume strings and never query Garmin APIs directly.
"""

HEALTH_FORMAT_CASES = '''            case Complications.COMPLICATION_TYPE_BODY_BATTERY:
                return designerBoundedValue(value, 100) ? value.toNumber().format("%d") + "%" : UNAVAILABLE;
            case Complications.COMPLICATION_TYPE_STRESS:
                return designerBoundedValue(value, 100) ? value.toNumber().format("%d") : UNAVAILABLE;
            case Complications.COMPLICATION_TYPE_RECOVERY_TIME:
                return designerRecovery(value);
'''

PROVIDER_EXTENSION = '''    private var _designerWeatherMinute = -1;
    private var _designerWeatherStatute = false;
    private var _designerRainChance = "--";
    private var _designerWind = "--";

    private function designerBoundedValue(value, maximum) {
        return (value instanceof Number || value instanceof Float || value instanceof Double) &&
            value == value && value >= 0 && value <= maximum;
    }

    private function designerRecovery(value) {
        if (!designerBoundedValue(value, 1000000)) { return UNAVAILABLE; }
        var minutes = value.toNumber();
        if (minutes < 60) { return minutes.format("%d") + "M"; }
        var hours = (minutes / 60).toNumber();
        var remainder = minutes % 60;
        return hours.format("%d") + "H " + remainder.format("%02d") + "M";
    }

    function designerWeatherValue(source) {
        try {
            var minute = (Time.now().value() / 60).toNumber();
            var statute = System.getDeviceSettings().distanceUnits == System.UNIT_STATUTE;
            if (minute != _designerWeatherMinute || statute != _designerWeatherStatute) {
                _designerWeatherMinute = minute;
                _designerWeatherStatute = statute;
                _designerRainChance = UNAVAILABLE;
                _designerWind = UNAVAILABLE;
                var conditions = Weather.getCurrentConditions();
                if (conditions != null) {
                    if (conditions has :precipitationChance && designerBoundedValue(conditions.precipitationChance, 100)) {
                        _designerRainChance = conditions.precipitationChance.toNumber().format("%d") + "%";
                    }
                    if (conditions has :windSpeed && designerBoundedValue(conditions.windSpeed, 200)) {
                        var speed = conditions.windSpeed * (statute ? 2.2369362921 : 3.6);
                        _designerWind = speed.format("%.0f") + (statute ? " MPH" : " KM/H");
                        if (conditions has :windBearing && designerBoundedValue(conditions.windBearing, 360)) {
                            var directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
                            var index = ((conditions.windBearing + 11.25) / 22.5).toNumber() % 16;
                            _designerWind += " " + directions[index];
                        }
                    }
                }
            }
            return source.equals("rainChance") ? _designerRainChance : _designerWind;
        } catch (exception) {
            return UNAVAILABLE;
        }
    }

'''
