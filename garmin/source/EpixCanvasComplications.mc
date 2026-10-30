using Toybox.Application.Properties;
using Toybox.Activity;
using Toybox.ActivityMonitor;
using Toybox.Complications;
import Toybox.Lang;
using Toybox.System;
using Toybox.Time;
using Toybox.Time.Gregorian;
using Toybox.UserProfile;
using Toybox.WatchUi;
using Toybox.Weather;

// Prefer the exact daily count; Garmin's steps complication switches to
// floating-point thousands at 10,000 steps on some firmware.
function epixCanvasFormatSteps(value, dailySteps) {
    if (dailySteps != null && dailySteps >= 0) {
        return dailySteps.format("%d");
    }
    if (value == null || value < 0) {
        return "--";
    }
    if (value instanceof Float || value instanceof Double) {
        return (value * 1000).format("%.0f");
    }
    return value.format("%d");
}

class EpixCanvasComplicationSnapshot {
    var types as Array<Number>;
    var values as Array<String>;
    var widgetTypes as Array<Number>;
    var widgetValues as Array<String>;
    var weatherCondition;
    var heartRate;
    var heartRateZones as Array<Number>;
    var currentTemperature;
    var temperatureHigh;
    var temperatureLow;
    var weeklyStepCounts as Array<Numeric or Null>;
    var weeklyStepGoals as Array<Numeric or Null>;
    var weeklyFloorCounts as Array<Numeric or Null>;
    var weeklyFloorGoals as Array<Numeric or Null>;
    var weeklyRunDistances as Array<Numeric or Null>;
    var weeklyWalkDistances as Array<Numeric or Null>;
    var sunriseSeconds;
    var sunsetSeconds;
    var solarEventIsSunset;

    function initialize(slotTypes, slotValues, currentWeatherCondition,
                        currentHeartRate, configuredHeartRateZones,
                        middleWidgetTypes, middleWidgetValues,
                        temperatureNow, temperatureMaximum,
                        temperatureMinimum, stepCounts, stepGoals,
                        floorCounts, floorGoals, runDistances, walkDistances,
                        sunriseTime, sunsetTime, upcomingSolarEventIsSunset) {
        types = slotTypes;
        values = slotValues;
        widgetTypes = middleWidgetTypes;
        widgetValues = middleWidgetValues;
        weatherCondition = currentWeatherCondition;
        heartRate = currentHeartRate;
        heartRateZones = configuredHeartRateZones;
        currentTemperature = temperatureNow;
        temperatureHigh = temperatureMaximum;
        temperatureLow = temperatureMinimum;
        weeklyStepCounts = stepCounts;
        weeklyStepGoals = stepGoals;
        weeklyFloorCounts = floorCounts;
        weeklyFloorGoals = floorGoals;
        weeklyRunDistances = runDistances;
        weeklyWalkDistances = walkDistances;
        sunriseSeconds = sunriseTime;
        sunsetSeconds = sunsetTime;
        solarEventIsSunset = upcomingSolarEventIsSunset;
    }
}

class EpixCanvasComplicationProvider {
    const WIDGET_DATE = -1;
    const WIDGET_ALARMS = -2;
    const WIDGET_NUMERIC_DATE = -3;
    const WIDGET_NUMERIC_DATE_LARGE_HOURS = -4;
    // Local history source; this is not a Garmin complication identifier.
    const WIDGET_WEEKLY_WALK = -5;
    private const MIDDLE_MODE_NUMERIC_DATE = 100;
    private const MIDDLE_MODE_NUMERIC_DATE_LARGE_HOURS = 101;
    private const MIDDLE_MODE_DATE = 0;
    private const MIDDLE_MODE_LINKED = 1;
    private const NIGHT_MIDDLE_MODE_ALARMS = 1;
    private const UNAVAILABLE = "--";

    private var _isRunning = false;
    private var _slotTypes as Array<Number> = [];
    private var _slotValues as Array<String> = [];
    private var _widgetTypes as Array<Number> = [];
    private var _widgetValues as Array<String> = [];
    private var _nightWidgetTypes as Array<Number> = [];
    private var _weatherCondition = Weather.CONDITION_UNKNOWN;
    private var _heartRate = null;
    private var _heartRateZones as Array<Number> = [90, 110, 130, 150, 170, 220];
    private var _currentTemperature = null;
    private var _temperatureHigh = null;
    private var _temperatureLow = null;
    private var _weeklyStepCounts as Array<Numeric or Null> =
        [null, null, null, null, null, null, null];
    private var _weeklyStepGoals as Array<Numeric or Null> =
        [null, null, null, null, null, null, null];
    private var _weeklyFloorCounts as Array<Numeric or Null> =
        [null, null, null, null, null, null, null];
    private var _weeklyFloorGoals as Array<Numeric or Null> =
        [null, null, null, null, null, null, null];
    private var _weeklyRunDistances as Array<Numeric or Null> =
        [null, null, null, null, null, null, null];
    private var _weeklyWalkDistances as Array<Numeric or Null> =
        [null, null, null, null, null, null, null];
    private var _sunriseSeconds = null;
    private var _sunsetSeconds = null;

    function initialize() {
        loadHeartRateZones();
        loadSelections();
        refreshValues();
    }

    function start() {
        if (_isRunning) {
            return;
        }

        _isRunning = true;
        Complications.registerComplicationChangeCallback(
            method(:onComplicationChanged)
        );

        for (var index = 0; index < _slotTypes.size(); index += 1) {
            var type = _slotTypes[index];
            if (type <= 0 ||
                isDuplicateSelection(index, type)) {
                continue;
            }

            subscribe(type);
        }

        for (var widgetIndex = 0; widgetIndex < _widgetTypes.size();
             widgetIndex += 1) {
            var widgetType = _widgetTypes[widgetIndex];
            if (widgetType <= 0 || isSlotTypeSelected(widgetType) ||
                isDuplicateWidgetSelection(widgetIndex, widgetType)) {
                continue;
            }

            subscribe(widgetType);
        }

        if (isWidgetSelected(Complications.COMPLICATION_TYPE_CURRENT_TEMPERATURE) &&
            !isTypeSelected(Complications.COMPLICATION_TYPE_HIGH_LOW_TEMPERATURE)) {
            subscribe(Complications.COMPLICATION_TYPE_HIGH_LOW_TEMPERATURE);
        }
        if (isWidgetSelected(Complications.COMPLICATION_TYPE_HIGH_LOW_TEMPERATURE) &&
            !isTypeSelected(Complications.COMPLICATION_TYPE_CURRENT_TEMPERATURE)) {
            subscribe(Complications.COMPLICATION_TYPE_CURRENT_TEMPERATURE);
        }

        if ((isTypeSelected(Complications.COMPLICATION_TYPE_SUNRISE) ||
             isTypeSelected(Complications.COMPLICATION_TYPE_SUNSET)) &&
            !isTypeSelected(Complications.COMPLICATION_TYPE_SUNSET)) {
            subscribe(Complications.COMPLICATION_TYPE_SUNSET);
        }
        if (isTypeSelected(Complications.COMPLICATION_TYPE_SUNSET) &&
            !isTypeSelected(Complications.COMPLICATION_TYPE_SUNRISE)) {
            subscribe(Complications.COMPLICATION_TYPE_SUNRISE);
        }

        if (usesDynamicWeatherIcon()) {
            subscribe(Complications.COMPLICATION_TYPE_CURRENT_WEATHER);
        }

        refreshValues();
    }

    function stop() {
        if (!_isRunning) {
            return;
        }

        Complications.unsubscribeFromAllUpdates();
        Complications.registerComplicationChangeCallback(null);
        _isRunning = false;
    }

    function reload() {
        var shouldRestart = _isRunning;
        if (shouldRestart) {
            stop();
        }

        loadSelections();
        refreshValues();

        if (shouldRestart) {
            start();
        }
    }

    function getSnapshot() {
        return createSnapshot(_widgetTypes, _widgetValues);
    }

    function getLowPowerSnapshot() {
        var alarmText = formatAlarmCount();
        return createSnapshot(
            _nightWidgetTypes,
            [alarmText, alarmText]
        );
    }

    private function createSnapshot(widgetTypes, widgetValues) {
        return new EpixCanvasComplicationSnapshot(
            _slotTypes,
            _slotValues,
            _weatherCondition,
            _heartRate,
            _heartRateZones,
            widgetTypes,
            widgetValues,
            _currentTemperature,
            _temperatureHigh,
            _temperatureLow,
            _weeklyStepCounts,
            _weeklyStepGoals,
            _weeklyFloorCounts,
            _weeklyFloorGoals,
            _weeklyRunDistances,
            _weeklyWalkDistances,
            _sunriseSeconds,
            _sunsetSeconds,
            isSolarEventSunset()
        );
    }

    private function loadSelections() {
        _slotTypes = [
            readSelection("TopLeftData", Complications.COMPLICATION_TYPE_HEART_RATE),
            readSelection("TopCentreData", Complications.COMPLICATION_TYPE_CURRENT_TEMPERATURE),
            readSelection("TopRightData", Complications.COMPLICATION_TYPE_HIGH_LOW_TEMPERATURE),
            readSelection("BottomLeftData", Complications.COMPLICATION_TYPE_FLOORS_CLIMBED),
            readSelection("BottomCentreData", Complications.COMPLICATION_TYPE_STEPS),
            readSelection("BottomRightData", Complications.COMPLICATION_TYPE_WEEKLY_RUN_DISTANCE)
        ];
        _slotValues = [UNAVAILABLE, UNAVAILABLE, UNAVAILABLE,
                       UNAVAILABLE, UNAVAILABLE, UNAVAILABLE];
        _widgetTypes = [
            readMiddleSelection("TopMiddleWidget", 1, MIDDLE_MODE_DATE),
            readMiddleSelection("BottomMiddleWidget", 4, MIDDLE_MODE_LINKED)
        ];
        _widgetValues = [UNAVAILABLE, UNAVAILABLE];
        _nightWidgetTypes = [
            readNightMiddleSelection("NightTopMiddleWidget", MIDDLE_MODE_DATE),
            readNightMiddleSelection(
                "NightBottomMiddleWidget",
                NIGHT_MIDDLE_MODE_ALARMS
            )
        ];
    }

    private function readSelection(key, fallback) {
        var selection = Properties.getValue(key);
        return (selection == null) ? fallback : selection.toNumber();
    }

    private function readMiddleSelection(key, linkedSlotIndex, fallbackMode) {
        var mode = readSelection(key, fallbackMode);
        if (key.equals("TopMiddleWidget") && mode == MIDDLE_MODE_NUMERIC_DATE) {
            return WIDGET_NUMERIC_DATE;
        }
        if (key.equals("TopMiddleWidget") &&
                mode == MIDDLE_MODE_NUMERIC_DATE_LARGE_HOURS) {
            return WIDGET_NUMERIC_DATE_LARGE_HOURS;
        }
        // Earlier builds stored the selected complication type directly.
        // Preserve Date, and migrate every former data choice to Linked Data.
        return (mode == MIDDLE_MODE_DATE || mode == WIDGET_DATE)
            ? WIDGET_DATE
            : _slotTypes[linkedSlotIndex];
    }

    private function readNightMiddleSelection(key, fallbackMode) {
        var mode = readSelection(key, fallbackMode);
        if (key.equals("NightTopMiddleWidget") && mode == MIDDLE_MODE_NUMERIC_DATE) {
            return WIDGET_NUMERIC_DATE;
        }
        if (key.equals("NightTopMiddleWidget") &&
                mode == MIDDLE_MODE_NUMERIC_DATE_LARGE_HOURS) {
            return WIDGET_NUMERIC_DATE_LARGE_HOURS;
        }
        return (mode == MIDDLE_MODE_DATE)
            ? WIDGET_DATE
            : WIDGET_ALARMS;
    }

    private function formatAlarmCount() {
        try {
            var alarmCount = System.getDeviceSettings().alarmCount;
            if (alarmCount == 1) {
                return "1 ALARM";
            }
            if (alarmCount > 1) {
                return alarmCount.format("%d") + " ALARMS";
            }
        } catch (exception) {
            // Older or inconsistent firmware may not expose alarm details.
        }
        return "NO ALARMS";
    }

    private function isDuplicateSelection(index, type) {
        for (var previous = 0; previous < index; previous += 1) {
            if (_slotTypes[previous] == type) {
                return true;
            }
        }
        return false;
    }

    private function isDuplicateWidgetSelection(index, type) {
        for (var previous = 0; previous < index; previous += 1) {
            if (_widgetTypes[previous] == type) {
                return true;
            }
        }
        return false;
    }

    private function refreshValues() {
        refreshSolarMetrics();
        if (isTypeSelected(WIDGET_WEEKLY_WALK)) {
            refreshWeeklyWalkHistory();
        }
        for (var index = 0; index < _slotTypes.size(); index += 1) {
            _slotValues[index] = readValue(_slotTypes[index]);
        }
        for (var widgetIndex = 0; widgetIndex < _widgetTypes.size();
             widgetIndex += 1) {
            _widgetValues[widgetIndex] = readWidgetValue(_widgetTypes[widgetIndex]);
        }
        refreshWeatherCondition();
        if (isTypeSelected(Complications.COMPLICATION_TYPE_HEART_RATE)) {
            refreshHeartRate();
        } else {
            _heartRate = null;
        }
        if (isWidgetSelected(Complications.COMPLICATION_TYPE_STEPS)) {
            refreshWeeklyStepHistory();
        }
        if (isWidgetSelected(Complications.COMPLICATION_TYPE_FLOORS_CLIMBED)) {
            refreshWeeklyFloorHistory();
        }
        if (isWidgetSelected(Complications.COMPLICATION_TYPE_WEEKLY_RUN_DISTANCE)) {
            refreshWeeklyRunHistory();
        }
        refreshTemperatureMetrics();
    }

    function onComplicationChanged(id as Complications.Id) as Void {
        var type = id.getType();

        if (type == Complications.COMPLICATION_TYPE_SUNRISE ||
            type == Complications.COMPLICATION_TYPE_SUNSET) {
            refreshSolarMetrics();
            refreshSolarDisplayValues();
            WatchUi.requestUpdate();
            return;
        }

        if (type == Complications.COMPLICATION_TYPE_CURRENT_WEATHER) {
            refreshWeatherCondition();
            WatchUi.requestUpdate();
            return;
        }

        if (type == Complications.COMPLICATION_TYPE_HEART_RATE) {
            refreshHeartRate();
        }

        var displayValue = readValue(type);

        for (var index = 0; index < _slotTypes.size(); index += 1) {
            if (_slotTypes[index] == type) {
                _slotValues[index] = displayValue;
            }
        }

        for (var widgetIndex = 0; widgetIndex < _widgetTypes.size();
             widgetIndex += 1) {
            if (_widgetTypes[widgetIndex] == type) {
                _widgetValues[widgetIndex] = displayValue;
            }
        }

        if (type == Complications.COMPLICATION_TYPE_CURRENT_TEMPERATURE ||
            type == Complications.COMPLICATION_TYPE_HIGH_LOW_TEMPERATURE) {
            refreshTemperatureMetrics();
        }

        if (type == Complications.COMPLICATION_TYPE_STEPS &&
            isWidgetSelected(type)) {
            refreshWeeklyStepHistory();
        } else if (type == Complications.COMPLICATION_TYPE_FLOORS_CLIMBED &&
            isWidgetSelected(type)) {
            refreshWeeklyFloorHistory();
        } else if (type == Complications.COMPLICATION_TYPE_WEEKLY_RUN_DISTANCE &&
            isWidgetSelected(type)) {
            refreshWeeklyRunHistory();
        }

        WatchUi.requestUpdate();
    }

    private function subscribe(type) {
        try {
            Complications.subscribeToUpdates(
                new Complications.Id(type)
            );
        } catch (exception) {
            // A snapshot still renders if a device cannot subscribe to a slot.
        }
    }

    private function usesDynamicWeatherIcon() {
        for (var index = 0; index < _slotTypes.size(); index += 1) {
            if (_slotTypes[index] == Complications.COMPLICATION_TYPE_CURRENT_TEMPERATURE) {
                return true;
            }
        }
        return isWidgetSelected(Complications.COMPLICATION_TYPE_CURRENT_TEMPERATURE);
    }

    private function isTypeSelected(type) {
        return isSlotTypeSelected(type) || isWidgetSelected(type);
    }

    private function isSlotTypeSelected(type) {
        for (var index = 0; index < _slotTypes.size(); index += 1) {
            if (_slotTypes[index] == type) {
                return true;
            }
        }
        return false;
    }

    private function isWidgetSelected(type) {
        for (var index = 0; index < _widgetTypes.size(); index += 1) {
            if (_widgetTypes[index] == type) {
                return true;
            }
        }
        return false;
    }

    private function refreshWeatherCondition() {
        _weatherCondition = Weather.CONDITION_UNKNOWN;

        if (!usesDynamicWeatherIcon()) {
            return;
        }

        try {
            var weather = Complications.getComplication(
                new Complications.Id(Complications.COMPLICATION_TYPE_CURRENT_WEATHER)
            );
            if (weather.value != null) {
                _weatherCondition = weather.value.toNumber();
            }
        } catch (exception) {
            // Keep the neutral temperature icon when weather is unavailable.
        }
    }

    private function refreshHeartRate() {
        _heartRate = null;

        try {
            var heartRate = Complications.getComplication(
                new Complications.Id(Complications.COMPLICATION_TYPE_HEART_RATE)
            );
            if (heartRate.value != null) {
                _heartRate = heartRate.value.toNumber();
            }
        } catch (exception) {
            // Leave heart rate unavailable until Garmin publishes a value.
        }
    }

    private function loadHeartRateZones() {
        // Six boundaries: min Z1, then the maximum for Z1 through Z5.
        _heartRateZones = [90, 110, 130, 150, 170, 220];

        if (UserProfile has :getHeartRateZones) {
            try {
                var configuredZones = UserProfile.getHeartRateZones(
                    UserProfile.HR_ZONE_SPORT_GENERIC
                );
                if (configuredZones != null && configuredZones.size() == 6) {
                    _heartRateZones = configuredZones;
                }
            } catch (exception) {
                // Keep the fallback thresholds on older firmware.
            }
        }
    }

    private function refreshWeeklyStepHistory() {
        _weeklyStepCounts = [null, null, null, null, null, null, null];
        _weeklyStepGoals = [null, null, null, null, null, null, null];
        var todayIndex = dayIndex(Time.now());

        try {
            var history = ActivityMonitor.getHistory();
            var historyCount = history.size();
            if (historyCount > todayIndex) {
                historyCount = todayIndex;
            }
            for (var index = 0; index < historyCount; index += 1) {
                var day = history[index];
                var historyDay = todayIndex - index - 1;
                if (day.steps != null && day.stepGoal != null &&
                    day.stepGoal > 0) {
                    _weeklyStepCounts[historyDay] = day.steps.toNumber();
                    _weeklyStepGoals[historyDay] = day.stepGoal.toNumber();
                }
            }

            var today = ActivityMonitor.getInfo();
            if (today.steps != null && today.stepGoal != null &&
                today.stepGoal > 0) {
                _weeklyStepCounts[todayIndex] = today.steps.toNumber();
                _weeklyStepGoals[todayIndex] = today.stepGoal.toNumber();
            }
        } catch (exception) {
            // Leave unavailable step-history days dimmed.
        }
    }

    private function refreshWeeklyFloorHistory() {
        _weeklyFloorCounts = [null, null, null, null, null, null, null];
        _weeklyFloorGoals = [null, null, null, null, null, null, null];
        var todayIndex = dayIndex(Time.now());

        try {
            var history = ActivityMonitor.getHistory();
            var historyCount = history.size();
            if (historyCount > todayIndex) {
                historyCount = todayIndex;
            }
            for (var index = 0; index < historyCount; index += 1) {
                var day = history[index];
                if (day.floorsClimbed != null &&
                    day.floorsClimbedGoal != null &&
                    day.floorsClimbedGoal > 0) {
                    var historyDay = todayIndex - index - 1;
                    _weeklyFloorCounts[historyDay] =
                        day.floorsClimbed.toNumber();
                    _weeklyFloorGoals[historyDay] =
                        day.floorsClimbedGoal.toNumber();
                }
            }

            var today = ActivityMonitor.getInfo();
            if (today.floorsClimbed != null &&
                today.floorsClimbedGoal != null &&
                today.floorsClimbedGoal > 0) {
                _weeklyFloorCounts[todayIndex] =
                    today.floorsClimbed.toNumber();
                _weeklyFloorGoals[todayIndex] =
                    today.floorsClimbedGoal.toNumber();
            }
        } catch (exception) {
            // Leave unavailable floor-history days dimmed.
        }
    }

    private function refreshWeeklyRunHistory() {
        _weeklyRunDistances = [null, null, null, null, null, null, null];
        var weekStart = currentWeekStartSeconds();
        var nowSeconds = Time.now().value();
        var todayIndex = dayIndex(Time.now());
        for (var day = 0; day <= todayIndex; day += 1) {
            _weeklyRunDistances[day] = 0;
        }

        try {
            var activities = UserProfile.getUserActivityHistory();
            var activity = activities.next();
            while (activity != null) {
                if (activity.startTime != null &&
                    activity.startTime.value() >= weekStart &&
                    activity.startTime.value() <= nowSeconds &&
                    activity.type == Activity.SPORT_RUNNING) {
                    var runDay = dayIndex(activity.startTime);
                    if (activity.distance != null && activity.distance > 0) {
                        var existingDistance = _weeklyRunDistances[runDay];
                        if (existingDistance == null) {
                            existingDistance = 0;
                        }
                        _weeklyRunDistances[runDay] =
                            existingDistance + activity.distance;
                    } else if (_weeklyRunDistances[runDay] == 0) {
                        // Preserve the fact that a run occurred when its
                        // recorded distance is unavailable.
                        _weeklyRunDistances[runDay] = 1;
                    }
                }
                activity = activities.next();
            }
        } catch (exception) {
            // Leave unavailable activity-history days dimmed.
        }
    }

    private function refreshWeeklyWalkHistory() {
        _weeklyWalkDistances = [null, null, null, null, null, null, null];
        var weekStart = currentWeekStartSeconds();
        var nowSeconds = Time.now().value();
        var todayIndex = dayIndex(Time.now());
        var distances =
            [null, null, null, null, null, null, null];
        for (var day = 0; day <= todayIndex; day += 1) {
            distances[day] = 0;
        }

        try {
            var activities = UserProfile.getUserActivityHistory();
            var activity = activities.next();
            while (activity != null) {
                if (activity.startTime != null &&
                    activity.startTime.value() >= weekStart &&
                    activity.startTime.value() <= nowSeconds &&
                    activity.type == Activity.SPORT_WALKING) {
                    var walkDay = dayIndex(activity.startTime);
                    var existingDistance = distances[walkDay];
                    if (activity.distance == null || activity.distance < 0) {
                        // An unknown recorded distance must not become zero.
                        distances[walkDay] = null;
                    } else if (existingDistance != null) {
                        distances[walkDay] = existingDistance + activity.distance;
                    }
                }
                activity = activities.next();
            }
            _weeklyWalkDistances = distances;
        } catch (exception) {
            // Keep every day unavailable when activity history cannot be read.
        }
    }

    private function weeklyWalkValue() {
        var distance = 0.0;
        var todayIndex = dayIndex(Time.now());
        for (var day = 0; day <= todayIndex; day += 1) {
            var dailyDistance = _weeklyWalkDistances[day];
            if (dailyDistance == null) {
                return UNAVAILABLE;
            }
            distance += dailyDistance;
        }
        return formatDistance(distance);
    }

    private function currentWeekStartSeconds() {
        var now = Time.now();
        var clock = System.getClockTime();
        var secondsToday = (clock.hour * 3600) + (clock.min * 60) + clock.sec;
        return now.value() - secondsToday - (dayIndex(now) * 86400);
    }

    private function dayIndex(moment) {
        var day = Gregorian.info(moment, Time.FORMAT_SHORT).day_of_week;
        switch (day) {
            case Gregorian.DAY_MONDAY: return 0;
            case Gregorian.DAY_TUESDAY: return 1;
            case Gregorian.DAY_WEDNESDAY: return 2;
            case Gregorian.DAY_THURSDAY: return 3;
            case Gregorian.DAY_FRIDAY: return 4;
            case Gregorian.DAY_SATURDAY: return 5;
            default: return 6;
        }
    }

    private function refreshSolarMetrics() {
        _sunriseSeconds = readSecondsSinceMidnight(
            Complications.COMPLICATION_TYPE_SUNRISE
        );
        _sunsetSeconds = readSecondsSinceMidnight(
            Complications.COMPLICATION_TYPE_SUNSET
        );
    }

    private function readSecondsSinceMidnight(type) {
        try {
            var complication = Complications.getComplication(
                new Complications.Id(type)
            );
            return (complication.value == null)
                ? null
                : complication.value.toNumber();
        } catch (exception) {
            return null;
        }
    }

    private function refreshSolarDisplayValues() {
        var displayValue = formatRelevantSolarTime();
        for (var index = 0; index < _slotTypes.size(); index += 1) {
            if (_slotTypes[index] == Complications.COMPLICATION_TYPE_SUNRISE ||
                _slotTypes[index] == Complications.COMPLICATION_TYPE_SUNSET) {
                _slotValues[index] = displayValue;
            }
        }
        for (var widgetIndex = 0; widgetIndex < _widgetTypes.size();
             widgetIndex += 1) {
            if (_widgetTypes[widgetIndex] == Complications.COMPLICATION_TYPE_SUNRISE ||
                _widgetTypes[widgetIndex] == Complications.COMPLICATION_TYPE_SUNSET) {
                _widgetValues[widgetIndex] = displayValue;
            }
        }
    }

    private function refreshTemperatureMetrics() {
        _currentTemperature = null;
        _temperatureHigh = null;
        _temperatureLow = null;

        try {
            var current = Complications.getComplication(
                new Complications.Id(
                    Complications.COMPLICATION_TYPE_CURRENT_TEMPERATURE
                )
            );
            if (current.value != null) {
                _currentTemperature = convertTemperature(current.value.toFloat());
            }
        } catch (exception) {
            // Leave the current-temperature marker unavailable.
        }

        try {
            var highLow = Complications.getComplication(
                new Complications.Id(
                    Complications.COMPLICATION_TYPE_HIGH_LOW_TEMPERATURE
                )
            );
            parseTemperatureRange(highLow.value);
        } catch (exception) {
            // Leave the range unavailable.
        }
    }

    private function parseTemperatureRange(value) {
        if (value == null) {
            return;
        }

        var text = value.toString();
        var divider = text.find(" / L ");
        if (text.find("H ") == 0 && divider != null) {
            _temperatureHigh = convertTemperature(
                text.substring(2, divider).toFloat()
            );
            _temperatureLow = convertTemperature(
                text.substring(divider + 5, null).toFloat()
            );
            return;
        }

        // Some 5.2 firmware and simulator data uses an already-localised
        // "high/low" value without the documented H/L prefixes.
        divider = text.find("/");
        if (divider != null) {
            try {
                _temperatureHigh = text.substring(0, divider).toFloat();
                _temperatureLow = text.substring(divider + 1, null).toFloat();
            } catch (exception) {
                _temperatureHigh = null;
                _temperatureLow = null;
            }
        }
    }

    private function readWidgetValue(type) {
        if (type == WIDGET_DATE || type == WIDGET_NUMERIC_DATE ||
                type == WIDGET_NUMERIC_DATE_LARGE_HOURS) {
            return "";
        }
        return readValue(type);
    }

    private function readValue(type) {
        if (type == WIDGET_WEEKLY_WALK) {
            return weeklyWalkValue();
        }

        if (type == Complications.COMPLICATION_TYPE_INVALID) {
            return "";
        }

        if (type == Complications.COMPLICATION_TYPE_STEPS) {
            return readSteps();
        }

        if (type == Complications.COMPLICATION_TYPE_SUNRISE ||
            type == Complications.COMPLICATION_TYPE_SUNSET) {
            return formatRelevantSolarTime();
        }

        try {
            var complication = Complications.getComplication(
                new Complications.Id(type)
            );
            return formatValue(type, complication.value);
        } catch (exception) {
            return UNAVAILABLE;
        }
    }

    private function formatValue(type, value) {
        if (value == null) {
            return UNAVAILABLE;
        }

        switch (type) {
            case Complications.COMPLICATION_TYPE_CURRENT_TEMPERATURE:
                return formatTemperature(value);

            case Complications.COMPLICATION_TYPE_HIGH_LOW_TEMPERATURE:
                return formatHighLow(value.toString());

            case Complications.COMPLICATION_TYPE_WEEKLY_RUN_DISTANCE:
                return formatDistance(value);

            default:
                return value.toNumber().format("%d");
        }
    }

    private function readSteps() {
        try {
            var steps = ActivityMonitor.getInfo().steps;
            if (steps != null && steps >= 0) {
                return epixCanvasFormatSteps(null, steps);
            }
        } catch (exception) {
            // Retain complication support when daily activity is unavailable.
        }
        try {
            var complication = Complications.getComplication(
                new Complications.Id(Complications.COMPLICATION_TYPE_STEPS)
            );
            return epixCanvasFormatSteps(complication.value, null);
        } catch (exception) {
            return UNAVAILABLE;
        }
    }

    private function formatRelevantSolarTime() {
        if (_sunriseSeconds == null && _sunsetSeconds == null) {
            return UNAVAILABLE;
        }

        var relevantTime = isSolarEventSunset()
            ? _sunsetSeconds
            : _sunriseSeconds;
        if (relevantTime == null) {
            relevantTime = (_sunriseSeconds != null)
                ? _sunriseSeconds
                : _sunsetSeconds;
        }

        return formatSolarTime(relevantTime);
    }

    private function isSolarEventSunset() {
        if (_sunriseSeconds == null || _sunsetSeconds == null) {
            return false;
        }
        var clock = System.getClockTime();
        var nowSeconds = (clock.hour * 3600) + (clock.min * 60) + clock.sec;
        if (_sunsetSeconds > _sunriseSeconds) {
            return nowSeconds >= _sunriseSeconds && nowSeconds < _sunsetSeconds;
        }
        return nowSeconds >= _sunriseSeconds || nowSeconds < _sunsetSeconds;
    }

    private function formatSolarTime(seconds) {
        var hour = (seconds / 3600).toNumber();
        var minute = ((seconds % 3600) / 60).toNumber();
        if (!System.getDeviceSettings().is24Hour) {
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
            return hour.format("%d") + ":" + minute.format("%02d");
        }
        return hour.format("%02d") + ":" + minute.format("%02d");
    }

    private function formatTemperature(value) {
        var temperature = convertTemperature(value.toFloat());

        return temperature.format("%.0f");
    }

    private function convertTemperature(temperature) {
        var deviceSettings = System.getDeviceSettings();

        if (deviceSettings.temperatureUnits == System.UNIT_STATUTE) {
            temperature = (temperature * 9.0 / 5.0) + 32.0;
        }

        return temperature;
    }

    private function formatHighLow(value) {
        // Garmin supplies Celsius as "H <high> / L <low>".
        var divider = value.find(" / L ");
        if (value.find("H ") == 0 && divider != null) {
            var high = convertTemperature(
                value.substring(2, divider).toFloat()
            );
            var low = convertTemperature(
                value.substring(divider + 5, null).toFloat()
            );
            return high.format("%.0f") + "/" + low.format("%.0f");
        }

        return value;
    }

    private function formatDistance(value) {
        var metres = value.toFloat();
        var deviceSettings = System.getDeviceSettings();

        if (deviceSettings.distanceUnits == System.UNIT_STATUTE) {
            return (metres / 1609.344).format("%.1f");
        }

        return (metres / 1000.0).format("%.1f");
    }
}
