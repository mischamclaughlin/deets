import { useEffect, useState } from "react";
import type { DateSource, Scene } from "../../shared/scene.ts";
import { setDateSource } from "./api.ts";
import { dateModes } from "./date.ts";

export function DateDisplayPanel({ scene, elementId, onSceneChange }: {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}) {
    const selected = scene.elements.find((element) => element.id === elementId)!;
    const [requested, setRequested] = useState<DateSource>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        if (!requested) return;
        const controller = new AbortController();
        void setDateSource(scene, elementId, requested, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            setRequested(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setRequested(undefined);
            setError(failure instanceof Error ? failure.message : "The date display could not change.");
        });
        return () => controller.abort();
    }, [requested, scene, elementId, onSceneChange]);

    return <section aria-labelledby="date-display-heading">
        <h2 id="date-display-heading">Date</h2>
        <div className="clock-modes" role="group" aria-label="Date display">
            {dateModes.map((mode) => (
                <button key={mode.source} type="button" aria-label={mode.name}
                    aria-pressed={(requested ?? selected.source) === mode.source}
                    disabled={requested !== undefined}
                    onClick={() => {
                        if (selected.source === mode.source) return;
                        setError(undefined);
                        setRequested(mode.source);
                    }}>
                    {mode.label}
                </button>
            ))}
        </div>
        {requested && <p className="typography-status" role="status">Updating date…</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
