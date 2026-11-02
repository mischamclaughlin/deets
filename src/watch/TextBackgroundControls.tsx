import { useId } from "react";
import type { Scene } from "../../shared/scene.ts";
import { ColourInput } from "./ColourInput.tsx";
import { WorkspaceIcon } from "./WorkspaceIcon.tsx";
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
            return <div className="colour-channel text-background-channel" key={label}>
                <div className="text-background-heading">
                    <span className="colour-channel-heading"><WorkspaceIcon kind={night ? "moon" : "sun"} />{label}</span>
                    <label className="text-background-toggle">
                        <input type="checkbox" checked={saved !== undefined} aria-label={`${label} text background`}
                            onChange={(event) => onSceneChange(setTextBackground(scene, elementId, night, event.target.checked ? colour : undefined))} />
                        Fill
                    </label>
                </div>
                {saved !== undefined && <ColourInput label={`${label} background colour`} value={colour}
                    onChange={(value) => onSceneChange(setTextBackground(scene, elementId, night, value))} />}
            </div>;
        })}
    </div>;
}
