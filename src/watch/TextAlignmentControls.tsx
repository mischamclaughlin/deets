import type { Scene } from "../../shared/scene.ts";
import "./TextAlignmentControls.css";

const alignments = [
    { value: "left", label: "Left" },
    { value: "centre", label: "Centre" },
    { value: "right", label: "Right" },
] as const;

export function TextAlignmentControls({ scene, elementId, onSceneChange }: {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}) {
    const selected = scene.elements.find((element) => element.id === elementId)!;
    return <div className="text-alignment-control">
        <span id="text-alignment-label">Alignment</span>
        <div className="text-alignment-options" role="group" aria-labelledby="text-alignment-label">
            {alignments.map(({ value, label }) => <button key={value} type="button"
                aria-pressed={selected.align === value}
                onClick={() => onSceneChange({ ...scene, elements: scene.elements.map((element) =>
                    element.id === elementId ? { ...element, align: value } : element) })}>
                {label}
            </button>)}
        </div>
    </div>;
}
