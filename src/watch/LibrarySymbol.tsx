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
                : <><circle cx="12" cy="8" r="1" /><circle cx="12" cy="16" r="1" /></>}
    </svg>;
}
