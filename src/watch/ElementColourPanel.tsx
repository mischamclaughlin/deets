import { useEffect, useState } from "react";
import { defaultZoneColours, type ColourChannel, type Scene } from "../../shared/scene.ts";
import { setElementColour, setElementColourPreset } from "./api.ts";
import { TextBackgroundControls } from "./TextBackgroundControls.tsx";
import { ColourInput } from "./ColourInput.tsx";
import { WorkspaceIcon } from "./WorkspaceIcon.tsx";

type Channel = ColourChannel;
type Change = { channel: Channel } & ({ kind: "colour"; colour: number } | { kind: "preset"; presetId: string | null });

export function ElementColourPanel({ scene, elementId, onSceneChange }: {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}) {
    const element = scene.elements.find((item) => item.id === elementId)!;
    const zones = element.source === "heartZones" || element.source === "temperatureZones";
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
        {(["day", "night"] as const).flatMap((appearance) => zones
            ? ([0, 1, 2, 3, 4] as const).map((index): Channel => `${appearance}:zone:${index}`)
            : [appearance]).map((channel) => {
            const night = channel.startsWith("night");
            const band = channel.includes(":zone:") ? Number(channel.at(-1)) : undefined;
            const label = `${night ? "Night" : "Day"}${band === undefined ? "" : ` band ${band + 1}`}`;
            const change = pending.find((item) => item.channel === channel);
            const savedPreset = band === undefined ? (night ? element.nightColourPresetId : element.colourPresetId)
                : (night ? element.nightZoneColourPresetIds : element.zoneColourPresetIds)?.[band]
                    ?? (night ? element.nightColourPresetId : element.colourPresetId);
            const presetId = change ? change.kind === "preset" ? change.presetId : null : savedPreset;
            const preset = scene.colourPresets?.find((item) => item.id === presetId);
            const colour = change?.kind === "colour" ? change.colour
                : preset?.colour ?? (band === undefined ? (night ? element.nightColour : element.colour)
                    : (night ? element.nightZoneColours : element.zoneColours)?.[band] ?? defaultZoneColours[band]);
            return <div key={channel} className="colour-channel">
                <div className="colour-channel-heading"><WorkspaceIcon kind={night ? "moon" : "sun"} />
                    {label}
                </div>
                {!!scene.colourPresets?.length && <label className="font-choice">
                    {label} preset
                    <select value={presetId ?? ""} onChange={(event) => queue({ channel, kind: "preset", presetId: event.target.value || null })}>
                        <option value="">Custom</option>
                        {scene.colourPresets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                </label>}
                <ColourInput label={`${label} colour`} value={colour}
                    disabled={!!presetId || change?.kind === "preset"}
                    onChange={(value) => queue({ channel, kind: "colour", colour: value })} />
            </div>;
        })}
        <TextBackgroundControls scene={scene} elementId={elementId} onSceneChange={onSceneChange} />
        {pending.length > 0 && !error && <p className="typography-status" role="status">Updating colours…</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
