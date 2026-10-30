import type { ActivityAddOptions, ActivitySource, ClockSource, DateSource, ColourPreset, DividerSymbol, Scene, TextDefaults, TextPreset, Typography, WatchMapping } from "../../shared/scene.ts";
import { preparedMapping, rememberMapping } from "./mapping-cache.ts";

async function post<T>(
    path: string,
    payload: unknown,
    signal?: AbortSignal,
): Promise<T> {
    const response = await fetch(`/api/garmin/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
    });
    if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(
            error.error ?? "The Garmin operation could not complete.",
        );
    }
    const result = await response.json();
    if (result && typeof result === "object" && "mapping" in result && "scene" in result &&
        "ops" in result && Array.isArray(result.ops) && "areas" in result && Array.isArray(result.areas) &&
        "assets" in result && result.assets)
        rememberMapping(result as WatchMapping, (payload as { night?: boolean }).night ?? false);
    return result as T;
}

export const mapWatch = (scene: Scene, night = false, signal?: AbortSignal) =>
    post<WatchMapping>("layout", { scene, night }, signal);

/** Editing can reuse prepared native pixels; export always requests a fresh proof. */
export const previewWatch = (scene: Scene, night = false, signal?: AbortSignal) => {
    const prepared = preparedMapping(scene, night);
    return prepared ? Promise.resolve(prepared) : mapWatch(scene, night, signal);
};

/** Export the exact scene snapshot that supplied the validated mapping token. */
export async function exportGarmin(
    scene: Scene,
    signal?: AbortSignal,
): Promise<Blob> {
    const snapshot = structuredClone(scene);
    const mapped = await mapWatch(snapshot, false, signal);
    const response = await fetch("/api/garmin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: mapped.scene, mapping: mapped.mapping }),
        signal,
    });
    if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "The Garmin export could not complete.");
    }
    return response.blob();
}


export const setTypography = (scene: Scene, elementId: string, typography: Typography, signal?: AbortSignal) =>
    post<WatchMapping>("typography", { scene, elementId, typography }, signal);

export async function uploadFont(file: File): Promise<{ id: string; name: string }> {
    if (!/\.(ttf|otf)$/i.test(file.name) || file.size > 5 * 1024 * 1024)
        throw new Error("Choose a TTF or OTF font up to 5 MB.");
    const response = await fetch("/api/garmin/font", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Font-Name": encodeURIComponent(file.name) },
        body: file,
    });
    if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "The font could not be uploaded.");
    }
    return response.json() as Promise<{ id: string; name: string }>;
}


export const setClockSource = (scene: Scene, elementId: string, source: ClockSource, signal?: AbortSignal) =>
    post<WatchMapping>("clock", { scene, elementId, source }, signal);


export const addTime = (scene: Scene, signal?: AbortSignal) =>
    post<WatchMapping>("add", { scene, source: "time" }, signal);

export const setWatchFont = (scene: Scene, family: string, signal?: AbortSignal) =>
    post<WatchMapping>("watch-font", { scene, family }, signal);

export const setFontInheritance = (scene: Scene, elementId: string, inherit: boolean, signal?: AbortSignal) =>
    post<WatchMapping>("inherit-font", { scene, elementId, inherit }, signal);

export const addDivider = (scene: Scene, signal?: AbortSignal) =>
    post<WatchMapping>("add", { scene, source: "divider" }, signal);

export const setDividerSymbol = (scene: Scene, elementId: string, symbol: DividerSymbol, signal?: AbortSignal) =>
    post<WatchMapping>("divider", { scene, elementId, symbol }, signal);

export const setSecondsSize = (scene: Scene, elementId: string, size: "full" | "half", signal?: AbortSignal) =>
    post<WatchMapping>("seconds-size", { scene, elementId, size }, signal);

export const copyElement = (scene: Scene, elementId: string, signal?: AbortSignal) =>
    post<WatchMapping>("copy-element", { scene, elementId }, signal);

export const deleteElement = (scene: Scene, elementId: string, signal?: AbortSignal) =>
    post<WatchMapping>("delete-element", { scene, elementId }, signal);

export const setTextDefaults = (scene: Scene, defaults: TextDefaults, signal?: AbortSignal) =>
    post<WatchMapping>("text-defaults", { scene, defaults }, signal);

export const applyTextDefaults = (scene: Scene, elementId: string, signal?: AbortSignal) =>
    post<WatchMapping>("apply-text-defaults", { scene, elementId }, signal);

export const setTextPresets = (scene: Scene, presets: TextPreset[], defaultPresetId: string | null, signal?: AbortSignal) =>
    post<WatchMapping>("text-presets", { scene, presets, defaultPresetId }, signal);

export const applyTextPreset = (scene: Scene, elementId: string, presetId: string | null, signal?: AbortSignal) =>
    post<WatchMapping>("apply-text-preset", { scene, elementId, presetId }, signal);

export const setColourPresets = (scene: Scene, presets: ColourPreset[], signal?: AbortSignal) =>
    post<WatchMapping>("colour-presets", { scene, presets }, signal);

export const setElementColour = (scene: Scene, elementId: string, channel: "day" | "night", colour: number, signal?: AbortSignal) =>
    post<WatchMapping>("element-colour", { scene, elementId, channel, colour }, signal);

export const setElementColourPreset = (scene: Scene, elementId: string, channel: "day" | "night", presetId: string | null, signal?: AbortSignal) =>
    post<WatchMapping>("element-colour-preset", { scene, elementId, channel, presetId }, signal);

export const addDate = (scene: Scene, signal?: AbortSignal) =>
    post<WatchMapping>("add", { scene, source: "numericDate" }, signal);

export const setDateSource = (scene: Scene, elementId: string, source: DateSource, signal?: AbortSignal) =>
    post<WatchMapping>("date", { scene, elementId, source }, signal);

/** Rebuild editable text from source fonts before editing or exporting it. */
export const refreshFonts = (scene: Scene, signal?: AbortSignal) =>
    post<WatchMapping>("refresh-fonts", { scene }, signal);

export const fitElementBox = (scene: Scene, elementId: string, signal?: AbortSignal) =>
    post<WatchMapping>("fit-box", { scene, elementId }, signal);

export const addElement = (scene: Scene, source: ActivitySource | "time" | "numericDate" | "divider", signal?: AbortSignal, options?: ActivityAddOptions) =>
    post<WatchMapping>("add", { scene, source, ...(options ? { options } : {}) }, signal);
