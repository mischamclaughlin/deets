import { SliderValue } from "./SliderValue.tsx";
import { useEffect, useState } from "react";
import type { Scene, TextPreset } from "../../shared/scene.ts";
import { setTextPresets } from "./api.ts";
import { typographyControls } from "./typography.ts";
import { defaultTextPresetId, textPresets } from "./text-presets.ts";

export function TextPresetsPanel({ scene, onSceneChange }: { scene: Scene; onSceneChange: (scene: Scene) => void }) {
    const [draft, setDraft] = useState(() => ({ presets: textPresets(scene), defaultPresetId: defaultTextPresetId(scene) }));
    const [selectedId, setSelectedId] = useState(draft.defaultPresetId);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string>();
    const selected = draft.presets.find((preset) => preset.id === selectedId);

    useEffect(() => {
        if (!dirty) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setSaving(true);
            void setTextPresets(scene, draft.presets, draft.defaultPresetId, controller.signal).then((layout) => {
                if (controller.signal.aborted) return;
                onSceneChange(layout.scene);
                setDirty(false);
                setSaving(false);
                setError(undefined);
            }).catch((failure) => {
                if (controller.signal.aborted) return;
                setDirty(false);
                setSaving(false);
                setError(failure instanceof Error ? failure.message : "The text preset could not be updated.");
            });
        }, 200);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [draft, dirty, scene, onSceneChange]);

    function edit(changes: Partial<TextPreset>) {
        setDraft({ ...draft, presets: draft.presets.map((preset) => preset.id === selectedId ? { ...preset, ...changes } : preset) });
        setDirty(true);
        setError(undefined);
    }

    return <section className="typography-panel" aria-labelledby="text-defaults-heading">
        <h2 id="text-defaults-heading">Text presets</h2>
        {!selected && <p className="preset-empty">Save a type style to keep size and spacing consistent across elements.</p>}
        {selected && <>
        <label className="font-choice">
            Preset
            <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
                {draft.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
        </label>
        <label className="font-choice">
            Name
            <input type="text" value={selected.name} maxLength={40}
                onChange={(event) => edit({ name: event.target.value })} />
        </label>
        {typographyControls.map(({ key, label, min, max, unit }) => <div className="typography-control" key={key}>
            <div className="control-heading">
                <label htmlFor={`default-type-${key}`}>{label}</label>
                <SliderValue label={label} value={selected[key]} min={min} max={max} unit={unit}
                    onChange={(value) => edit({ [key]: value })} />
            </div>
            <input id={`default-type-${key}`} type="range" min={min} max={max} step={1} value={selected[key]}
                onChange={(event) => edit({ [key]: Number(event.target.value) })} />
        </div>)}
        </>}
        <button type="button" className="add-element" disabled={draft.presets.length >= 20} onClick={() => {
            let index = 1;
            while (draft.presets.some((preset) => preset.id === `preset-${index}`)) index++;
            const id = `preset-${index}`;
            let name = "New preset";
            let suffix = 2;
            while (draft.presets.some((preset) => preset.name.trim().toLowerCase() === name.toLowerCase())) name = `New preset ${suffix++}`;
            setDraft({ ...draft, presets: [...draft.presets, { ...(selected ?? scene.textDefaults ?? { size: 88, thickness: 0, width: 100, letterSpacing: 1 }), id, name }], defaultPresetId: draft.defaultPresetId ?? id });
            setSelectedId(id);
            setDirty(true);
            setError(undefined);
        }}>New preset</button>
        <button type="button" className="add-element preset-delete" disabled={!selected} onClick={() => {
            const presets = draft.presets.filter((preset) => preset.id !== selectedId);
            setDraft({ presets, defaultPresetId: draft.defaultPresetId === selectedId ? presets[0]?.id ?? null : draft.defaultPresetId });
            setSelectedId(presets[0]?.id ?? null);
            setDirty(true);
            setError(undefined);
        }}>Delete preset</button>
        {saving && !error && <p className="typography-status" role="status">Updating preset…</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
