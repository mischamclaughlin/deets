import type { Scene, TextPreset } from "../../shared/scene.ts";

/** Keep in-memory designs made before named presets editable. */
export function textPresets(scene: Scene): TextPreset[] {
    return scene.textPresets ?? [];
}

export function defaultTextPresetId(scene: Scene): string | null {
    return scene.defaultTextPresetId ?? textPresets(scene)[0]?.id ?? null;
}
