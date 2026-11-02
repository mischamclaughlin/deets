import type { DateSource } from "../../shared/scene.ts";

export const dateModes: Array<{ source: DateSource; label: string; name: string }> = [
    { source: "numericDate", label: "DD/MM/YY", name: "Numeric date · 26/10/26" },
    { source: "weekday", label: "Weekday", name: "Weekday · MON" },
    { source: "day", label: "DD", name: "Day of month · 26" },
    { source: "month", label: "Month", name: "Month · OCT" },
    { source: "year", label: "YYYY", name: "Year · 2026" },
];
