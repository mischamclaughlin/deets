import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { editGridLine, gridLines, type GridLine, type GridSettings } from "./grid.ts";
import "./GridOverlay.css";

interface Props {
    size: number;
    inset: number;
    grid: GridSettings;
    mirror: boolean;
    selectedId?: string;
    onSelect: (id: string) => void;
    onChange: (grid: GridSettings) => void;
}
interface Drag {
    pointerId: number;
    line: GridLine;
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
export function GridOverlay({ size, inset, grid, mirror, selectedId, onSelect, onChange }: Props) {
    const drag = useRef<Drag | undefined>(undefined);
    const [preview, setPreview] = useState<GridSettings>();
    const radius = size / 2 - inset;
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
        current.latest = Math.round(delta) === 0 ? current.grid
            : editGridLine(size, inset, current.grid, line.id, line.value + Math.round(delta) / radius, mirror);
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
        role="group" aria-label="Editable grid. Select a line, drag or use arrow keys to move; Delete removes it."
        onPointerDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            const target = event.target instanceof Element ? event.target.closest<SVGGElement>("[data-grid-id]") : null;
            const line = gridLines(size, inset, grid).find((item) => item.id === target?.dataset.gridId);
            const start = pointer(event);
            if (!line || !start) return;
            event.preventDefault();
            onSelect(line.id);
            target?.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointerId: event.pointerId, line, start, grid, latest: grid };
        }}
        onPointerMove={move} onPointerUp={(event) => finish(event, true)}
        onPointerCancel={(event) => finish(event, false)}
        onLostPointerCapture={() => { drag.current = undefined; setPreview(undefined); }}>
        {gridLines(size, inset, preview ?? grid).map((line) => <g key={line.id} data-grid-id={line.id}
            className={selectedId === line.id ? "grid-line selected" : "grid-line"}
            tabIndex={0} role="button" aria-pressed={selectedId === line.id}
            aria-label={`${line.axis === "rings" ? "Circumference" : line.axis === "rows" ? "Row" : "Column"} ${line.id.split("-").slice(1).join("-")}`}
            aria-keyshortcuts="Delete Backspace ArrowLeft ArrowRight ArrowUp ArrowDown"
            onFocus={() => onSelect(line.id)} onClick={() => onSelect(line.id)}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    drag.current = undefined;
                    setPreview(undefined);
                    return;
                }
                if (drag.current) return;
                if (["Delete", "Backspace"].includes(event.key)) {
                    event.preventDefault();
                    onChange(editGridLine(size, inset, grid, line.id, null, mirror));
                    return;
                }
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(line.id); }
                const direction = line.axis === "rows" ? { ArrowUp: -1, ArrowDown: 1 }
                    : line.axis === "columns" ? { ArrowLeft: -1, ArrowRight: 1 }
                    : { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
                const step = direction[event.key as keyof typeof direction];
                if (step && radius > 0) {
                    event.preventDefault();
                    onChange(editGridLine(size, inset, grid, line.id, line.value + step * (event.shiftKey ? 10 : 1) / radius, mirror));
                }
            }}>
            <path className="grid-line-visible" d={line.path} />
            <path className="grid-line-hit" d={line.path} />
        </g>)}
    </svg>;
}
