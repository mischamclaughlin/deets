import { isEditableTextSource, type Scene } from "../../shared/scene.ts";
import { applyTextPreset, setElementColourPreset } from "./api.ts";

export type BatchPreset = { kind: "text"; presetId: string | null }
    | { kind: "colour"; channel: "day" | "night"; presetId: string | null };

/** Validate every element before publishing a single, atomic editor snapshot. */
export async function applyBatchPreset(scene: Scene, ids: readonly string[], change: BatchPreset, signal?: AbortSignal): Promise<Scene> {
    const selected = new Set(ids);
    const elements = scene.elements.filter((element) => selected.has(element.id) &&
        (change.kind !== "text" || (isEditableTextSource(element.source) && element.source !== "secondsRing")));
    let next = scene;
    for (const element of elements) {
        signal?.throwIfAborted();
        const mapped = change.kind === "text"
            ? await applyTextPreset(next, element.id, change.presetId, signal)
            : await setElementColourPreset(next, element.id, change.channel, change.presetId, signal);
        signal?.throwIfAborted();
        next = mapped.scene;
    }
    return next;
}
