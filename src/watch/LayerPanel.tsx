import type { Scene } from "../../shared/scene.ts";
import { moveLayer, type LayerAction } from "./layers.ts";
import { useLayerChange } from "./useLayerChange.ts";
import "./LayerPanel.css";

const actions: Array<{ action: LayerAction; label: string; description: string }> = [
    { action: "front", label: "To front", description: "Bring selected element to the front" },
    { action: "back", label: "To back", description: "Send selected element to the back" },
    { action: "forward", label: "Forward", description: "Move selected element forward one layer" },
    { action: "backward", label: "Backward", description: "Move selected element backward one layer" },
];

export function LayerPanel({ scene, elementId, disabled, onSceneChange }: {
    scene: Scene;
    elementId: string;
    disabled: boolean;
    onSceneChange: (scene: Scene) => void;
}) {
    const index = scene.elements.findIndex((element) => element.id === elementId);
    const { apply, busy, message, error } = useLayerChange(scene, onSceneChange);

    return <div className="layer-panel" role="group" aria-label="Layer order">
        <div className="control-heading"><span>Layer</span>
            <output aria-live="polite">{scene.elements.length - index} of {scene.elements.length}</output>
        </div>
        <div className="layer-actions">
            {actions.map(({ action, label, description }) => <button key={action} type="button" className="element-action"
                aria-label={description} title={description}
                disabled={disabled || busy || index < 0 || moveLayer(scene, elementId, action) === scene}
                onClick={() => void apply(moveLayer(scene, elementId, action))}>{label}</button>)}
        </div>
        {message && <p className={error ? "typography-status" : "layers-announcement"} role={error ? "alert" : "status"}>{message}</p>}
    </div>;
}
