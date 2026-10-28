import { useEffect, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import { setElementColour, setElementColourPreset } from "./api.ts";
import { ColourInput } from "./ColourInput.tsx";

type Channel = "day" | "night";
type Change = { channel: Channel } & ({ kind: "colour"; colour: number } | { kind: "preset"; presetId: string | null });

export function ElementColourPanel({ scene, elementId, onSceneChange }: {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}) {
    const element = scene.elements.find((item) => item.id === elementId)!;
    const [pending, setPending] = useState<Change[]>([]);
    const [error, setError] = useState<string>();
    function queue(change: Change) {
        setPending((current) => [...current.filter((item) => item.channel !== change.channel), change]);
        setError(undefined);
    }
    useEffect(() => {
        const change = pending[0];
        if (!change) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            const request = change.kind === "colour"
                ? setElementColour(scene, elementId, change.channel, change.colour, controller.signal)
                : setElementColourPreset(scene, elementId, change.channel, change.presetId, controller.signal);
            void request.then((layout) => {
                if (controller.signal.aborted) return;
                onSceneChange(layout.scene);
                setPending((current) => current.filter((item) => item !== change));
                setError(undefined);
            }).catch((failure) => {
                if (controller.signal.aborted) return;
                setPending((current) => current.filter((item) => item !== change));
                setError(failure instanceof Error ? failure.message : "The element colour could not change.");
            });
        }, 150);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [pending, scene, elementId, onSceneChange]);
    return <section aria-labelledby="element-colours-heading">
        <h2 id="element-colours-heading">Colours</h2>
        {(["day", "night"] as const).map((channel) => {
            const change = pending.find((item) => item.channel === channel);
            const savedPreset = channel === "day" ? element.colourPresetId : element.nightColourPresetId;
            const presetId = change ? change.kind === "preset" ? change.presetId : null : savedPreset;
            const preset = scene.colourPresets?.find((item) => item.id === presetId);
            const colour = change?.kind === "colour" ? change.colour
                : preset?.colour ?? (channel === "day" ? element.colour : element.nightColour);
            return <div key={channel}>
                {!!scene.colourPresets?.length && <label className="font-choice">
                    {channel === "day" ? "Day preset" : "Night preset"}
                    <select value={presetId ?? ""} onChange={(event) => queue({ channel, kind: "preset", presetId: event.target.value || null })}>
                        <option value="">Custom</option>
                        {scene.colourPresets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                </label>}
                <ColourInput label={channel === "day" ? "Day colour" : "Night colour"} value={colour}
                    disabled={!!presetId || change?.kind === "preset"}
                    onChange={(value) => queue({ channel, kind: "colour", colour: value })} />
            </div>;
        })}
        {pending.length > 0 && !error && <p className="typography-status" role="status">Updating colours…</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
