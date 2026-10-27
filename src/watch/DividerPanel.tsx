import { useEffect, useState } from "react";
import type { DividerSymbol, Scene } from "../../shared/scene.ts";
import { setDividerSymbol } from "./api.ts";

const symbols: Array<{ symbol: DividerSymbol; name: string }> = [
    { symbol: ":", name: "Colon" },
    { symbol: ".", name: "Dot" },
    { symbol: "-", name: "Dash" },
    { symbol: "/", name: "Slash" },
    { symbol: "|", name: "Vertical bar" },
];

export function DividerPanel({ scene, elementId, onSceneChange }: {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}) {
    const selected = scene.elements.find((element) => element.id === elementId)!;
    const [requested, setRequested] = useState<DividerSymbol>();
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (requested === undefined) return;
        const controller = new AbortController();
        void setDividerSymbol(scene, elementId, requested, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            setRequested(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setRequested(undefined);
            setError(failure instanceof Error ? failure.message : "The divider could not change.");
        });
        return () => controller.abort();
    }, [requested, scene, elementId, onSceneChange]);
    return <section aria-labelledby="divider-heading">
        <h2 id="divider-heading">Divider</h2>
        <label className="font-choice">
            Symbol
            <select value={requested ?? selected.dividerSymbol ?? ":"} disabled={requested !== undefined}
                onChange={(event) => { setError(undefined); setRequested(event.target.value as DividerSymbol); }}>
                {symbols.map(({ symbol, name }) => <option key={symbol} value={symbol}>{symbol} {name}</option>)}
            </select>
        </label>
        <label className="font-choice">
            Position
            <select value={selected.dividerPosition ?? "middle"} disabled={requested !== undefined}
                onChange={(event) => onSceneChange({
                    ...scene,
                    elements: scene.elements.map((element) => element.id === elementId
                        ? { ...element, dividerPosition: event.target.value as "top" | "middle" | "bottom" }
                        : element),
                })}>
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
            </select>
        </label>
        {(requested !== undefined || error) && <p className="typography-status" role={error ? "alert" : "status"}>
            {error ?? "Updating divider…"}
        </p>}
    </section>;
}
