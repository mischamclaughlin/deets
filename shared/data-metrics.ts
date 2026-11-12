import catalogue from "./data-metrics.json" with { type: "json" };

/** Protocol identifiers; shared metadata supplies labels, units, samples and icons. */
export const additionalDataSources = [
    "calories", "intensityMinutes", "weeklyBike", "vo2MaxRun", "vo2MaxBike", "trainingStatus",
    "race5k", "race10k", "raceHalf", "raceMarathon", "pulseOx", "respirationRate",
    "altitude", "pressure", "notifications", "calendarEvent", "humidity", "feelsLike", "uvIndex", "cloudCover",
] as const;
export type AdditionalDataSource = typeof additionalDataSources[number];
export type AdditionalMetricCategory = "health" | "activity" | "training" | "outdoors" | "weather" | "device";
export interface DataMetric {
    source: AdditionalDataSource;
    label: string;
    category: AdditionalMetricCategory;
    detail: string;
    keywords: string;
    sample: string;
    largeSample: string;
    icon: string;
    format: string;
    complication?: number;
    weatherField?: string;
}
export const dataMetrics = catalogue as readonly DataMetric[];
const metricSources = new Set<string>(additionalDataSources);
export const isAdditionalDataSource = (source: string): source is AdditionalDataSource => metricSources.has(source);
