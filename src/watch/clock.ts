import type { ClockSource } from "../../shared/scene.ts";

export const clockModes: Array<{ source: ClockSource; label: string; name: string }> = [
    { source: "time", label: "HH:MM", name: "Hours and minutes" },
    { source: "timeSeconds", label: "HH:MM:SS", name: "Hours, minutes and seconds" },
    { source: "hours", label: "HH", name: "Hours only" },
    { source: "minutes", label: "MM", name: "Minutes only" },
    { source: "seconds", label: "SS", name: "Seconds only" },
];
