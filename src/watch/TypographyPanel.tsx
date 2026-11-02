import { SliderValue } from "./SliderValue.tsx";
import { useEffect, useState } from "react";
import { inheritsFont, type Scene, type Typography } from "../../shared/scene.ts";
import { applyTextPreset, setFontInheritance, setTypography } from "./api.ts";
import { TextAlignmentControls } from "./TextAlignmentControls.tsx";
import { textPresets } from "./text-presets.ts";
import { typographyControls } from "./typography.ts";
import { FontPicker, type UploadedFont } from "./FontPicker.tsx";

interface Props {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
    uploads: UploadedFont[];
    onUpload: (font: UploadedFont) => void;
}

/** Every accepted edit comes back through the native glyph and layout validator. */
export function TypographyPanel({ scene, elementId, onSceneChange, uploads, onUpload }: Props) {
    const element = scene.elements.find((item) => item.id === elementId)!;
    const inherits = inheritsFont(element);
    const [pendingInheritance, setPendingInheritance] = useState<boolean>();
    const [draft, setDraft] = useState<Typography>(element.typography ?? {
        family: inherits ? scene.fontFamily ?? "time" : element.font === "widget" ? "widget" : "time",
        size: element.height,
        thickness: 0,
        width: 100,
        letterSpacing: 1,
    });
    const presets = textPresets(scene);
    const [pendingPreset, setPendingPreset] = useState<{ id: string | null }>();
    const applyingDefaults = pendingPreset !== undefined;
    const displayed = element.textPresetId ? element.typography! : draft;
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (pendingInheritance === undefined) return;
        const controller = new AbortController();
        void setFontInheritance(scene, elementId, pendingInheritance, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            setPendingInheritance(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setPendingInheritance(undefined);
            setError(failure instanceof Error ? failure.message : "The font choice could not be changed.");
        });
        return () => controller.abort();
    }, [pendingInheritance, scene, elementId, onSceneChange]);

    useEffect(() => {
        if (!dirty) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setBusy(true);
            void setTypography(scene, elementId, draft, controller.signal)
                .then((layout) => {
                    if (controller.signal.aborted) return;
                    onSceneChange(layout.scene);
                    setDirty(false);
                    setBusy(false);
                    setError(undefined);
                })
                .catch((failure) => {
                    if (controller.signal.aborted) return;
                    setError(failure instanceof Error ? failure.message : "The font could not be generated.");
                    setDirty(false);
                    setBusy(false);
                });
        }, 200);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [draft, dirty, scene, elementId, onSceneChange]);

    useEffect(() => {
        if (pendingPreset === undefined) return;
        const controller = new AbortController();
        void applyTextPreset(scene, elementId, pendingPreset.id, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            const changed = layout.scene.elements.find((item) => item.id === elementId)!;
            setDraft(changed.typography!);
            setDirty(false);
            setPendingPreset(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setPendingPreset(undefined);
            setError(failure instanceof Error ? failure.message : "The text preset could not be applied.");
        });
        return () => controller.abort();
    }, [pendingPreset, scene, elementId, onSceneChange]);

    function change(next: Typography) {
        setDraft(next);
        setDirty(true);
        setError(undefined);
    }

    return (
        <section aria-labelledby="typography-heading" className="typography-panel">
            <h2 id="typography-heading">Typography</h2>
            <TextAlignmentControls scene={scene} elementId={elementId} onSceneChange={onSceneChange} />
            {presets.length > 0 && <label className="font-choice">
                Text preset
                <select value={pendingPreset !== undefined ? pendingPreset.id ?? "" : element.textPresetId ?? ""}
                    disabled={applyingDefaults || busy || dirty || pendingInheritance !== undefined}
                    onChange={(event) => { setPendingPreset({ id: event.target.value || null }); setError(undefined); }}>
                    <option value="">Custom</option>
                    {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </select>
            </label>}
            <label className="font-choice">
                Font source
                <select value={inherits ? "inherit" : "custom"} disabled={applyingDefaults || busy || dirty || pendingInheritance !== undefined}
                    onChange={(event) => { setError(undefined); setPendingInheritance(event.target.value === "inherit"); }}>
                    <option value="inherit">Inherit watch font</option>
                    <option value="custom">Custom font</option>
                </select>
            </label>
            <FontPicker family={inherits ? scene.fontFamily ?? "time" : displayed.family}
                uploads={uploads} onUpload={onUpload} disabled={applyingDefaults || inherits || pendingInheritance !== undefined}
                onChange={(family) => change({ ...displayed, family })} />
            {inherits && <p className="control-hint">Using the shared watch font. Change it in Styles, or choose a custom font above.</p>}
            {element.textPresetId && <p className="control-hint">Typography follows the selected preset. Choose Custom to adjust these values independently.</p>}
            {typographyControls.map(({ key, label, min, max, unit }) => (
                <div className="typography-control" key={key}>
                    <div className="control-heading">
                        <label htmlFor={`type-${key}`}>{label}</label>
                        <SliderValue label={label} value={displayed[key]} min={min} max={max} unit={unit}
                            disabled={!!element.textPresetId || applyingDefaults || pendingInheritance !== undefined}
                            onChange={(value) => change({ ...displayed, [key]: value })} />
                    </div>
                    <input id={`type-${key}`} type="range" min={min} max={max} step={1} value={displayed[key]} disabled={!!element.textPresetId || applyingDefaults || pendingInheritance !== undefined}
                        onChange={(event) => change({ ...displayed, [key]: Number(event.target.value) })} />
                </div>
            ))}
            {(busy || applyingDefaults || pendingInheritance !== undefined || error) && (
                <p className="typography-status" role={error ? "alert" : "status"}>
                    {error ?? (applyingDefaults ? "Applying text preset…" : pendingInheritance !== undefined ? "Updating font choice…" : "Generating glyphs…")}
                </p>
            )}
        </section>
    );
}
