import { devices, type CustomIcon, type Scene, type SceneElement } from "../../shared/scene.ts";

/** Trim transparent margins and pack visible alpha into portable native coverage. */
export function packIcon(name: string, width: number, height: number, rgba: Uint8ClampedArray): CustomIcon {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 64 || height > 64 || rgba.length !== width * height * 4)
        throw new Error("Choose an icon with valid pixel dimensions.");
    let left = width, right = -1, top = height, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (rgba[(y * width + x) * 4 + 3] < 128) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) throw new Error("This icon has no visible pixels. Choose another file.");
    const w = right - left + 1, h = bottom - top + 1;
    const bytes = new Uint8Array(Math.ceil(w * h / 8));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const index = y * w + x;
        if (rgba[((y + top) * width + x + left) * 4 + 3] >= 128)
            bytes[Math.floor(index / 8)] |= 1 << (7 - index % 8);
    }
    return { name: name.replace(/\.[^.]+$/, "").split("").filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join("").trim().slice(0, 60) || "Custom icon",
        width: w, height: h, bits: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") };
}

/** Begin at native resolution, centred within every supported watch's safe circle. */
export function sceneWithIcon(scene: Scene, icon: CustomIcon, id: string): Scene {
    if (scene.elements.length >= 40) throw new Error("All 40 slots are in use. Delete an element to add another.");
    const size = devices[scene.device];
    const element: SceneElement = { id, source: "customIcon", icon, font: "widget",
        x: Math.floor((size - icon.width) / 2), y: Math.floor((size - icon.height) / 2),
        width: icon.width, height: icon.height, align: "centre", colour: 0xdceccf, nightColour: 0x8d99ae, visible: "both" };
    return { ...scene, elements: [...scene.elements, element] };
}
