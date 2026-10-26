import { useEffect, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import { addTime } from "./api.ts";

interface Props {
    scene: Scene;
    onSelect: (id: string) => void;
    onSceneChange: (scene: Scene) => void;
}

export function LibraryPanel({ scene, onSelect, onSceneChange }: Props) {
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (!adding) return;
        const controller = new AbortController();
        void addTime(scene, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            onSelect(layout.scene.elements[layout.scene.elements.length - 1].id);
            setAdding(false);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setAdding(false);
            setError(failure instanceof Error ? failure.message : "The time element could not be added.");
        });
        return () => controller.abort();
    }, [adding, scene, onSceneChange, onSelect]);
    return (
        <section aria-labelledby="library-heading">
            <h2 id="library-heading">Library</h2>
            <button type="button" className="add-element" disabled={adding || scene.elements.length >= 40}
                onClick={() => { setError(undefined); setAdding(true); }} aria-label="Add time element">
                {adding ? "Adding…" : "+ Time"}
            </button>
            {error && <p className="typography-status" role="alert">{error}</p>}
        </section>
    );
}
