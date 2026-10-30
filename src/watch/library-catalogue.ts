import type { ActivitySource } from "../../shared/scene.ts";

export type LibrarySource = ActivitySource | "time" | "numericDate" | "divider";
export type LibraryCategory = "all" | "clock" | "activity";
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
    { source: "steps", label: "Steps", detail: "Today's step count", category: "activity", keywords: "value daily count" },
    { source: "stepsIcon", label: "Steps icon", detail: "Footsteps", category: "activity", keywords: "symbol footprints" },
    { source: "stepsWeek", label: "Steps graph", detail: "Daily steps · Monday–Sunday", category: "activity", keywords: "weekly chart bars" },
    { source: "weeklyWalk", label: "Walking", detail: "Recorded distance this week", category: "activity", keywords: "value weekly walk distance" },
    { source: "walkIcon", label: "Walking icon", detail: "Footsteps", category: "activity", keywords: "symbol walk footprints" },
    { source: "walkWeek", label: "Walking graph", detail: "Daily distance · Monday–Sunday", category: "activity", keywords: "weekly walk chart bars" },
    { source: "weeklyRun", label: "Running", detail: "Distance this week", category: "activity", keywords: "value weekly run distance" },
    { source: "runIcon", label: "Running icon", detail: "Runner", category: "activity", keywords: "symbol run" },
    { source: "runWeek", label: "Running graph", detail: "Daily distance · Monday–Sunday", category: "activity", keywords: "weekly run chart bars" },
];

export function matchingEntries(category: LibraryCategory, query: string): readonly LibraryEntry[] {
    const terms = query.trim().toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
    return libraryEntries.filter((entry) => (category === "all" || entry.category === category) &&
        terms.every((term) => `${entry.label} ${entry.detail} ${entry.keywords}`.toLocaleLowerCase("en-GB").includes(term)));
}
