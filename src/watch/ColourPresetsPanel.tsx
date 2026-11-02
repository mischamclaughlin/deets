import { elementPresetIds } from "./preset-selection.ts";
import { usePresetSelection } from "./usePresetSelection.ts";
import { useEffect, useState } from "react";
import type { ColourPreset, Scene } from "../../shared/scene.ts";
import { setColourPresets } from "./api.ts";
import { ColourInput } from "./ColourInput.tsx";

export function ColourPresetsPanel({ scene, elementId, onSceneChange }: { scene: Scene; elementId?: string; onSceneChange: (scene: Scene) => void }) {
    const [pendingPresets, setPresets] = useState(scene.colourPresets ?? []);
    const [dirty, setDirty] = useState(false);
    const presets = dirty ? pendingPresets : scene.colourPresets ?? [];
    const [selectedId, setSelectedId] = usePresetSelection(elementId, elementPresetIds(scene, elementId).colour, presets[0]?.id);
    const [error, setError] = useState<string>();
    const selected = presets.find((preset) => preset.id === selectedId) ?? presets[0];
    useEffect(() => {
        if (!dirty) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            void setColourPresets(scene, pendingPresets, controller.signal).then((layout) => {
                if (controller.signal.aborted) return;
                onSceneChange(layout.scene);
                setDirty(false);
                setError(undefined);
            }).catch((failure) => {
                if (controller.signal.aborted) return;
                setDirty(false);
                setError(failure instanceof Error ? failure.message : "The colour preset could not be updated.");
            });
        }, 200);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [dirty, pendingPresets, scene, onSceneChange]);
    function edit(changes: Partial<ColourPreset>) {
        setPresets(presets.map((preset) => preset.id === selected?.id ? { ...preset, ...changes } : preset));
        setDirty(true);
        setError(undefined);
    }
    return <section aria-labelledby="colour-presets-heading">
        <h2 id="colour-presets-heading">Colour presets</h2>
        {!selected && <p className="preset-empty">Save a colour to update every linked element together.</p>}
        {selected && <>
            <label className="font-choice">Preset
                <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
                    {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </select>
            </label>
            <label className="font-choice">Name
                <input type="text" value={selected.name} maxLength={40} onChange={(event) => edit({ name: event.target.value })} />
            </label>
            <ColourInput label="Colour" value={selected.colour} onChange={(colour) => edit({ colour })} />
        </>}
        <button type="button" className="add-element" disabled={presets.length >= 20} onClick={() => {
            let index = 1;
            while (presets.some((preset) => preset.id === `colour-${index}`)) index++;
            const id = `colour-${index}`;
            let name = "New colour";
            let suffix = 2;
            while (presets.some((preset) => preset.name.trim().toLowerCase() === name.toLowerCase())) name = `New colour ${suffix++}`;
            setPresets([...presets, { id, name, colour: selected?.colour ?? 0xffffff }]);
            setSelectedId(id);
            setDirty(true);
            setError(undefined);
        }}>New preset</button>
        <button type="button" className="add-element preset-delete" disabled={!selected} onClick={() => {
            const remaining = presets.filter((preset) => preset.id !== selected?.id);
            setPresets(remaining);
            setSelectedId(remaining[0]?.id);
            setDirty(true);
            setError(undefined);
        }}>Delete colour preset</button>
        {dirty && !error && <p className="typography-status" role="status">Updating colour preset…</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
