import { useId } from "react";
import type { Scene } from "../../shared/scene.ts";
import { ColourInput } from "./ColourInput.tsx";
import { setTextBackground, supportsTextBackground } from "./text-background.ts";
import "./TextBackgroundControls.css";

export function TextBackgroundControls({ scene, elementId, onSceneChange }: {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}) {
    const heading = useId();
    const element = scene.elements.find((item) => item.id === elementId);
    if (!element || !supportsTextBackground(element.source)) return null;
    return <div className="text-background-controls" role="group" aria-labelledby={heading}>
        <h3 id={heading}>Text background</h3>
        {([false, true] as const).map((night) => {
            const label = night ? "Night" : "Day";
            const saved = night ? element.nightBackgroundColour : element.backgroundColour;
            const colour = saved ?? (night ? 0 : scene.background);
            return <div className="text-background-channel" key={label}>
                <label className="text-background-toggle">
                    <span>{label} background</span>
                    <span><input type="checkbox" checked={saved !== undefined}
                        onChange={(event) => onSceneChange(setTextBackground(scene, elementId, night, event.target.checked ? colour : undefined))} />
                        Opaque</span>
                </label>
                {saved !== undefined && <ColourInput label={`${label} background colour`} value={colour}
                    onChange={(value) => onSceneChange(setTextBackground(scene, elementId, night, value))} />}
            </div>;
        })}
    </div>;
}
