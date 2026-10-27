import { useEffect, useState } from "react";
import type { Scene, Typography } from "../../shared/scene.ts";
import { setFontInheritance, setTypography } from "./api.ts";
import { FontPicker, type UploadedFont } from "./FontPicker.tsx";

interface Props {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
    uploads: UploadedFont[];
    onUpload: (font: UploadedFont) => void;
}

const controls = [
    { key: "size", label: "Size", min: 12, max: 160, unit: "px" },
    { key: "thickness", label: "Thickness", min: -2, max: 6, unit: "px" },
    { key: "width", label: "Width", min: 50, max: 200, unit: "%" },
    { key: "letterSpacing", label: "Letter spacing", min: -4, max: 24, unit: "px" },
] as const;

/** Every accepted edit comes back through the native glyph and layout validator. */
export function TypographyPanel({ scene, elementId, onSceneChange, uploads, onUpload }: Props) {
    const element = scene.elements.find((item) => item.id === elementId)!;
    const inherits = element.inheritFont ?? !element.typography;
    const [pendingInheritance, setPendingInheritance] = useState<boolean>();
    const [draft, setDraft] = useState<Typography>(element.typography ?? {
        family: inherits ? scene.fontFamily ?? "time" : element.font === "widget" ? "widget" : "time",
        size: element.height,
        thickness: 0,
        width: 100,
        letterSpacing: 1,
    });
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

    function change(next: Typography) {
        setDraft(next);
        setDirty(true);
        setError(undefined);
    }

    return (
        <section aria-labelledby="typography-heading" className="typography-panel">
            <h2 id="typography-heading">Typography</h2>
            <label className="font-choice">
                Font source
                <select value={inherits ? "inherit" : "custom"} disabled={busy || dirty || pendingInheritance !== undefined}
                    onChange={(event) => { setError(undefined); setPendingInheritance(event.target.value === "inherit"); }}>
                    <option value="inherit">Inherit watch font</option>
                    <option value="custom">Custom font</option>
                </select>
            </label>
            <FontPicker family={inherits ? scene.fontFamily ?? "time" : draft.family}
                uploads={uploads} onUpload={onUpload} disabled={inherits || pendingInheritance !== undefined}
                onChange={(family) => change({ ...draft, family })} />
            {controls.map(({ key, label, min, max, unit }) => (
                <div className="typography-control" key={key}>
                    <div className="control-heading">
                        <label htmlFor={`type-${key}`}>{label}</label>
                        <output htmlFor={`type-${key}`}>{draft[key]}{unit === "%" ? "%" : ` ${unit}`}</output>
                    </div>
                    <input id={`type-${key}`} type="range" min={min} max={max} step={1} value={draft[key]} disabled={pendingInheritance !== undefined}
                        onChange={(event) => change({ ...draft, [key]: Number(event.target.value) })} />
                </div>
            ))}
            {(busy || pendingInheritance !== undefined || error) && (
                <p className="typography-status" role={error ? "alert" : "status"}>
                    {error ?? (pendingInheritance !== undefined ? "Updating font choice…" : "Generating glyphs…")}
                </p>
            )}
        </section>
    );
}
