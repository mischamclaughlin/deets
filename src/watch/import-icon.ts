import type { CustomIcon } from "../../shared/scene.ts";
import { packIcon } from "./icon-mask.ts";

/** Decode local artwork only; no original SVG markup enters the saved document. */
export async function importIcon(file: File, signal: AbortSignal): Promise<CustomIcon> {
    if (!/\.(png|svg)$/i.test(file.name) || file.size > 2 * 1024 * 1024 || !file.size)
        throw new Error("Choose a PNG or SVG icon up to 2 MB.");
    let blob: Blob;
    if (/\.svg$/i.test(file.name)) {
        const text = await file.text();
        if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Choose a self-contained SVG icon.");
        const document = new DOMParser().parseFromString(text, "image/svg+xml");
        if (document.querySelector("parsererror") || document.documentElement.localName !== "svg")
            throw new Error("This file is not a valid SVG icon.");
        // Keep a small static vector subset. Imported icons cannot fetch external assets.
        const tags = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "title", "desc"]);
        for (const node of document.querySelectorAll("*")) {
            if (!tags.has(node.localName) || node.namespaceURI !== "http://www.w3.org/2000/svg")
                throw new Error("Use a self-contained SVG with shapes and paths; convert text to outlines first.");
            for (const attribute of node.attributes) {
                if (/^on/i.test(attribute.name) || attribute.value.includes("\\") || /href$/i.test(attribute.localName) || /@import|expression\s*\(/i.test(attribute.value) ||
                    Array.from(attribute.value.matchAll(/url\s*\(([^)]*)\)/gi)).some((match) => !/^['"]?#[\w-]+['"]?$/.test(match[1].trim())))
                    throw new Error("Choose a self-contained SVG without links or external resources.");
            }
        }
        const svg = document.documentElement;
        const viewBox = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
        const width = parseFloat(svg.getAttribute("width") || ""), height = parseFloat(svg.getAttribute("height") || "");
        const w = viewBox?.length === 4 ? viewBox[2] : width;
        const h = viewBox?.length === 4 ? viewBox[3] : height;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
            throw new Error("Give the SVG a valid viewBox or width and height.");
        const scale = Math.min(1, 64 / Math.max(w, h));
        svg.setAttribute("width", String(Math.max(1, Math.round(w * scale))));
        svg.setAttribute("height", String(Math.max(1, Math.round(h * scale))));
        blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    } else {
        const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte))
            throw new Error("This file is not a valid PNG icon.");
        const header = new DataView(bytes.buffer);
        if (!header.getUint32(16) || !header.getUint32(20) || header.getUint32(16) > 4096 || header.getUint32(20) > 4096)
            throw new Error("PNG icons must be no larger than 4096 × 4096 pixels.");
        blob = new Blob([file], { type: "image/png" });
    }
    signal.throwIfAborted();
    const url = URL.createObjectURL(blob);
    const image = new Image();
    try {
        image.src = url;
        await image.decode();
        signal.throwIfAborted();
        const scale = Math.min(1, 64 / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Icon import is unavailable in this browser.");
        context.drawImage(image, 0, 0, width, height);
        return packIcon(file.name, width, height, context.getImageData(0, 0, width, height).data);
    } finally { URL.revokeObjectURL(url); }
}
