import { useEffect, useRef, useState } from "react";
import type { Scene, Typography } from "../../shared/scene.ts";
import { setTypography, uploadFont } from "./api.ts";

interface Props {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}

const controls = [
    { key: "size", label: "Size", min: 12, max: 160, unit: "px" },
    { key: "thickness", label: "Thickness", min: -2, max: 6, unit: "px" },
    { key: "width", label: "Width", min: 50, max: 200, unit: "%" },
    { key: "letterSpacing", label: "Letter spacing", min: -4, max: 24, unit: "px" },
] as const;

/** Every accepted edit comes back through the native glyph and layout validator. */
export function TypographyPanel({ scene, elementId, onSceneChange }: Props) {
    const element = scene.elements.find((item) => item.id === elementId)!;
    const [draft, setDraft] = useState<Typography>(element.typography ?? {
        family: element.font === "widget" ? "widget" : "time",
        size: element.height,
        thickness: 0,
        width: 100,
        letterSpacing: 1,
    });
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string>();
    const [uploads, setUploads] = useState<Array<{ id: string; name: string }>>([]);
    const fileInput = useRef<HTMLInputElement>(null);
    const uploadRequest = useRef(0);

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
                Font
                <select value={draft.family} onChange={(event) => change({ ...draft, family: event.target.value })}>
                    <option value="time">JetBrains Mono Regular</option>
                    <option value="widget">JetBrains Mono NL Thin</option>
                    {draft.family.startsWith("upload:") && !uploads.some((font) => font.id === draft.family) && (
                        <option value={draft.family}>Uploaded font</option>
                    )}
                    {uploads.map((font) => <option key={font.id} value={font.id}>{font.name}</option>)}
                </select>
            </label>
            <input
                ref={fileInput}
                type="file"
                accept=".ttf,.otf"
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    const request = ++uploadRequest.current;
                    setUploading(true);
                    setError(undefined);
                    void uploadFont(file).then((font) => {
                        if (request !== uploadRequest.current) return;
                        setUploads((current) => [...current.filter((item) => item.id !== font.id), font]);
                        setDraft((current) => ({ ...current, family: font.id }));
                        setDirty(true);
                    }).catch((failure) => {
                        if (request === uploadRequest.current)
                            setError(failure instanceof Error ? failure.message : "The font could not be uploaded.");
                    }).finally(() => { if (request === uploadRequest.current) setUploading(false); });
                }}
            />
            <button className="font-upload" type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? "Uploading…" : "Upload font…"}
            </button>
            {controls.map(({ key, label, min, max, unit }) => (
                <div className="typography-control" key={key}>
                    <div className="control-heading">
                        <label htmlFor={`type-${key}`}>{label}</label>
                        <output htmlFor={`type-${key}`}>{draft[key]}{unit === "%" ? "%" : ` ${unit}`}</output>
                    </div>
                    <input id={`type-${key}`} type="range" min={min} max={max} step={1} value={draft[key]}
                        onChange={(event) => change({ ...draft, [key]: Number(event.target.value) })} />
                </div>
            ))}
            {(busy || uploading || error) && (
                <p className="typography-status" role={error ? "alert" : "status"}>
                    {error ?? (uploading ? "Uploading font…" : "Generating glyphs…")}
                </p>
            )}
        </section>
    );
}
