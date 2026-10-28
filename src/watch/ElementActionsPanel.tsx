import { useEffect, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import { copyElement, deleteElement } from "./api.ts";

export function ElementActionsPanel({ scene, elementId, onSceneChange, onSelect }: {
    scene: Scene;
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
    return <section aria-labelledby="element-actions-heading">
        <h2 id="element-actions-heading">Element</h2>
        <button type="button" className="add-element" disabled={action !== undefined || scene.elements.length >= 40}
            onClick={() => { setError(undefined); setAction("copy"); }}>
            {action === "copy" ? "Copying…" : "Copy"}
        </button>
        <button type="button" className="add-element" disabled={action !== undefined}
            onClick={() => { setError(undefined); setAction("delete"); }}>
            {action === "delete" ? "Deleting…" : "Delete"}
        </button>
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
