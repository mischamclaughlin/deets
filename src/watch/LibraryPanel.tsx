import { ActivityLibrary } from "./ActivityLibrary.tsx";
import { useEffect, useState } from "react";
import type { ActivitySource, Scene } from "../../shared/scene.ts";
import { addElement } from "./api.ts";

interface Props {
    scene: Scene;
    onSelect: (id: string) => void;
    onSceneChange: (scene: Scene) => void;
}

export function LibraryPanel({ scene, onSelect, onSceneChange }: Props) {
    const [adding, setAdding] = useState<ActivitySource | "time" | "divider">();
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (!adding) return;
        const controller = new AbortController();
        void addElement(scene, adding, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            onSelect(layout.scene.elements[layout.scene.elements.length - 1].id);
            setAdding(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setAdding(undefined);
            setError(failure instanceof Error ? failure.message : "The element could not be added.");
        });
        return () => controller.abort();
    }, [adding, scene, onSceneChange, onSelect]);
    return (
        <section aria-labelledby="library-heading">
            <h2 id="library-heading">Library</h2>
            {(["time", "divider"] as const).map((source) => (
                <button key={source} type="button" className="add-element" disabled={adding !== undefined || scene.elements.length >= 40}
                    onClick={() => { setError(undefined); setAdding(source); }} aria-label={`Add ${source} element`}>
                    {adding === source ? "Adding…" : source === "time" ? "+ Time" : "+ Divider"}
                </button>
            ))}
            {error && <p className="typography-status" role="alert">{error}</p>}
            <ActivityLibrary adding={adding} disabled={adding !== undefined || scene.elements.length >= 40}
                onAdd={(source) => { setError(undefined); setAdding(source); }} />
        </section>
    );
}
