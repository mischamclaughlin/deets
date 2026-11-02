import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { editGridLine, gridLines, moveGridLines, type GridLine, type GridSettings } from "./grid.ts";
import { useGridAreaHover } from "./useGridAreaHover.ts";
import { selectGridArea, type GridArea } from "./grid-area.ts";
import type { Scene } from "../../shared/scene.ts";
import { snapGridLineToElements } from "./grid-snapping.ts";
import "./GridOverlay.css";

interface Props {
    size: number;
    inset: number;
    grid: GridSettings;
    mirror: boolean;
    scene: Scene;
    night?: boolean;
    snapToElements?: boolean;
    selectedIds?: string[];
    onSelect: (id: string | undefined, additive?: boolean) => void;
    onChange: (grid: GridSettings) => void;
    selectedArea?: GridArea;
    selectedAreas?: readonly GridArea[];
    onSelectArea?: (area: GridArea, additive?: boolean) => void;
}
interface Drag {
    pointerId: number;
    line: GridLine;
    ids: string[];
    start: { x: number; y: number };
    grid: GridSettings;
    latest: GridSettings;
}

function pointer(event: ReactPointerEvent<SVGSVGElement>) {
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
}

/** Editable annotations use native coordinates but never enter the exported scene. */
export function GridOverlay({ size, inset, grid, mirror, scene, night = false, snapToElements = false, selectedIds = [], onSelect, onChange, selectedArea, selectedAreas, onSelectArea }: Props) {
    const drag = useRef<Drag | undefined>(undefined);
    const pointerFocus = useRef(false);
    const keyboardPoint = useRef<{ grid: GridSettings; point: { x: number; y: number } } | undefined>(undefined);
    const [preview, setPreview] = useState<GridSettings>();
    const radius = size / 2 - inset;
    const clip = useId();
    const { hoveredArea, hoverAt, clearHover } = useGridAreaHover({ size, inset, grid, scene, selectedArea, selectedAreas, enabled: !!onSelectArea });
    const hover = hoveredArea?.path !== selectedArea?.path && !selectedAreas?.some((area) => (area.key ?? area.path) === (hoveredArea?.key ?? hoveredArea?.path)) ? hoveredArea : undefined;
    function move(event: ReactPointerEvent<SVGSVGElement>) {
        const current = drag.current;
        const point = pointer(event);
        if (!current || current.pointerId !== event.pointerId || !point || radius <= 0) return;
        const { line, start } = current;
        let delta: number;
        if (line.axis === "rings") {
            delta = Math.hypot(point.x - size / 2, point.y - size / 2)
                - Math.hypot(start.x - size / 2, start.y - size / 2);
        } else {
            const vertical = line.axis === "columns";
            const curved = vertical ? grid.curvedColumns : grid.curvedRows;
            const cross = (vertical ? start.y : start.x) - size / 2;
            const factor = curved ? Math.max(0.05, Math.sqrt(Math.max(0, 1 - (cross / radius) ** 2))) : 1;
            delta = ((vertical ? point.x - start.x : point.y - start.y)) / factor;
        }
        // Quantise the displacement to native pixels, retaining the original subdivision.
        if (Math.round(delta) === 0) {
            current.latest = current.grid;
            setPreview(current.latest);
            return;
        }
        const desired = line.value + Math.round(delta) / radius;
        const snapped = snapGridLineToElements(scene, current.grid, line, desired, {
            enabled: snapToElements && !event.altKey, night,
        });
        current.latest = snapped === line.value ? current.grid
            : moveGridLines(size, inset, current.grid, current.ids, snapped - line.value, mirror);
        setPreview(current.latest);
    }
    function finish(event: ReactPointerEvent<SVGSVGElement>, commit: boolean) {
        if (drag.current?.pointerId !== event.pointerId) return;
        if (commit) move(event);
        const current = drag.current;
        drag.current = undefined;
        setPreview(undefined);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (commit && current) onChange(current.latest);
    }
    return <svg className="watch-grid grid-editor" viewBox={`0 0 ${size} ${size}`}
        role="group" aria-label="Editable grid. Shift-click to select several lines. Drag or use arrow keys to move; Delete removes the selection."
        onPointerDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            clearHover();
            const target = event.target instanceof Element ? event.target.closest<SVGGElement>("[data-grid-id]") : null;
            const line = gridLines(size, inset, grid).find((item) => item.id === target?.dataset.gridId);
            const start = pointer(event);
            if (!start) return;
            if (!line) {
                if (!onSelectArea) return;
                const area = selectGridArea(size, inset, grid, start);
                if (!area) return;
                event.preventDefault();
                event.stopPropagation();
                keyboardPoint.current = { grid, point: { x: start.x, y: start.y } };
                onSelectArea(area, event.shiftKey || event.metaKey || event.ctrlKey);
                return;
            }
            event.preventDefault();
            const additive = event.shiftKey || event.metaKey || event.ctrlKey;
            pointerFocus.current = true;
            target?.focus();
            pointerFocus.current = false;
            onSelect(line.id, additive);
            if (additive && selectedIds.includes(line.id)) { target?.blur(); return; }
            event.currentTarget.setPointerCapture(event.pointerId);
            const ids = additive || selectedIds.includes(line.id)
                ? [line.id, ...selectedIds.filter((id) => id !== line.id)] : [line.id];
            drag.current = { pointerId: event.pointerId, line, ids, start, grid, latest: grid };
        }}
        onPointerMove={(event) => {
            if (drag.current) { move(event); return; }
            if (event.pointerType === "touch" || event.buttons !== 0 ||
                event.target instanceof Element && event.target.closest("[data-grid-id]")) { clearHover(); return; }
            const point = pointer(event);
            if (point) hoverAt(point);
        }}
        onPointerLeave={clearHover} onPointerUp={(event) => finish(event, true)}
        onPointerCancel={(event) => { clearHover(); finish(event, false); }}
        onLostPointerCapture={() => { clearHover(); drag.current = undefined; setPreview(undefined); }}>
        <defs><clipPath id={clip}><circle cx={size / 2} cy={size / 2} r={radius} /></clipPath></defs>
        {onSelectArea && <circle className="grid-area-hit" cx={size / 2} cy={size / 2} r={radius}
            tabIndex={0} role="button" aria-label="Select grid areas. Arrow keys preview an area; Enter selects it. Shift-click or Shift-Enter adds or removes an area."
            onKeyDown={(event) => {
                const step = event.shiftKey ? 10 : 1;
                const direction = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[event.key];
                if (!direction && event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                const anchor = keyboardPoint.current?.grid === grid ? keyboardPoint.current.point
                    : selectedAreas?.at(-1)?.anchor ?? selectedArea?.anchor ?? { x: size / 2, y: size / 2 };
                const point = { x: anchor.x + (direction?.[0] ?? 0), y: anchor.y + (direction?.[1] ?? 0) };
                if (direction) { keyboardPoint.current = { grid, point }; hoverAt(point); return; }
                const area = selectGridArea(size, inset, grid, point);
                if (area) { clearHover(); onSelectArea(area, event.shiftKey || event.metaKey || event.ctrlKey); }
            }} />}
        {hover && <g className="grid-area-hover" clipPath={`url(#${clip})`} aria-hidden="true">
            <path d={hover.path} />
        </g>}
        {(selectedArea || !!selectedAreas?.length) && <g className="grid-area-selection" clipPath={`url(#${clip})`} aria-hidden="true">
            {selectedArea ? <path d={selectedArea.path} /> : selectedAreas?.map((area) => <path key={area.key ?? area.path} d={area.path} />)}
            {selectedArea && <rect x={selectedArea.box.x} y={selectedArea.box.y} width={selectedArea.box.width} height={selectedArea.box.height} />}
        </g>}
        {gridLines(size, inset, preview ?? grid).map((line) => <g key={line.id} data-grid-id={line.id}
            className={selectedIds.includes(line.id) ? "grid-line selected" : "grid-line"}
            tabIndex={0} role="button" aria-pressed={selectedIds.includes(line.id)}
            aria-label={`${line.axis === "rings" ? "Circumference" : line.axis === "rows" ? "Row" : "Column"} ${line.id.split("-").slice(1).join("-")}`}
            aria-keyshortcuts="Escape Delete Backspace ArrowLeft ArrowRight ArrowUp ArrowDown"
            onFocus={() => { if (!pointerFocus.current) onSelect(line.id); }}
            onClick={(event) => { if (event.detail === 0) onSelect(line.id, event.shiftKey || event.metaKey || event.ctrlKey); }}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    const cancelled = drag.current;
                    drag.current = undefined;
                    setPreview(undefined);
                    const svg = event.currentTarget.ownerSVGElement;
                    if (cancelled && svg?.hasPointerCapture(cancelled.pointerId)) svg.releasePointerCapture(cancelled.pointerId);
                    onSelect(undefined);
                    event.currentTarget.blur();
                    return;
                }
                if (drag.current) return;
                if (["Delete", "Backspace"].includes(event.key)) {
                    event.preventDefault();
                    const ids = selectedIds.includes(line.id) ? selectedIds : [line.id];
                    onChange(ids.reduce((next, id) => editGridLine(size, inset, next, id, null, mirror), grid));
                    onSelect(undefined);
                    return;
                }
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(line.id, event.shiftKey || event.metaKey || event.ctrlKey);
                }
                const direction = line.axis === "rows" ? { ArrowUp: -1, ArrowDown: 1 }
                    : line.axis === "columns" ? { ArrowLeft: -1, ArrowRight: 1 }
                    : { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
                const step = direction[event.key as keyof typeof direction];
                if (step && radius > 0) {
                    event.preventDefault();
                    const ids = [line.id, ...selectedIds.filter((id) => id !== line.id)];
                    onChange(moveGridLines(size, inset, grid, ids, step * (event.shiftKey ? 10 : 1) / radius, mirror));
                }
            }}>
            {selectedIds.includes(line.id) && !grid.gapMirrors?.[line.id] && line.bandPath &&
                <path className="grid-line-band" d={line.bandPath} fillRule="evenodd" />}
            <path className="grid-line-visible" d={line.path} />
            <path className="grid-line-hit" d={line.path} />
        </g>)}
    </svg>;
}
