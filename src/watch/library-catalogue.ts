import type { ActivitySource } from "../../shared/scene.ts";

export type LibrarySource = ActivitySource | "time" | "numericDate" | "divider";
export type LibraryCategory = "all" | "clock" | "activity" | "weather";
export interface LibraryEntry {
    source: LibrarySource;
    label: string;
    detail: string;
    category: Exclude<LibraryCategory, "all">;
    keywords: string;
}

export const libraryEntries: readonly LibraryEntry[] = [
    { source: "time", label: "Time", detail: "Hours & minutes", category: "clock", keywords: "clock hours minutes" },
    { source: "numericDate", label: "Date", detail: "Day, month & year", category: "clock", keywords: "calendar weekday" },
    { source: "divider", label: "Divider", detail: "An independent separator", category: "clock", keywords: "colon punctuation separator" },
    { source: "heartRate", label: "Heart rate", detail: "Current beats per minute", category: "activity", keywords: "value pulse bpm health heart rate" },
    { source: "heartIcon", label: "Heart icon", detail: "Heart-rate symbol", category: "activity", keywords: "symbol pulse bpm health heart" },
    { source: "heartZones", label: "Heart-rate zones", detail: "Current heart rate across five zones", category: "activity", keywords: "heart rate pulse bpm health graph chart zones band" },
    { source: "steps", label: "Steps", detail: "Today's step count", category: "activity", keywords: "value daily count" },
    { source: "stepsIcon", label: "Steps icon", detail: "Footsteps", category: "activity", keywords: "symbol footprints" },
    { source: "stepsWeek", label: "Steps graph", detail: "Daily steps · Monday–Sunday", category: "activity", keywords: "weekly chart bars" },
    { source: "floors", label: "Flights climbed", detail: "Today's flights of stairs", category: "activity", keywords: "value daily floors stairs staircase" },
    { source: "floorsIcon", label: "Stairs icon", detail: "Flights of stairs", category: "activity", keywords: "symbol daily floors staircase" },
    { source: "floorsWeek", label: "Flights graph", detail: "Daily flights · Monday–Sunday", category: "activity", keywords: "weekly chart bars floors stairs staircase flights of stairs" },
    { source: "weeklyWalk", label: "Walking", detail: "Recorded distance this week", category: "activity", keywords: "value weekly walk distance" },
    { source: "walkIcon", label: "Walking icon", detail: "Footsteps", category: "activity", keywords: "symbol walk footprints" },
    { source: "walkWeek", label: "Walking graph", detail: "Daily distance · Monday–Sunday", category: "activity", keywords: "weekly walk chart bars" },
    { source: "weeklyRun", label: "Running", detail: "Distance this week", category: "activity", keywords: "value weekly run distance" },
    { source: "runIcon", label: "Running icon", detail: "Runner", category: "activity", keywords: "symbol run" },
    { source: "runWeek", label: "Running graph", detail: "Daily distance · Monday–Sunday", category: "activity", keywords: "weekly run chart bars" },
    { source: "temperature", label: "Current temperature", detail: "Weather conditions and current temperature", category: "weather", keywords: "value current temperature weather degrees celsius fahrenheit thermometer" },
    { source: "temperatureIcon", label: "Weather icon", detail: "Changes with the weather conditions", category: "weather", keywords: "symbol temperature weather sun cloud rain snow wind mist thermometer" },
    { source: "highLow", label: "High / low temperature", detail: "Today's forecast high and low", category: "weather", keywords: "value temperature forecast high low maximum minimum range" },
    { source: "temperatureHigh", label: "High temperature", detail: "Today's forecast high", category: "weather", keywords: "value temperature forecast high maximum" },
    { source: "temperatureLow", label: "Low temperature", detail: "Today's forecast low", category: "weather", keywords: "value temperature forecast low minimum" },
    { source: "highLowIcon", label: "Forecast icon", detail: "Thermometer and sun", category: "weather", keywords: "symbol forecast temperature thermometer sun" },
    { source: "temperatureZones", label: "Temperature band", detail: "Current temperature across five zones", category: "weather", keywords: "graph chart temperature zones band current cold warm hot" },
    { source: "sunriseSunset", label: "Sunrise / sunset", detail: "The next sunrise or sunset", category: "weather", keywords: "value sun sunrise sunset solar next event dawn dusk" },
    { source: "sunriseSunsetIcon", label: "Sunrise / sunset icon", detail: "Matches the next solar event", category: "weather", keywords: "symbol sun sunrise sunset solar dawn dusk" },
    { source: "solarTimeline", label: "Daylight graph", detail: "Daylight and the current time", category: "weather", keywords: "graph chart sun sunrise sunset solar daylight timeline noon" },
];

export const activityParts: Partial<Record<LibrarySource, { icon: LibrarySource; graph?: LibrarySource; graphLabel?: string }>> = {
    heartRate: { icon: "heartIcon", graph: "heartZones", graphLabel: "Heart-rate zones" },
    steps: { icon: "stepsIcon", graph: "stepsWeek" },
    floors: { icon: "floorsIcon", graph: "floorsWeek" },
    weeklyWalk: { icon: "walkIcon", graph: "walkWeek" },
    weeklyRun: { icon: "runIcon", graph: "runWeek" },
    temperature: { icon: "temperatureIcon", graph: "temperatureZones", graphLabel: "Temperature band" },
    highLow: { icon: "highLowIcon", graph: "temperatureZones", graphLabel: "Temperature band" },
    temperatureHigh: { icon: "highLowIcon" },
    temperatureLow: { icon: "highLowIcon" },
    sunriseSunset: { icon: "sunriseSunsetIcon", graph: "solarTimeline", graphLabel: "Daylight graph" },
};

/** Present data first; its icon and graph are choices made when adding it. */
export const libraryItems = libraryEntries.filter((entry) => entry.category === "clock" || activityParts[entry.source]);

export function matchingEntries(category: LibraryCategory, query: string): readonly LibraryEntry[] {
    const terms = query.trim().toLocaleLowerCase("en-GB").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return libraryItems.filter((entry) => {
        const parts = activityParts[entry.source];
        const related = libraryEntries.filter((item) => item.source === entry.source ||
            item.source === parts?.icon || item.source === parts?.graph);
        const searchable = related.map((item) => `${item.label} ${item.detail} ${item.keywords}`).join(" ").toLocaleLowerCase("en-GB").split(/[^\p{L}\p{N}]+/u);
        return (category === "all" || entry.category === category) && terms.every((term) => searchable.some((word) => word.startsWith(term)));
    });
}
