import footsteps from "../../garmin/resources/drawables/icons/footsteps.svg";
import stairs from "../../garmin/resources/drawables/icons/stairs.svg";
import run from "../../garmin/resources/drawables/icons/run.svg";
import heart from "../../garmin/resources/drawables/icons/heart.svg";
import temperature from "../../garmin/resources/drawables/icons/temperature.svg";
import forecast from "../../garmin/resources/drawables/icons/temperature-sun.svg";
import sunrise from "../../garmin/resources/drawables/icons/sunrise.svg";
import type { LibrarySource } from "./library-catalogue.ts";

export function LibrarySymbol({ source }: { source: LibrarySource }) {
    const assets: Partial<Record<LibrarySource, string>> = { steps: footsteps, weeklyWalk: footsteps, floors: stairs,
        weeklyRun: run, heartRate: heart, temperature, highLow: forecast, temperatureHigh: forecast, temperatureLow: forecast, sunriseSunset: sunrise };
    const asset = assets[source];
    if (asset) return <img className="compact-library-symbol compact-library-image" src={asset} alt="" aria-hidden="true" />;
    return <svg className="compact-library-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {source === "time" ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5h4" /></>
            : source === "numericDate" ? <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4m8-4v4M4 10h16" /></>
                : source === "battery" ? <><rect x="3" y="7" width="17" height="10" rx="2" /><path d="M22 10v4M6 10v4m3-4v4m3-4v4" /></>
                    : source === "alarms" ? <><circle cx="12" cy="13" r="7" /><path d="m4 3-3 3m19-3 3 3M12 9v4h3M7 20l-2 2m12-2 2 2" /></>
                        : source === "label" ? <path d="M5 5h14M12 5v15M8 20h8" />
                            : <><circle cx="12" cy="8" r="1" /><circle cx="12" cy="16" r="1" /></>}
    </svg>;
}
