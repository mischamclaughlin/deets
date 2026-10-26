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
                {scene.elements.map((element, index) => (
                    <li key={element.id}>
                        <button type="button" className="element-choice" aria-pressed={selectedId === element.id}
                            onClick={() => onSelect(element.id)}>
                            <span>{isClockSource(element.source) ? `Time ${scene.elements.slice(0, index + 1).filter((item) => isClockSource(item.source)).length}` : element.id}</span>
                            {isClockSource(element.source) && (
                                <span className="element-format">{clockModes.find((mode) => mode.source === element.source)?.label}</span>
                            )}
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
