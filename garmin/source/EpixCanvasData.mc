using Toybox.Lang;
using Toybox.System;
using Toybox.Time;
using Toybox.Time.Gregorian;

class EpixCanvasData {
    var timeText;
    var dateText;
    var hourText;
    var minuteText;
    var dateLeftText;
    var dateCentreText;
    var dateRightText;
    var seconds;
    var numericDateText;

    function initialize(time, date, hour, minute, dateLeft, dateCentre,
                        dateRight, currentSeconds, numericDate) {
        timeText = time;
        dateText = date;
        hourText = hour;
        minuteText = minute;
        dateLeftText = dateLeft;
        dateCentreText = dateCentre;
        dateRightText = dateRight;
        seconds = currentSeconds;
        numericDateText = numericDate;
    }
}

class EpixCanvasDataProvider {
    function getSnapshot() {
        var clock = System.getClockTime();
        var deviceSettings = System.getDeviceSettings();
        var hour = clock.hour;

        if (!deviceSettings.is24Hour) {
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }

        var hourText = hour.format("%02d");
        var minuteText = clock.min.format("%02d");
        var timeText = hourText + ":" + minuteText;
        var dateInfo = Gregorian.info(Time.now(), Time.FORMAT_LONG);
        var dateText = fullDayName(dateInfo.day_of_week.toString()) + " " +
            dateInfo.day.format("%d") + " " +
            fullMonthName(dateInfo.month.toString()) + " " +
            dateInfo.year.format("%d");
        var dateLeftText = dateInfo.day_of_week.toString().toUpper();
        var dateCentreText = dateInfo.day.format("%d") + " " +
            dateInfo.month.toString().substring(0, 3).toUpper();
        var dateRightText = dateInfo.year.format("%d");

        var numericDate = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        var numericDateText = numericDate.day.format("%02d") + "/" +
            numericDate.month.format("%02d") + "/" +
            (numericDate.year % 100).format("%02d");

        return new EpixCanvasData(
            timeText,
            dateText,
            hourText,
            minuteText,
            dateLeftText,
            dateCentreText,
            dateRightText,
            clock.sec,
            numericDateText
        );
    }

    private function fullDayName(day) {
        switch (day.toLower()) {
            case "sun": return "sunday";
            case "mon": return "monday";
            case "tue": return "tuesday";
            case "wed": return "wednesday";
            case "thu": return "thursday";
            case "fri": return "friday";
            case "sat": return "saturday";
        }
        return day.toLower();
    }

    private function fullMonthName(month) {
        switch (month.toLower()) {
            case "jan": return "january";
            case "feb": return "february";
            case "mar": return "march";
            case "apr": return "april";
            case "may": return "may";
            case "jun": return "june";
            case "jul": return "july";
            case "aug": return "august";
            case "sep": return "september";
            case "oct": return "october";
            case "nov": return "november";
            case "dec": return "december";
        }
        return month.toLower();
    }
}
