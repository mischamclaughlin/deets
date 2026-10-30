import { useEffect, useRef, useState } from "react";
import type { ActivityAddOptions, Scene, WatchMapping } from "../../shared/scene.ts";
import { addElement } from "./api.ts";
import type { LibrarySource } from "./library-catalogue.ts";
import { paintWatch } from "./raster.ts";

const previews = new Map<string, WatchMapping>();

/** Render the actual native element, including its current default font. */
export function ElementPreview({ scene, source, options }: { scene: Scene; source: LibrarySource; options?: ActivityAddOptions }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const selection = JSON.stringify(options ?? null);
    const snapshot = JSON.stringify({ ...scene, background: 0, elements: [] });
    useEffect(() => {
        const controller = new AbortController();
        const key = `${source}:${selection}:${snapshot}`;
        const cached = previews.get(key);
        void (cached ? Promise.resolve(cached) : addElement(JSON.parse(snapshot) as Scene, source, controller.signal, JSON.parse(selection) ?? undefined))
            .then(async (mapping) => {
                if (controller.signal.aborted) return;
                previews.set(key, mapping);
                if (previews.size > 48) previews.delete(previews.keys().next().value!);
                const frame = document.createElement("canvas");
                await paintWatch(frame, { ...mapping, background: 0x1c2927 }, controller.signal);
                if (controller.signal.aborted || !canvas.current) return;
                const elements = mapping.scene.elements;
                const left = Math.min(...elements.map((element) => element.x));
                const top = Math.min(...elements.map((element) => element.y));
                const width = Math.max(...elements.map((element) => element.x + element.width)) - left;
                const height = Math.max(...elements.map((element) => element.y + element.height)) - top;
                const output = canvas.current;
                output.width = width;
                output.height = height;
                const context = output.getContext("2d")!;
                context.imageSmoothingEnabled = false;
                context.drawImage(frame, left, top, width, height, 0, 0, width, height);
                setStatus("ready");
            }).catch(() => {
                if (!controller.signal.aborted) setStatus("error");
            });
        return () => controller.abort();
    }, [snapshot, source, selection]);
    return <span className="element-preview" aria-hidden="true">
        <canvas ref={canvas} className={status === "ready" ? "" : "preview-hidden"} />
        {status !== "ready" && <span className="preview-placeholder">{status === "error" ? "Preview unavailable" : "Loading preview…"}</span>}
    </span>;
}
