import { elementName as elementLabel } from "./element-name.ts";
import { isClockSource, type Scene } from "../../shared/scene.ts";
import { clockModes } from "./clock.ts";

interface Props {
    scene: Scene;
    selectedId?: string;
    onSelect: (id: string) => void;
}

export function ElementsPanel({ scene, selectedId, onSelect }: Props) {
    return (
        <section className="elements-panel" aria-labelledby="elements-heading">
            <h2 id="elements-heading">Elements</h2>
            <ul className="element-list">
                {scene.elements.map((element) => {
                    const label = elementLabel(scene, element.id);
                    return <li key={element.id}>
                        <button type="button" className="element-choice" aria-pressed={selectedId === element.id}
                            onClick={() => onSelect(element.id)}>
                            <span>{label}</span>
                            {isClockSource(element.source) && (
                                <span className="element-format">{element.source === "secondsRing" ? "SS · Ring" : clockModes.find((mode) => mode.source === element.source)?.label}</span>
                            )}
                        </button>
                    </li>;
                })}
            </ul>
        </section>
    );
}
