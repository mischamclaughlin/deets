import { elementName as elementLabel } from "./element-name.ts";
import { isClockSource, type Scene } from "../../shared/scene.ts";
import { clockModes } from "./clock.ts";
import { frontToBack, moveLayer, type LayerAction } from "./layers.ts";
import { useLayerChange } from "./useLayerChange.ts";
import { useLayerDrag } from "./useLayerDrag.ts";
import "./ElementsPanel.css";

interface Props {
    scene: Scene;
    selectedId?: string;
    onSelect: (id: string) => void;
    onSceneChange: (scene: Scene) => void;
}

export function ElementsPanel({ scene, selectedId, onSelect, onSceneChange }: Props) {
    const { apply, busy, message, error } = useLayerChange(scene, onSceneChange);
    const { list, preview, start, suppressClick } = useLayerDrag(scene, busy, apply, onSelect);
    return (
        <section className="elements-panel" aria-labelledby="elements-heading">
            <h2 id="elements-heading">Layers</h2>
            {scene.elements.length > 0 && <p className="layers-caption">Front at top <span>Drag to reorder</span></p>}
            <ul ref={list} className="element-list layer-list" aria-busy={busy}
                data-drag-active={Boolean(preview)} onClickCapture={suppressClick}>
                {frontToBack(scene).map((element, index) => {
                    const label = elementLabel(scene, element.id);
                    return <li key={element.id} className="layer-row" data-selected={selectedId === element.id}
                        data-layer-id={element.id} data-dragging={preview?.id === element.id}
                        data-settling={preview?.settling} aria-disabled={busy || Boolean(preview?.settling)}
                        style={preview ? { transform: `translateY(${preview.id === element.id ? preview.offset : preview.shifts.get(element.id) ?? 0}px)` } : undefined}
                        onPointerDown={(event) => start(event, element.id)}
                        onDragStart={(event) => event.preventDefault()}>
                        <button type="button" className="layer-handle" disabled={busy} aria-disabled={busy || Boolean(preview)}
                            aria-label={`Reorder ${label}`} aria-keyshortcuts="ArrowUp ArrowDown Home End"
                            title="Drag tile to reorder, or use arrow keys"
                            onFocus={() => onSelect(element.id)}
                            onKeyDown={(event) => {
                                const action: LayerAction | undefined = ({ ArrowUp: "forward", ArrowDown: "backward", Home: "front", End: "back" } as const)[event.key as "ArrowUp" | "ArrowDown" | "Home" | "End"];
                                if (!action) return;
                                event.preventDefault();
                                if (preview) return;
                                void apply(moveLayer(scene, element.id, action));
                            }}>
                            <svg viewBox="0 0 12 18" aria-hidden="true">{[4, 9, 14].flatMap((y) => [4, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />))}</svg>
                        </button>
                        <button type="button" className="element-choice" disabled={busy || Boolean(preview?.settling)} aria-pressed={selectedId === element.id}
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
