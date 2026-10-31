import { useRef, useState, type DragEvent } from "react";
import { elementName as elementLabel } from "./element-name.ts";
import { isClockSource, type Scene } from "../../shared/scene.ts";
import { clockModes } from "./clock.ts";
import { frontToBack, moveLayer, placeLayer, type LayerAction } from "./layers.ts";
import { useLayerChange } from "./useLayerChange.ts";
import "./ElementsPanel.css";

interface Props {
    scene: Scene;
    selectedId?: string;
    onSelect: (id: string) => void;
    onSceneChange: (scene: Scene) => void;
}

function dropEdge(event: DragEvent<HTMLLIElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" as const : "after" as const;
}

export function ElementsPanel({ scene, selectedId, onSelect, onSceneChange }: Props) {
    const drag = useRef<{ id: string; scene: Scene } | undefined>(undefined);
    const [dragging, setDragging] = useState<string>();
    const [drop, setDrop] = useState<{ id: string; edge: "before" | "after" }>();
    const { apply, busy, message, error } = useLayerChange(scene, onSceneChange);
    function clearDrag() { drag.current = undefined; setDragging(undefined); setDrop(undefined); }
    return (
        <section className="elements-panel" aria-labelledby="elements-heading">
            <h2 id="elements-heading">Layers</h2>
            {scene.elements.length > 0 && <p className="layers-caption">Front at top <span>Drag to reorder</span></p>}
            <ul className="element-list layer-list" aria-busy={busy}
                onDragLeave={(event) => {
                    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDrop(undefined);
                }}>
                {frontToBack(scene).map((element, index) => {
                    const label = elementLabel(scene, element.id);
                    return <li key={element.id} className="layer-row" data-selected={selectedId === element.id}
                        data-dragging={dragging === element.id} data-drop-edge={drop?.id === element.id ? drop.edge : undefined}
                        onDragOver={(event) => {
                            if (!drag.current || busy) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDrop(drag.current.id === element.id ? undefined : { id: element.id, edge: dropEdge(event) });
                        }}
                        onDrop={(event) => {
                            if (!drag.current || busy) return;
                            event.preventDefault();
                            const source = drag.current;
                            const edge = dropEdge(event);
                            clearDrag();
                            if (source.scene === scene) void apply(placeLayer(scene, source.id, element.id, edge));
                        }}>
                        <button type="button" className="layer-handle" draggable={!busy} disabled={busy}
                            aria-label={`Reorder ${label}`} aria-keyshortcuts="ArrowUp ArrowDown Home End"
                            title="Drag to reorder, or use arrow keys"
                            onFocus={() => onSelect(element.id)}
                            onDragStart={(event) => {
                                drag.current = { id: element.id, scene };
                                setDragging(element.id);
                                setDrop(undefined);
                                onSelect(element.id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("application/x-deets-layer", element.id);
                            }} onDragEnd={clearDrag}
                            onKeyDown={(event) => {
                                const action: LayerAction | undefined = ({ ArrowUp: "forward", ArrowDown: "backward", Home: "front", End: "back" } as const)[event.key as "ArrowUp" | "ArrowDown" | "Home" | "End"];
                                if (!action) return;
                                event.preventDefault();
                                void apply(moveLayer(scene, element.id, action));
                            }}>
                            <svg viewBox="0 0 12 18" aria-hidden="true">{[4, 9, 14].flatMap((y) => [4, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />))}</svg>
                        </button>
                        <button type="button" className="element-choice" aria-pressed={selectedId === element.id}
                            onClick={() => onSelect(element.id)}>
                            <span>{label}</span>
                            {isClockSource(element.source) && (
                                <span className="element-format">{element.source === "secondsRing" ? "SS · Ring" : clockModes.find((mode) => mode.source === element.source)?.label}</span>
                            )}
                            <span className="layer-number" aria-label={`Layer ${index + 1} of ${scene.elements.length}`}>{index + 1}</span>
                        </button>
                    </li>;
                })}
            </ul>
            {message && <p className={error ? "typography-status" : "layers-announcement"} role={error ? "alert" : "status"}>{message}</p>}
        </section>
    );
}
