import { useEffect, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import { activityName } from "./element-name.ts";
import { copyElement, deleteElement } from "./api.ts";
import { LayerPanel } from "./LayerPanel.tsx";

export function ElementActionsPanel({ scene, elementId, onSceneChange, onSelect, label }: {
    scene: Scene;
    label: string;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
    onSelect: (id: string | undefined) => void;
}) {
    const [action, setAction] = useState<"copy" | "delete">();
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (action === undefined) return;
        const controller = new AbortController();
        void (action === "copy" ? copyElement : deleteElement)(scene, elementId, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            const index = scene.elements.findIndex((element) => element.id === elementId);
            const selected = action === "copy"
                ? layout.scene.elements.find((element) => !scene.elements.some((original) => original.id === element.id))
                : layout.scene.elements[Math.min(index, layout.scene.elements.length - 1)];
            onSceneChange(layout.scene);
            onSelect(selected?.id);
            setAction(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setAction(undefined);
            setError(failure instanceof Error ? failure.message : "The element could not be changed.");
        });
        return () => controller.abort();
    }, [action, scene, elementId, onSceneChange, onSelect]);
    return <section className="selection-heading" aria-labelledby="element-actions-heading">
        <div className="selection-heading-row">
            <h2 id="element-actions-heading">{activityName(scene, elementId) ?? label}</h2>
            <div className="element-actions" role="group" aria-label="Element actions" aria-busy={action !== undefined}>
                <button type="button" className="element-action" disabled={action !== undefined || scene.elements.length >= 40}
                    aria-label={action === "copy" ? "Duplicating element…" : "Duplicate element"} title="Duplicate element"
                    onClick={() => { setError(undefined); setAction("copy"); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                        <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" />
                    </svg>
                </button>
                <button type="button" className="element-action element-action-danger" disabled={action !== undefined}
                    aria-label={action === "delete" ? "Deleting element…" : "Delete element"} title="Delete element"
                    onClick={() => { setError(undefined); setAction("delete"); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
                    </svg>
                </button>
            </div>
        </div>
        <LayerPanel scene={scene} elementId={elementId} disabled={action !== undefined} onSceneChange={onSceneChange} />
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
