"""Parent weather-condition groups shared by generated native icon selection."""

WEATHER_ICON_CONDITIONS = {
    "sun": ("CLEAR", "PARTLY_CLEAR", "MOSTLY_CLEAR", "FAIR"),
    "cloud": ("PARTLY_CLOUDY", "MOSTLY_CLOUDY", "CLOUDY", "THIN_CLOUDS"),
    "cloud-rain": ("RAIN", "SCATTERED_SHOWERS", "UNKNOWN_PRECIPITATION", "LIGHT_RAIN", "HEAVY_RAIN",
                   "LIGHT_SHOWERS", "SHOWERS", "HEAVY_SHOWERS", "CHANCE_OF_SHOWERS", "DRIZZLE", "CLOUDY_CHANCE_OF_RAIN"),
    "cloud-storm": ("THUNDERSTORMS", "SCATTERED_THUNDERSTORMS", "CHANCE_OF_THUNDERSTORMS", "TORNADO",
                    "SQUALL", "HURRICANE", "TROPICAL_STORM"),
    "snowflake": ("SNOW", "WINTRY_MIX", "HAIL", "LIGHT_SNOW", "HEAVY_SNOW", "LIGHT_RAIN_SNOW", "HEAVY_RAIN_SNOW",
                  "RAIN_SNOW", "ICE", "CHANCE_OF_SNOW", "CHANCE_OF_RAIN_SNOW", "CLOUDY_CHANCE_OF_SNOW",
                  "CLOUDY_CHANCE_OF_RAIN_SNOW", "FLURRIES", "FREEZING_RAIN", "SLEET", "ICE_SNOW"),
    "wind": ("WINDY",),
    "mist": ("FOG", "HAZY", "MIST", "DUST", "SMOKE", "SAND", "SANDSTORM", "VOLCANIC_ASH", "HAZE"),
}


def weather_icon_switch(variants):
    """Emit the parent's exact condition groups with the thermometer fallback."""
    lines = []
    for name, conditions in WEATHER_ICON_CONDITIONS.items():
        lines.extend(f"            case Weather.CONDITION_{condition}:" for condition in conditions)
        lines.append(f"                return {variants.index(name)};")
    return "\n".join(lines)
