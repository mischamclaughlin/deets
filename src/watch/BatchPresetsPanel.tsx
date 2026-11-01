import { useEffect, useState } from "react";
import { isEditableTextSource, type Scene } from "../../shared/scene.ts";
import { applyBatchPreset, type BatchPreset } from "./batch-presets.ts";
import { textPresets } from "./text-presets.ts";

export function BatchPresetsPanel({ scene, ids, onSceneChange }: {
    scene: Scene; ids: string[]; onSceneChange: (scene: Scene) => void;
}) {
    const [pending, setPending] = useState<BatchPreset>();
    const [error, setError] = useState<string>();
    const selected = scene.elements.filter((element) => ids.includes(element.id));
    const text = selected.filter((element) => isEditableTextSource(element.source) && element.source !== "secondsRing");
    useEffect(() => {
        if (!pending) return;
        const controller = new AbortController();
        void applyBatchPreset(scene, ids, pending, controller.signal).then((next) => {
            if (controller.signal.aborted) return;
            setPending(undefined);
            onSceneChange(next);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setPending(undefined);
            setError(failure instanceof Error ? failure.message : "The presets could not be applied.");
        });
        return () => controller.abort();
    }, [scene, ids, pending, onSceneChange]);
    function choose(change: BatchPreset) { setError(undefined); setPending(change); }
    const presets = textPresets(scene);
    return <section aria-labelledby="batch-presets-heading">
        <h2 id="batch-presets-heading">{selected.length} elements selected</h2>
        <p className="control-hint">Shift-click to add or remove elements.</p>
        {text.length > 0 && presets.length > 0 && <label className="font-choice">Text preset · {text.length} text elements
            <select value="" disabled={!!pending} onChange={(event) => choose({ kind: "text", presetId: event.target.value === "__custom__" ? null : event.target.value })}>
                <option value="" disabled>Choose preset…</option>
                <option value="__custom__">Custom (unlink)</option>
                {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
        </label>}
        {(["day", "night"] as const).map((channel) => <label key={channel} className="font-choice">
            {channel === "day" ? "Day" : "Night"} colour preset
            <select value="" disabled={!!pending || !scene.colourPresets?.length}
                onChange={(event) => choose({ kind: "colour", channel, presetId: event.target.value === "__custom__" ? null : event.target.value })}>
                <option value="" disabled>Choose preset…</option>
                <option value="__custom__">Custom (unlink)</option>
                {scene.colourPresets?.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
        </label>)}
        {!presets.length && !scene.colourPresets?.length && <p className="control-hint">Create presets in Styles, then apply them here.</p>}
        {pending && <p className="typography-status" role="status">Applying preset…</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
