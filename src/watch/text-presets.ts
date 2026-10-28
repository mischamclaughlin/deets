import type { Scene, TextPreset } from "../../shared/scene.ts";

/** Keep in-memory designs made before named presets editable. */
export function textPresets(scene: Scene): TextPreset[] {
    return scene.textPresets ?? [
        { id: "time", name: "Time", ...(scene.textDefaults ?? { size: 88, thickness: 0, width: 100, letterSpacing: 1 }) },
        { id: "widgets", name: "Widgets", size: 26, thickness: 0, width: 100, letterSpacing: 1 },
    ];
}

export function defaultTextPresetId(scene: Scene): string {
    return scene.defaultTextPresetId ?? textPresets(scene)[0].id;
}
