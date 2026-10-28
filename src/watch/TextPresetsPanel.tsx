import { useEffect, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import { setTextPresets } from "./api.ts";
import { typographyControls } from "./typography.ts";
import { defaultTextPresetId, textPresets } from "./text-presets.ts";

export function TextPresetsPanel({ scene, onSceneChange }: { scene: Scene; onSceneChange: (scene: Scene) => void }) {
    const [draft, setDraft] = useState(() => ({ presets: textPresets(scene), defaultPresetId: defaultTextPresetId(scene) }));
    const [selectedId, setSelectedId] = useState(draft.defaultPresetId);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string>();
    const selected = draft.presets.find((preset) => preset.id === selectedId)!;

    useEffect(() => {
        if (!saving) return;
        const controller = new AbortController();
        void setTextPresets(scene, draft.presets, draft.defaultPresetId, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            setDraft({ presets: textPresets(layout.scene), defaultPresetId: defaultTextPresetId(layout.scene) });
            setDirty(false);
            setSaving(false);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setSaving(false);
            setError(failure instanceof Error ? failure.message : "The text presets could not be saved.");
        });
        return () => controller.abort();
    }, [draft, saving, scene, onSceneChange]);

    function edit(changes: Partial<typeof selected>) {
        setDraft({ ...draft, presets: draft.presets.map((preset) => preset.id === selectedId ? { ...preset, ...changes } : preset) });
        setDirty(true);
        setError(undefined);
    }

    return <section className="typography-panel" aria-labelledby="text-defaults-heading">
        <h2 id="text-defaults-heading">Text presets</h2>
        <label className="font-choice">
            Preset
            <select value={selectedId} disabled={saving} onChange={(event) => setSelectedId(event.target.value)}>
                {draft.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
        </label>
        <label className="font-choice">
            Name
            <input type="text" value={selected.name} maxLength={40} disabled={saving}
                onChange={(event) => edit({ name: event.target.value })} />
        </label>
        {typographyControls.map(({ key, label, min, max, unit }) => <div className="typography-control" key={key}>
            <div className="control-heading">
                <label htmlFor={`default-type-${key}`}>{label}</label>
                <output htmlFor={`default-type-${key}`}>{selected[key]}{unit === "%" ? "%" : ` ${unit}`}</output>
            </div>
            <input id={`default-type-${key}`} type="range" min={min} max={max} step={1} value={selected[key]} disabled={saving}
                onChange={(event) => edit({ [key]: Number(event.target.value) })} />
        </div>)}
        <button type="button" className="snap-button" disabled={saving} aria-pressed={selectedId === draft.defaultPresetId}
            onClick={() => { setDraft({ ...draft, defaultPresetId: selectedId }); setDirty(true); setError(undefined); }}>
            Use for new text
        </button>
        <button type="button" className="add-element" disabled={saving || draft.presets.length >= 20} onClick={() => {
            let index = 1;
            while (draft.presets.some((preset) => preset.id === `preset-${index}`)) index++;
            const id = `preset-${index}`;
            let name = "New preset";
            let suffix = 2;
            while (draft.presets.some((preset) => preset.name.trim().toLowerCase() === name.toLowerCase())) name = `New preset ${suffix++}`;
            setDraft({ ...draft, presets: [...draft.presets, { ...selected, id, name }] });
            setSelectedId(id);
            setDirty(true);
            setError(undefined);
        }}>New preset</button>
        <button type="button" className="add-element" disabled={saving || draft.presets.length <= 1} onClick={() => {
            const presets = draft.presets.filter((preset) => preset.id !== selectedId);
            setDraft({ presets, defaultPresetId: draft.defaultPresetId === selectedId ? presets[0].id : draft.defaultPresetId });
            setSelectedId(presets[0].id);
            setDirty(true);
            setError(undefined);
        }}>Delete preset</button>
        <button type="button" className="add-element" disabled={!dirty || saving} onClick={() => setSaving(true)}>
            {saving ? "Saving…" : "Save presets"}
        </button>
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
