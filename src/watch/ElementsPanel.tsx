import { useEffect, useState } from "react";
import { addTime } from "./api.ts";
import { isClockSource, type Scene } from "../../shared/scene.ts";
import { clockModes } from "./clock.ts";

interface Props {
    scene: Scene;
    selectedId?: string;
    onSelect: (id: string) => void;
    onSceneChange: (scene: Scene) => void;
}

export function ElementsPanel({ scene, selectedId, onSelect, onSceneChange }: Props) {
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
        <section className="elements-panel" aria-labelledby="elements-heading">
            <h2 id="elements-heading">Elements</h2>
            <button type="button" className="add-element" disabled={adding || scene.elements.length >= 40}
                onClick={() => { setError(undefined); setAdding(true); }} aria-label="Add time element">
                {adding ? "Adding…" : "+ Time"}
            </button>
            <ul className="element-list">
                {scene.elements.map((element, index) => (
                    <li key={element.id}>
                        <button type="button" className="element-choice" aria-pressed={selectedId === element.id}
                            onClick={() => onSelect(element.id)}>
                            <span>{isClockSource(element.source) ? `Time ${scene.elements.slice(0, index + 1).filter((item) => isClockSource(item.source)).length}` : element.id}</span>
                            {isClockSource(element.source) && (
                                <span className="element-format">{clockModes.find((mode) => mode.source === element.source)?.label}</span>
                            )}
                        </button>
                    </li>
                ))}
            </ul>
            {error && <p className="typography-status" role="alert">{error}</p>}
        </section>
    );
}
