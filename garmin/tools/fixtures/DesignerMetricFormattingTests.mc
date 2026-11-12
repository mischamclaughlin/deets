using Toybox.Test;

(:test)
function deetsMetricFormatsDeviceUnits(logger) {
    Test.assertEqual(deetsFormatMetric("distance", 1609.344, true, false, false), "1.0 MI");
    Test.assertEqual(deetsFormatMetric("distance", 42500, false, false, false), "42.5 KM");
    Test.assertEqual(deetsFormatMetric("altitude", 100, false, true, false), "328 FT");
    Test.assertEqual(deetsFormatMetric("altitude", -30, false, false, false), "-30 M");
    Test.assertEqual(deetsFormatMetric("temperature", 10, false, false, true), "50 F");
    Test.assertEqual(deetsFormatMetric("temperature", -10, false, false, false), "-10 C");
    Test.assertEqual(deetsFormatMetric("pressure", 101325, false, false, false), "1013 HPA");
    return true;
}

(:test)
function deetsMetricFormatsLiveValueShapes(logger) {
    Test.assertEqual(deetsFormatMetric("duration", 3661, false, false, false), "1:01:01");
    Test.assertEqual(deetsFormatMetric("duration", 59, false, false, false), "0:00:59");
    Test.assertEqual(deetsFormatMetric("duration", 60, false, false, false), "0:01:00");
    Test.assertEqual(deetsFormatMetric("duration", 3600, false, false, false), "1:00:00");
    Test.assertEqual(deetsFormatMetric("percent", 0, false, false, false), "0%");
    Test.assertEqual(deetsFormatMetric("percent", 100, false, false, false), "100%");
    Test.assertEqual(deetsFormatMetric("duration", 0, false, false, false), "0:00:00");
    Test.assertEqual(deetsFormatMetric("count", 14.9, false, false, false), "14");
    Test.assertEqual(deetsFormatMetric("percent", 98, false, false, false), "98%");
    Test.assertEqual(deetsFormatMetric("decimal", 3.5, false, false, false), "3.5");
    Test.assertEqual(deetsFormatMetric("text", "Productive", false, false, false), "PRODUCTIVE");
    Test.assertEqual(deetsFormatMetric("text", "14:30", false, false, false), "14:30");
    Test.assertEqual(deetsFormatMetric("text", "é", false, false, false), "?");
    Test.assertEqual(deetsFormatMetric("text", "   ", false, false, false), "--");
    Test.assertEqual(deetsFormatMetric("text", "abcé", false, false, false), "ABC?");
    return true;
}

(:test)
function deetsMetricRejectsUnavailableOrInvalidValues(logger) {
    var invalid = [null, true, "12", -1, 1.0e30];
    for (var i = 0; i < invalid.size(); i += 1) {
        Test.assertEqual(deetsFormatMetric("count", invalid[i], false, false, false), "--");
    }
    Test.assertEqual(deetsFormatMetric("percent", 101, false, false, false), "--");
    Test.assertEqual(deetsFormatMetric("duration", 604801, false, false, false), "--");
    Test.assertEqual(deetsFormatMetric("pressure", 0, false, false, false), "--");
    Test.assertEqual(deetsFormatMetric("altitude", -1501, false, false, false), "--");
    Test.assertEqual(deetsFormatMetric("temperature", 151, false, false, false), "--");
    Test.assertEqual(deetsFormatMetric("text", "", false, false, false), "--");
    return true;
}
