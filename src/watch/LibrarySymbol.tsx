import { dataMetrics } from "../../shared/data-metrics.ts";
import footsteps from "../../garmin/resources/drawables/icons/footsteps.svg";
import stairs from "../../garmin/resources/drawables/icons/stairs.svg";
import run from "../../garmin/resources/drawables/icons/run.svg";
import heart from "../../garmin/resources/drawables/icons/heart.svg";
import temperature from "../../garmin/resources/drawables/icons/temperature.svg";
import forecast from "../../garmin/resources/drawables/icons/temperature-sun.svg";
import sunrise from "../../garmin/resources/drawables/icons/sunrise.svg";
import bodyBattery from "../../garmin/resources/drawables/icons/body-battery.svg";
import stress from "../../garmin/resources/drawables/icons/stress.svg";
import recoveryTime from "../../garmin/resources/drawables/icons/recovery-time.svg";
import rainChance from "../../garmin/resources/drawables/icons/cloud-rain.svg";
import wind from "../../garmin/resources/drawables/icons/wind.svg";
import { activityParts, sidebarKind, type LibrarySource } from "./library-catalogue.ts";
import { isClockSource, isDateSource } from "../../shared/scene.ts";

const localSymbols = import.meta.glob("../../garmin/resources/drawables/icons/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export function LibrarySymbol({ source }: { source: LibrarySource }) {
    const assets: Partial<Record<LibrarySource, string>> = { bodyBattery, stress, recoveryTime, rainChance, wind, steps: footsteps, weeklyWalk: footsteps, floors: stairs,
        weeklyRun: run, heartRate: heart, temperature, highLow: forecast, temperatureHigh: forecast, temperatureLow: forecast, sunriseSunset: sunrise };
    const parent = Object.entries(activityParts).find(([, parts]) => parts.icon === source)?.[0] as LibrarySource | undefined;
    const metric = dataMetrics.find((item) => item.source === (parent ?? source));
    const asset = metric ? localSymbols[`../../garmin/resources/drawables/icons/${metric.icon}.svg`] : assets[parent ?? source];
    if (asset) return <img className="compact-library-symbol compact-library-image" src={asset} alt="" aria-hidden="true" />;
    return <svg className="compact-library-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {sidebarKind(source) === "Graphs" ? <><path d="M4 20h16M6 16v-4m6 4V5m6 11V9" /></>
            : isClockSource(source) ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5h4" /></>
            : isDateSource(source) ? <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4m8-4v4M4 10h16" /></>
                : source === "battery" ? <><rect x="3" y="7" width="17" height="10" rx="2" /><path d="M22 10v4M6 10v4m3-4v4m3-4v4" /></>
                    : source === "alarms" ? <><circle cx="12" cy="13" r="7" /><path d="m4 3-3 3m19-3 3 3M12 9v4h3M7 20l-2 2m12-2 2 2" /></>
                        : source === "label" ? <path d="M5 5h14M12 5v15M8 20h8" />
                            : <><circle cx="12" cy="8" r="1" /><circle cx="12" cy="16" r="1" /></>}
    </svg>;
}
