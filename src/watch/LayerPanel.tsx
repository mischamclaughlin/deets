import type { Scene } from "../../shared/scene.ts";
import { moveLayer, type LayerAction } from "./layers.ts";
import { useLayerChange } from "./useLayerChange.ts";
import "./LayerPanel.css";
import type { EditorLayout } from "./editor-layout.ts";

const actions: Array<{ action: LayerAction; description: string }> = [
    { action: "front", description: "Bring selected element to the front" },
    { action: "forward", description: "Move selected element forward one layer" },
    { action: "backward", description: "Move selected element backward one layer" },
    { action: "back", description: "Send selected element to the back" },
];

function LayerArrow({ action }: { action: LayerAction }) {
    const upwards = action === "front" || action === "forward";
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <g transform={upwards ? undefined : "rotate(180 12 12)"}>
            {action === "front" || action === "back" ? <path d="M5 4h14M12 20V9m-5 5 5-5 5 5" />
                : <path d="M12 20V5m-5 5 5-5 5 5" />}
        </g>
    </svg>;
}

export function LayerPanel({ scene, layout, elementId, disabled, onSceneChange }: {
    scene: Scene;
    layout?: EditorLayout;
    elementId: string;
    disabled: boolean;
    onSceneChange: (scene: Scene) => void;
}) {
    const index = scene.elements.findIndex((element) => element.id === elementId);
    const { apply, busy, message, error } = useLayerChange(scene, onSceneChange, layout);

    return <div className="layer-panel" role="group" aria-label="Layer order">
        <div className="layer-toolbar">
            <div className="control-heading"><span>Layer</span>
                <output aria-label="Layer position" aria-live="polite">{index < 0 ? "–" : `${scene.elements.length - index} of ${scene.elements.length}`}</output>
            </div>
            <div className="layer-actions">
                {actions.map(({ action, description }) => <button key={action} type="button"
                    aria-label={description} title={description}
                    disabled={disabled || busy || index < 0 || moveLayer(scene, elementId, action) === scene}
                    onClick={() => void apply(moveLayer(scene, elementId, action))}><LayerArrow action={action} /></button>)}
            </div>
        </div>
        {message && <p className={error ? "typography-status" : "layers-announcement"} role={error ? "alert" : "status"}>{message}</p>}
    </div>;
}
