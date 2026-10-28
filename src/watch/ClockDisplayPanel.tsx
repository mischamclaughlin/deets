import { useEffect, useState } from "react";
import type { ClockSource, Scene } from "../../shared/scene.ts";
import { setClockSource, setSecondsSize } from "./api.ts";
import { clockModes } from "./clock.ts";

interface Props {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}

export function ClockDisplayPanel({ scene, elementId, onSceneChange }: Props) {
    const selected = scene.elements.find((element) => element.id === elementId);
    const [requested, setRequested] = useState<ClockSource>();
    const [requestedSecondsSize, setRequestedSecondsSize] = useState<"full" | "half">();
    const [error, setError] = useState<string>();

    useEffect(() => {
        if (!requested) return;
        const controller = new AbortController();
        void setClockSource(scene, elementId, requested, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            setRequested(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setRequested(undefined);
            setError(failure instanceof Error ? failure.message : "The time display could not change.");
        });
        return () => controller.abort();
    }, [scene, elementId, requested, onSceneChange]);

    useEffect(() => {
        if (requestedSecondsSize === undefined) return;
        const controller = new AbortController();
        void setSecondsSize(scene, elementId, requestedSecondsSize, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            setRequestedSecondsSize(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setRequestedSecondsSize(undefined);
            setError(failure instanceof Error ? failure.message : "The seconds size could not change.");
        });
        return () => controller.abort();
    }, [requestedSecondsSize, scene, elementId, onSceneChange]);

    return (
        <section aria-labelledby="clock-display-heading">
            <h2 id="clock-display-heading">Time</h2>
            <div className="clock-modes" role="group" aria-label="Time display">
                {clockModes.map((mode) => (
                    <button key={mode.source} type="button" aria-label={mode.name} disabled={requestedSecondsSize !== undefined}
                        aria-pressed={(requested ?? selected?.source) === mode.source || (mode.source === "seconds" && (requested ?? selected?.source) === "secondsRing")}
                        onClick={() => {
                            if (!requested && (selected?.source === mode.source || (mode.source === "seconds" && selected?.source === "secondsRing"))) return;
                            setError(undefined);
                            setRequested(mode.source);
                        }}>
                        {mode.label}
                    </button>
                ))}
            </div>
            {selected?.source === "timeSeconds" && (
                <label className="font-choice">
                    Seconds size
                    <select value={requestedSecondsSize ?? selected.secondsSize ?? "full"}
                        disabled={requested !== undefined || requestedSecondsSize !== undefined}
                        onChange={(event) => {
                            setError(undefined);
                            setRequestedSecondsSize(event.target.value as "full" | "half");
                        }}>
                        <option value="full">Full size</option>
                        <option value="half">Half size</option>
                    </select>
                </label>
            )}
            {(selected?.source === "seconds" || selected?.source === "secondsRing") && (
                <label className="font-choice">
                    Seconds display
                    <select value={requested ?? selected.source} disabled={requested !== undefined}
                        onChange={(event) => {
                            setError(undefined);
                            setRequested(event.target.value as "seconds" | "secondsRing");
                        }}>
                        <option value="seconds">Digits</option>
                        <option value="secondsRing">Outer ring</option>
                    </select>
                </label>
            )}
            {selected?.source === "secondsRing" && (
                <div role="group" aria-label="Seconds tick geometry">
                    {([
                        { key: "ringTicksToCircumference", label: "Align tick tips to clearance" },
                        { key: "ringTicksStretchToCircumference", label: "Stretch ticks to clearance" },
                    ] as const).map(({ key, label }) => (
                        <button key={key} type="button" className="snap-button" aria-pressed={selected[key] ?? false}
                            disabled={requested !== undefined}
                            onClick={() => onSceneChange({
                                ...scene,
                                elements: scene.elements.map((element) => element.id === elementId
                                    ? { ...element, ringTicksToCircumference: false, ringTicksStretchToCircumference: false, [key]: !element[key] }
                                    : element),
                            })}>
                            {label}
                        </button>
                    ))}
                </div>
            )}
            {(requested || requestedSecondsSize) && <p className="typography-status" role="status">Updating time…</p>}
            {error && <p className="typography-status" role="alert">{error}</p>}
        </section>
    );
}
