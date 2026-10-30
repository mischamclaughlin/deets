import { useEffect, useRef, useState } from "react";
import type { Scene, WatchMapping } from "../../shared/scene.ts";
import { addElement } from "./api.ts";
import type { LibrarySource } from "./library-catalogue.ts";
import { paintWatch } from "./raster.ts";

const previews = new Map<string, WatchMapping>();

/** Render the actual native element, including its current default font. */
export function ElementPreview({ scene, source }: { scene: Scene; source: LibrarySource }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const snapshot = JSON.stringify({ ...scene, background: 0, elements: [] });
    useEffect(() => {
        const controller = new AbortController();
        const key = `${source}:${snapshot}`;
        const cached = previews.get(key);
        void (cached ? Promise.resolve(cached) : addElement(JSON.parse(snapshot) as Scene, source, controller.signal))
            .then(async (mapping) => {
                if (controller.signal.aborted) return;
                previews.set(key, mapping);
                if (previews.size > 48) previews.delete(previews.keys().next().value!);
                const frame = document.createElement("canvas");
                await paintWatch(frame, { ...mapping, background: 0x1c2927 }, controller.signal);
                if (controller.signal.aborted || !canvas.current) return;
                const element = mapping.scene.elements[0];
                const output = canvas.current;
                output.width = element.width;
                output.height = element.height;
                const context = output.getContext("2d")!;
                context.imageSmoothingEnabled = false;
                context.drawImage(frame, element.x, element.y, element.width, element.height, 0, 0, element.width, element.height);
                setStatus("ready");
            }).catch(() => {
                if (!controller.signal.aborted) setStatus("error");
            });
        return () => controller.abort();
    }, [snapshot, source]);
    return <span className="element-preview" aria-hidden="true">
        <canvas ref={canvas} className={status === "ready" ? "" : "preview-hidden"} />
        {status !== "ready" && <span className="preview-placeholder">{status === "error" ? "Preview unavailable" : "Loading preview…"}</span>}
    </span>;
}
