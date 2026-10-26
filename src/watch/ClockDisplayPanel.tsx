import { useEffect, useState } from "react";
import type { ClockSource, Scene } from "../../shared/scene.ts";
import { setClockSource } from "./api.ts";
import { clockModes } from "./clock.ts";

interface Props {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}

export function ClockDisplayPanel({ scene, elementId, onSceneChange }: Props) {
    const selected = scene.elements.find((element) => element.id === elementId);
    const [requested, setRequested] = useState<ClockSource>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        if (!requested) return;
        const controller = new AbortController();
        void setClockSource(scene, elementId, requested, controller.signal)
            .then((layout) => {
                if (controller.signal.aborted) return;
                onSceneChange(layout.scene);
                setRequested(undefined);
                setError(undefined);
            })
            .catch((failure) => {
                if (controller.signal.aborted) return;
                setError(failure instanceof Error ? failure.message : "The time display could not change.");
                setRequested(undefined);
            });
        return () => controller.abort();
    }, [scene, elementId, requested, onSceneChange]);

    return (
        <section aria-labelledby="clock-display-heading">
            <h2 id="clock-display-heading">Time</h2>
            <div className="clock-modes" role="group" aria-label="Time display">
                {clockModes.map((mode) => (
                    <button key={mode.source} type="button" aria-label={mode.name}
                        aria-pressed={(requested ?? selected?.source) === mode.source}
                        onClick={() => {
                            if (selected?.source === mode.source && !requested) return;
                            setError(undefined);
                            setRequested(mode.source);
                        }}>
                        {mode.label}
                    </button>
                ))}
            </div>
            {requested && <p className="typography-status" role="status">Updating time…</p>}
            {error && <p className="typography-status" role="alert">{error}</p>}
        </section>
    );
}
