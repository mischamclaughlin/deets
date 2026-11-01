import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import type { GridSettings } from "./grid.ts";
import { selectGridArea, type GridArea } from "./grid-area.ts";

interface Context {
    size: number;
    inset: number;
    grid: GridSettings;
    scene: Scene;
    selectedArea?: GridArea;
    enabled: boolean;
}
interface Feedback { context: Context; area?: GridArea }
const matches = (left: Context, right: Context) => left.size === right.size && left.inset === right.inset
    && left.grid === right.grid && left.scene === right.scene && left.selectedArea === right.selectedArea && left.enabled === right.enabled;

/** Pointer feedback belongs to its scene, so placing an element clears it immediately. */
export function useGridAreaHover(context: Context) {
    const latest = useRef(context);
    const frame = useRef(0);
    const pending = useRef<{ context: Context; point: { x: number; y: number } } | undefined>(undefined);
    const cache = useRef<Feedback | undefined>(undefined);
    const [feedback, setFeedback] = useState<Feedback>();
    useLayoutEffect(() => { latest.current = context; });
    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    function clearHover() {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        pending.current = undefined;
        cache.current = undefined;
        setFeedback(undefined);
    }
    function hoverAt(point: { x: number; y: number }) {
        if (!context.enabled) return;
        pending.current = { context, point };
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            const request = pending.current;
            pending.current = undefined;
            if (!request || !matches(request.context, latest.current)) return;
            const previous = cache.current && matches(cache.current.context, request.context) ? cache.current.area : undefined;
            const { x, y } = request.point;
            // Most pointer movement stays inside the known safe placement box;
            // reuse that region rather than flood-filling it on every frame.
            let area = previous && x >= previous.box.x && x < previous.box.x + previous.box.width
                && y >= previous.box.y && y < previous.box.y + previous.box.height
                ? previous : selectGridArea(request.context.size, request.context.inset, request.context.grid, request.point);
            if (area && previous?.path === area.path) area = previous;
            const next = { context: request.context, area };
            cache.current = next;
            setFeedback((current) => current && current.area === area && matches(current.context, request.context) ? current : next);
        });
    }
    return { hoveredArea: feedback && matches(feedback.context, context) ? feedback.area : undefined, hoverAt, clearHover };
}
