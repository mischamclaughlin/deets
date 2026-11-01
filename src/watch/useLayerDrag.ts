import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Scene } from "../../shared/scene.ts";
import { frontToBack, placeLayer } from "./layers.ts";
import { layerDragLayout, type LayerSlot } from "./layer-drag.ts";

interface Preview {
    scene: Scene;
    id: string;
    settling: boolean;
    offset: number;
    shifts: Map<string, number>;
}

/** Keep the actual tile under pointer capture; scene order changes only after release. */
export function useLayerDrag(scene: Scene, busy: boolean, apply: (next: Scene) => Promise<void>, onSelect: (id: string) => void) {
    const list = useRef<HTMLUListElement>(null);
    const latest = useRef(scene);
    const cleanup = useRef<(() => void) | undefined>(undefined);
    const suppressClick = useRef(false);
    const [preview, setPreview] = useState<Preview>();
    useLayoutEffect(() => { latest.current = scene; }, [scene]);
    useEffect(() => () => cleanup.current?.(), []);

    function start(event: PointerEvent<HTMLLIElement>, id: string) {
        if (busy || cleanup.current || event.button !== 0 || !event.isPrimary || !list.current) return;
        const tile = event.currentTarget;
        const origin = event.clientY;
        const originX = event.clientX;
        const slots: LayerSlot[] = Array.from(list.current.children, (child) => {
            const rect = child.getBoundingClientRect();
            return { id: (child as HTMLElement).dataset.layerId!, top: rect.top, height: rect.height };
        });
        const scroll = tile.closest<HTMLElement>(".sidebar-scroll");
        const initialScroll = scroll?.scrollTop ?? 0;
        const controller = new AbortController();
        let active = false;
        let pointerY = origin;
        let frame = 0;
        let timer = 0;
        let previousTime = 0;
        let layout = layerDragLayout(slots, id, 0);
        const dispose = () => {
            controller.abort();
            cancelAnimationFrame(frame);
            window.clearTimeout(timer);
            if (tile.hasPointerCapture(event.pointerId)) tile.releasePointerCapture(event.pointerId);
            cleanup.current = undefined;
        };
        cleanup.current = dispose;

        function update() {
            layout = layerDragLayout(slots, id, pointerY - origin + (scroll?.scrollTop ?? 0) - initialScroll);
            setPreview({ scene, id, settling: false, offset: layout.offset, shifts: layout.shifts });
        }
        function tick(time: number) {
            if (latest.current !== scene) { finish(true); return; }
            const elapsed = previousTime ? Math.min(time - previousTime, 32) : 16;
            previousTime = time;
            if (scroll) {
                const bounds = scroll.getBoundingClientRect();
                const edge = 40;
                const speed = pointerY < bounds.top + edge
                    ? -Math.min(1, (bounds.top + edge - pointerY) / edge)
                    : pointerY > bounds.bottom - edge ? Math.min(1, (pointerY - bounds.bottom + edge) / edge) : 0;
                const before = scroll.scrollTop;
                scroll.scrollTop += speed * elapsed * 0.45;
                if (scroll.scrollTop !== before) update();
            }
            frame = requestAnimationFrame(tick);
        }
        function finish(cancelled: boolean) {
            controller.abort();
            cancelAnimationFrame(frame);
            if (tile.hasPointerCapture(event.pointerId)) tile.releasePointerCapture(event.pointerId);
            if (!active || latest.current !== scene) { dispose(); setPreview(undefined); return; }
            const settled = cancelled ? layerDragLayout(slots, id, 0) : layout;
            setPreview({ scene, id, settling: true, offset: settled.shifts.get(id) ?? 0, shifts: settled.shifts });
            const target = frontToBack(scene)[settled.destination];
            const source = slots.findIndex((slot) => slot.id === id);
            const next = cancelled || source === settled.destination ? scene
                : placeLayer(scene, id, target.id, settled.destination < source ? "before" : "after");
            timer = window.setTimeout(() => {
                void (async () => {
                    if (latest.current === scene && next !== scene) await apply(next);
                    dispose();
                    setPreview(undefined);
                })();
            }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
        }
        const options = { signal: controller.signal };
        window.addEventListener("pointermove", (move) => {
            if (move.pointerId !== event.pointerId) return;
            pointerY = move.clientY;
            if (!active) {
                if (Math.hypot(pointerY - origin, move.clientX - originX) < 5) return;
                active = true;
                suppressClick.current = true;
                tile.setPointerCapture(event.pointerId);
                onSelect(id);
                frame = requestAnimationFrame(tick);
            }
            move.preventDefault();
            update();
        }, { ...options, passive: false });
        window.addEventListener("pointerup", (up) => {
            if (up.pointerId !== event.pointerId) return;
            if (active) { pointerY = up.clientY; update(); }
            finish(false);
        }, options);
        window.addEventListener("pointercancel", (cancel) => { if (cancel.pointerId === event.pointerId) finish(true); }, options);
        tile.addEventListener("lostpointercapture", () => finish(true), options);
        window.addEventListener("keydown", (key) => { if (key.key === "Escape") { key.preventDefault(); finish(true); } }, options);
        window.addEventListener("blur", () => finish(true), options);
        // A new press must never inherit click suppression from a cancelled gesture.
        suppressClick.current = false;
    }

    return {
        list,
        preview: preview?.scene === scene ? preview : undefined,
        start,
        suppressClick(event: { preventDefault(): void; stopPropagation(): void }) {
            if (!suppressClick.current) return;
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
        },
    };
}
