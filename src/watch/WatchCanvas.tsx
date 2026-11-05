import { elementName } from "./element-name.ts";
import type { PreviewScenario } from "./preview-scenario.ts";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { devices, type Scene, type SceneElement, type WatchMapping } from "../../shared/scene.ts";
import { previewWatch } from "./api.ts";
import { preparedMapping } from "./mapping-cache.ts";
import { gridLines, type GridSettings } from "./grid.ts";
import type { GridArea } from "./grid-area.ts";
import { GridOverlay } from "./GridOverlay.tsx";
import { moveElement, moveSceneElement } from "./snapping.ts";
import type { EditorLayout } from "./editor-layout.ts";
import { linkedElementIds } from "./snapping.ts";
import { groupBounds } from "./layout-geometry.ts";
import { paintWatch } from "./raster.ts";
import "./watch.css";
import "./WatchAnnotations.css";

interface Props {
    scene: Scene;
    layout?: EditorLayout;
    night?: boolean;
    previewScenario?: PreviewScenario;
    showAreas?: boolean;
    showCircumference?: boolean;
    showGuideLines?: boolean;
    grid?: GridSettings;
    mirrorGrid?: boolean;
    selectedGridLineIds?: string[];
    selectedGridArea?: GridArea;
    selectedGridAreas?: readonly GridArea[];
    onSelectGridArea?: (area: GridArea, additive?: boolean) => void;
    onSelectGridLine?: (id: string | undefined, additive?: boolean) => void;
    onChangeGrid?: (grid: GridSettings) => void;
    snapEnabled?: boolean;
    snapToGrid?: boolean;
    snapToGuides?: boolean;
    snapToElements?: boolean;
    snapGridToElements?: boolean;
    outlineMode?: "all" | "selected" | "off";
    selectedElementId?: string;
    selectedElementIds?: string[];
    onSelectElement?: (id: string | undefined, additive?: boolean) => void;
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
    previewScenario?: PreviewScenario;
    layout?: WatchMapping;
    error?: string;
}

/** Native watch pixels with browser-only area and circumference annotations. */
export function WatchCanvas({ scene, layout, night = false, previewScenario, showAreas = true, showCircumference = false, showGuideLines = false, grid, mirrorGrid = false, selectedGridLineIds, selectedGridArea, selectedGridAreas, onSelectGridArea, onSelectGridLine, onChangeGrid, snapEnabled = false, snapToGrid = true, snapToGuides = true, snapToElements = false, snapGridToElements = true, outlineMode = "selected", onMoveElement, onSelectElement, selectedElementId, selectedElementIds }: Props) {
    const size = devices[scene.device];
    const canvas = useRef<HTMLCanvasElement>(null);
    const areas = useRef<SVGSVGElement>(null);
    const restoreFocus = useRef<string | undefined>(undefined);
    const [result, setResult] = useState<Result>();
    const [painted, setPainted] = useState<{ layout: WatchMapping; signature: string }>();
    const drag = useRef<Drag | undefined>(undefined);
    const pointerSelecting = useRef(false);
    const [preview, setPreview] = useState<Drag>();
    const [active, setActive] = useState<string>();
    const selectedId = onSelectElement ? selectedElementId : active;
    const pixelScene = useMemo(() => preview
        ? moveSceneElement(scene, preview.element.id, preview.position, { enabled: false, showGuideLines: false, layout })
        : scene, [scene, preview, layout]);
    const selectedGroups = (layout?.groups ?? []).filter((group) => group.elementIds.length >= 2 &&
        group.elementIds.every((id) => selectedElementIds?.includes(id)));
    const groupedSelection = new Set(selectedGroups.flatMap((group) => group.elementIds));
    const prepared = previewScenario ? undefined : preparedMapping(pixelScene, night);
    const current = result?.scene === pixelScene && result.night === night && result.previewScenario === previewScenario ? result
        : prepared ? { scene: pixelScene, night, layout: prepared } : undefined;
    const pendingMapping = current?.layout;
    const signature = pendingMapping ? `${pendingMapping.mapping}:${night}` : undefined;
    // Retain the last complete frame and its hit areas while the next frame loads.
    const mapping = painted?.layout.scene.device === scene.device ? painted.layout : undefined;
    const ready = !!mapping;

    useEffect(() => {
        const controller = new AbortController();
        if (!previewScenario && preparedMapping(pixelScene, night)) return;
        void previewWatch(pixelScene, night, controller.signal, previewScenario)
            .then((layout) => {
                if (!controller.signal.aborted)
                    setResult({ scene: pixelScene, night, previewScenario, layout });
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    setResult({
                        scene: pixelScene,
                        night,
                        previewScenario,
                        error:
                            error instanceof Error
                                ? error.message
                                : "The watch mapping could not load.",
                    });
            });
        return () => controller.abort();
    }, [pixelScene, night, previewScenario]);

    useLayoutEffect(() => {
        if (!pendingMapping || !canvas.current || !signature) return;
        const controller = new AbortController();
        void paintWatch(canvas.current, pendingMapping, controller.signal)
            .then(() => {
                if (!controller.signal.aborted) setPainted({ layout: pendingMapping, signature });
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    setResult({
                        scene: pixelScene,
                        night,
                        previewScenario,
                        error:
                            error instanceof Error
                                ? error.message
                                : "The watch pixels could not render.",
                    });
            });
        return () => controller.abort();
    }, [pendingMapping, signature, pixelScene, night, previewScenario]);

    useEffect(() => {
        if (onSelectElement && restoreFocus.current !== selectedElementId) {
            restoreFocus.current = undefined;
            return;
        }
        if (!ready || painted?.signature !== signature || !restoreFocus.current || !areas.current) return;
        const target = Array.from(areas.current.querySelectorAll<SVGGElement>("[data-element-id]"))
            .find((element) => element.dataset.elementId === restoreFocus.current);
        target?.focus();
        restoreFocus.current = undefined;
    }, [ready, mapping, painted, signature, selectedElementId, onSelectElement]);

    function movePointer(event: ReactPointerEvent<SVGSVGElement>) {
        const currentDrag = drag.current;
        if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
        const point = nativePointer(event);
        if (!point) return;
        const position = moveElement(scene, currentDrag.element, {
            x: currentDrag.element.x + point.x - currentDrag.start.x,
            y: currentDrag.element.y + point.y - currentDrag.start.y,
        }, {
            layout,
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
            {(!ready || !current?.layout || current?.error) && (
                <span className="watch-status" role={current?.error ? "alert" : "status"}>
                    {current?.error ?? "Mapping watch pixels…"}
                </span>
            )}
            {grid?.visible && onChangeGrid && onSelectGridLine && (
                <GridOverlay key={`${size}-${scene.edgeInset ?? 0}`} size={size} inset={scene.edgeInset ?? 0}
                    grid={grid} mirror={mirrorGrid} selectedIds={selectedGridLineIds}
                    scene={scene} night={night} snapToElements={snapEnabled && snapGridToElements}
                    selectedArea={selectedGridArea} selectedAreas={selectedGridAreas} onSelectArea={onSelectGridArea}
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
            {showAreas && mapping && ready && (
                <svg
                    ref={areas}
                    data-outline-mode={outlineMode}
                    className={onMoveElement ? "watch-areas editable" : "watch-areas"}
                    onPointerDown={(event) => {
                        if (!onMoveElement || event.button !== 0 || drag.current) return;
                        const target = event.target instanceof Element ? event.target.closest("[data-element-id]") : null;
                        const element = scene.elements.find((item) => item.id === target?.getAttribute("data-element-id"));
                        const start = nativePointer(event);
                        if (!element || !start) return;
                        event.preventDefault();
                        setActive(element.id);
                        onSelectElement?.(element.id, event.shiftKey);
                        pointerSelecting.current = true;
                        target?.closest("g")?.focus();
                        pointerSelecting.current = false;
                        if (event.shiftKey || element.source === "secondsRing" || linkedElementIds(scene, element.id, layout).some((id) => layout?.lockedIds.includes(id))) return;
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
                    {mapping.areas.map((area) => {
                        const position = preview?.element.id === area.id ? preview.position : area;
                        const selected = selectedElementIds?.includes(area.id) ?? area.id === selectedId;
                        const ring = scene.elements.find((element) => element.id === area.id);
                        const clearance = scene.edgeInset ?? 0;
                        const tickHitInset = ring?.ringTicksStretchToCircumference ? (4 + clearance) / 2
                            : (ring?.ringTicksToCircumference ? clearance : 4) + 7.5;
                        const tickHitWidth = ring?.ringTicksStretchToCircumference ? Math.max(24, clearance) : 24;
                        const label = `${ring?.source === "customIcon" ? elementName(scene, area.id) : area.label} · ${position.x},${position.y} · ${area.width}×${area.height} px`;
                        return (
                            <g
                                key={area.id}
                                data-element-id={area.id}
                                tabIndex={0}
                                role="button"
                                aria-pressed={selected}
                                aria-label={label}
                                aria-keyshortcuts={onMoveElement ? "ArrowLeft ArrowRight ArrowUp ArrowDown" : undefined}
                                className={selected ? "area selected" : "area"}
                                data-group-member={groupedSelection.has(area.id) || undefined}
                                onFocus={() => { if (!pointerSelecting.current) { setActive(area.id); onSelectElement?.(area.id); } }}
                                onClick={(event) => { if (event.detail === 0) { setActive(area.id); onSelectElement?.(area.id, event.shiftKey); } }}
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
                                        }, { layout, enabled: snapEnabled && !event.altKey, snapToGrid, snapToGuides, snapToElements, night, showGuideLines, grid }));
                                    }
                                    if (event.key === "Escape") {
                                        const cancelled = drag.current;
                                        drag.current = undefined;
                                        setPreview(undefined);
                                        restoreFocus.current = undefined;
                                        if (cancelled && areas.current?.hasPointerCapture(cancelled.pointerId))
                                            areas.current.releasePointerCapture(cancelled.pointerId);
                                        setActive(undefined);
                                        onSelectElement?.(undefined);
                                        event.currentTarget.blur();
                                    }
                                    if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                    ) {
                                        event.preventDefault();
                                        setActive(area.id);
                                        onSelectElement?.(area.id, event.shiftKey);
                                    }
                                }}
                            >
                                {area.source === "secondsRing" ? <><circle className="ring-hit-area" cx={position.x + area.width / 2}
                                    cy={position.y + area.height / 2} r={Math.max(0, area.width / 2 - tickHitInset)} style={{ strokeWidth: tickHitWidth }} />
                                    <circle className="area-outline ring-outline" cx={position.x + area.width / 2}
                                        cy={position.y + area.height / 2} r={Math.max(0, area.width / 2 - tickHitInset)} /></> : <rect
                                    className="area-outline"
                                    x={position.x}
                                    y={position.y}
                                    width={area.width}
                                    height={area.height}
                                />}
                                {selected && !groupedSelection.has(area.id) && (
                                    <foreignObject className="area-label content-label" aria-hidden="true"
                                        x={position.x} y={Math.max(0, position.y - 19)} width={mapping.size} height={16}>
                                        <div className="area-label-content" style={{ minWidth: area.width }}>
                                            {label}
                                        </div>
                                    </foreignObject>
                                )}
                            </g>
                        );
                    })}
                    {outlineMode !== "off" && selectedGroups.map((group) => {
                        const bounds = groupBounds(pixelScene, group.elementIds);
                        if (!bounds) return null;
                        return <g key={group.id} className="group-outline" aria-hidden="true">
                            <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} />
                            <foreignObject className="content-label" x={bounds.x} y={Math.max(0, bounds.y - 19)} width={mapping.size} height={16}>
                                <div className="group-outline-label">{group.name} · {bounds.width}×{bounds.height} px</div>
                            </foreignObject>
                        </g>;
                    })}
                </svg>
            )}
        </div>
    );
}
