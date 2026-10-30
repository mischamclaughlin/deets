import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { devices, type Scene, type SceneElement, type WatchMapping } from "../../shared/scene.ts";
import { mapWatch } from "./api.ts";
import { gridLines, type GridSettings } from "./grid.ts";
import { GridOverlay } from "./GridOverlay.tsx";
import { moveElement } from "./snapping.ts";
import { paintWatch } from "./raster.ts";
import "./watch.css";

interface Props {
    scene: Scene;
    night?: boolean;
    showCircumference?: boolean;
    showGuideLines?: boolean;
    grid?: GridSettings;
    mirrorGrid?: boolean;
    selectedGridLineId?: string;
    onSelectGridLine?: (id: string) => void;
    onChangeGrid?: (grid: GridSettings) => void;
    snapEnabled?: boolean;
    snapToGrid?: boolean;
    snapToGuides?: boolean;
    snapToElements?: boolean;
    selectedElementId?: string;
    onSelectElement?: (id: string) => void;
    onMoveElement?: (id: string, position: { x: number; y: number }) => void;
}
interface Drag {
    pointerId: number;
    element: SceneElement;
    start: { x: number; y: number };
    position: { x: number; y: number };
}

/** Project pointer input into the SVG's native coordinate system. */
function nativePointer(event: ReactPointerEvent<SVGSVGElement>) {
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    return { x: point.x, y: point.y };
}

interface Result {
    scene: Scene;
    night: boolean;
    layout?: WatchMapping;
    error?: string;
}

/** Native watch pixels with browser-only area and circumference annotations. */
export function WatchCanvas({ scene, night = false, showCircumference = false, showGuideLines = false, grid, mirrorGrid = false, selectedGridLineId, onSelectGridLine, onChangeGrid, snapEnabled = false, snapToGrid = true, snapToGuides = true, snapToElements = false, onMoveElement, onSelectElement, selectedElementId }: Props) {
    const size = devices[scene.device];
    const canvas = useRef<HTMLCanvasElement>(null);
    const areas = useRef<SVGSVGElement>(null);
    const restoreFocus = useRef<string | undefined>(undefined);
    const [result, setResult] = useState<Result>();
    const [painted, setPainted] = useState<string>();
    const drag = useRef<Drag | undefined>(undefined);
    const [preview, setPreview] = useState<Drag>();
    const [active, setActive] = useState<string>("time");
    const current =
        result?.scene === scene && result.night === night ? result : undefined;
    const mapping = current?.layout;
    const signature = mapping ? `${mapping.mapping}:${night}` : undefined;
    const ready = !!signature && painted === signature;

    useEffect(() => {
        const controller = new AbortController();
        void mapWatch(scene, night, controller.signal)
            .then((layout) => {
                if (!controller.signal.aborted)
                    setResult({ scene, night, layout });
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    setResult({
                        scene,
                        night,
                        error:
                            error instanceof Error
                                ? error.message
                                : "The watch mapping could not load.",
                    });
            });
        return () => controller.abort();
    }, [scene, night]);

    useEffect(() => {
        if (!mapping || !canvas.current || !signature) return;
        const controller = new AbortController();
        void paintWatch(canvas.current, mapping, controller.signal)
            .then(() => {
                if (!controller.signal.aborted) setPainted(signature);
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    setResult({
                        scene,
                        night,
                        error:
                            error instanceof Error
                                ? error.message
                                : "The watch pixels could not render.",
                    });
            });
        return () => controller.abort();
    }, [mapping, signature, scene, night]);

    useEffect(() => {
        if (!ready || !restoreFocus.current || !areas.current) return;
        const target = Array.from(areas.current.querySelectorAll<SVGGElement>("[data-element-id]"))
            .find((element) => element.dataset.elementId === restoreFocus.current);
        target?.focus();
        restoreFocus.current = undefined;
    }, [ready, mapping]);

    function movePointer(event: ReactPointerEvent<SVGSVGElement>) {
        const currentDrag = drag.current;
        if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
        const point = nativePointer(event);
        if (!point) return;
        const position = moveElement(scene, currentDrag.element, {
            x: currentDrag.element.x + point.x - currentDrag.start.x,
            y: currentDrag.element.y + point.y - currentDrag.start.y,
        }, {
            enabled: snapEnabled && !event.altKey,
            snapToGrid,
            snapToGuides,
            snapToElements,
            night,
            showGuideLines,
            grid,
        });
        drag.current = { ...currentDrag, position };
        setPreview(drag.current);
    }

    function finishPointer(event: ReactPointerEvent<SVGSVGElement>, commit: boolean) {
        if (drag.current?.pointerId !== event.pointerId) return;
        if (commit) movePointer(event);
        const finished = drag.current;
        drag.current = undefined;
        setPreview(undefined);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        if (commit && finished && (finished.position.x !== finished.element.x || finished.position.y !== finished.element.y))
            onMoveElement?.(finished.element.id, finished.position);
    }

    return (
        <div className="watch" aria-label={`${scene.device} watch canvas`}>
            <canvas
                ref={canvas}
                aria-label="Native-pixel Garmin watch face"
                style={{ visibility: ready ? "visible" : "hidden" }}
            />
            {!ready && (
                <span className="watch-status" role="status">
                    {current?.error ?? "Mapping watch pixels…"}
                </span>
            )}
            {grid?.visible && onChangeGrid && onSelectGridLine && (
                <GridOverlay key={`${size}-${scene.edgeInset ?? 0}`} size={size} inset={scene.edgeInset ?? 0}
                    grid={grid} mirror={mirrorGrid} selectedId={selectedGridLineId}
                    onSelect={onSelectGridLine} onChange={onChangeGrid} />
            )}
            {grid?.visible && !onChangeGrid && (
                <svg className="watch-grid" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Grid guides">
                    {gridLines(size, scene.edgeInset ?? 0, grid).map((line) => <path key={line.id} d={line.path} />)}
                </svg>
            )}
            {showGuideLines && (
                <svg
                    className="watch-guide-lines"
                    viewBox={`0 0 ${size} ${size}`}
                    role="img"
                    aria-label="Horizontal and vertical centre guides"
                >
                    <line x1={0} y1={size / 2} x2={size} y2={size / 2} />
                    <line x1={size / 2} y1={0} x2={size / 2} y2={size} />
                </svg>
            )}
            {showCircumference && (
                <svg
                    className="watch-circumference"
                    viewBox={`0 0 ${size} ${size}`}
                    aria-label={`Content boundary, ${scene.edgeInset ?? 0} native pixels from the edge`}
                    role="img"
                >
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={size / 2 - (scene.edgeInset ?? 0)}
                    />
                </svg>
            )}
            {mapping && ready && (
                <svg
                    ref={areas}
                    className={onMoveElement ? "watch-areas editable" : "watch-areas"}
                    onPointerDown={(event) => {
                        if (!onMoveElement || event.button !== 0 || drag.current) return;
                        const target = event.target instanceof Element ? event.target.closest("[data-element-id]") : null;
                        const element = scene.elements.find((item) => item.id === target?.getAttribute("data-element-id"));
                        if (element?.source === "secondsRing") {
                            setActive(element.id);
                            onSelectElement?.(element.id);
                            target?.closest("g")?.focus();
                            return;
                        }
                        const start = nativePointer(event);
                        if (!element || !start) return;
                        event.preventDefault();
                        setActive(element.id);
                        onSelectElement?.(element.id);
                        target?.closest("g")?.focus();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        drag.current = { pointerId: event.pointerId, element, start, position: { x: element.x, y: element.y } };
                        setPreview(drag.current);
                    }}
                    onPointerMove={movePointer}
                    onPointerUp={(event) => finishPointer(event, true)}
                    onPointerCancel={(event) => finishPointer(event, false)}
                    onLostPointerCapture={() => {
                        drag.current = undefined;
                        setPreview(undefined);
                    }}
                    viewBox={`0 0 ${mapping.size} ${mapping.size}`}
                    aria-label="Translated watch areas"
                >
                    {mapping.areas.toSorted((left, right) =>
                        Number(left.id === (selectedElementId ?? active)) - Number(right.id === (selectedElementId ?? active)),
                    ).map((area) => {
                        const position = preview?.element.id === area.id ? preview.position : area;
                        const selected = area.id === (selectedElementId ?? active);
                        const ring = scene.elements.find((element) => element.id === area.id);
                        const clearance = scene.edgeInset ?? 0;
                        const tickHitInset = ring?.ringTicksStretchToCircumference ? (4 + clearance) / 2
                            : (ring?.ringTicksToCircumference ? clearance : 4) + 7.5;
                        const tickHitWidth = ring?.ringTicksStretchToCircumference ? Math.max(24, clearance) : 24;
                        const label = `${area.label} · ${position.x},${position.y} · ${area.width}×${area.height} px`;
                        const labelX = Math.max(
                            8,
                            Math.min(position.x, mapping.size - 235),
                        );
                        const labelY = Math.max(16, position.y - 8);
                        return (
                            <g
                                key={area.id}
                                data-element-id={area.id}
                                tabIndex={0}
                                role="button"
                                aria-label={label}
                                aria-keyshortcuts={onMoveElement ? "ArrowLeft ArrowRight ArrowUp ArrowDown" : undefined}
                                className={selected ? "area selected" : "area"}
                                onPointerEnter={() => { if (!drag.current) setActive(area.id); }}
                                onFocus={() => { setActive(area.id); onSelectElement?.(area.id); }}
                                onClick={() => { setActive(area.id); onSelectElement?.(area.id); }}
                                onKeyDown={(event) => {
                                    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
                                    const element = scene.elements.find((item) => item.id === area.id);
                                    if (onMoveElement && element && direction) {
                                        event.preventDefault();
                                        restoreFocus.current = element.id;
                                        const step = event.shiftKey ? 10 : 1;
                                        onMoveElement(element.id, moveElement(scene, element, {
                                            x: element.x + direction[0] * step,
                                            y: element.y + direction[1] * step,
                                        }, { enabled: snapEnabled && !event.altKey, snapToGrid, snapToGuides, snapToElements, night, showGuideLines, grid }));
                                    }
                                    if (event.key === "Escape" && drag.current) {
                                        drag.current = undefined;
                                        setPreview(undefined);
                                    }
                                    if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                    ) {
                                        event.preventDefault();
                                        setActive(area.id);
                                    }
                                }}
                            >
                                {area.source === "secondsRing" ? <circle className="ring-hit-area" cx={position.x + area.width / 2}
                                    cy={position.y + area.height / 2} r={Math.max(0, area.width / 2 - tickHitInset)} style={{ strokeWidth: tickHitWidth }} /> : <rect
                                    x={position.x}
                                    y={position.y}
                                    width={area.width}
                                    height={area.height}
                                />}
                                {selected && (
                                    <g
                                        className="area-label"
                                        aria-hidden="true"
                                    >
                                        <rect
                                            x={labelX - 3}
                                            y={labelY - 11}
                                            width={235}
                                            height={16}
                                        />
                                        <text x={labelX} y={labelY}>
                                            {label}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>
            )}
        </div>
    );
}
