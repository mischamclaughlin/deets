import { useId } from "react";
import type { Scene } from "../../shared/scene.ts";
import "./TextAlignmentControls.css";

const groups = [
    { key: "align", label: "Horizontal", options: [
        { value: "left", label: "Left" }, { value: "centre", label: "Centre" }, { value: "right", label: "Right" },
    ] },
    { key: "verticalAlign", label: "Vertical", options: [
        { value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" },
    ] },
] as const;

export function TextAlignmentControls({ scene, elementId, onSceneChange }: {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}) {
    const selected = scene.elements.find((element) => element.id === elementId)!;
    const id = useId();
    const vertical = selected.verticalAlign ?? (selected.source === "divider" ? selected.dividerPosition ?? "middle" : undefined);
    return <div className="text-alignment-controls">
        {groups.map(({ key, label, options }) => <div key={key} className="text-alignment-control">
            <span id={`${id}-${key}`}>{label}</span>
            <div className="text-alignment-options" role="group" aria-labelledby={`${id}-${key}`}>
                {options.map(({ value, label: option }) => <button key={value} type="button"
                    aria-pressed={(key === "verticalAlign" ? vertical : selected.align) === value}
                    onClick={() => onSceneChange({ ...scene, elements: scene.elements.map((element) =>
                        element.id === elementId ? { ...element, [key]: value } : element) })}>{option}</button>)}
            </div>
        </div>)}
    </div>;
}
