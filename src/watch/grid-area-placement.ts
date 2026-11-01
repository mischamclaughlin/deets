import { isEditableTextSource, type Scene } from "../../shared/scene.ts";

export interface PlacementBox { x: number; y: number; width: number; height: number }

/** Grid geometry stays outside the scene; only explicit element boxes are saved. */
export function placeElementsInArea(scene: Scene, ids: readonly string[], box: PlacementBox): Scene {
    if (![box.x, box.y, box.width, box.height].every(Number.isSafeInteger) || box.width < 1 || box.height < 1)
        throw new Error("Choose a grid area with room for an element.");
    const selected = scene.elements.filter((element) => ids.includes(element.id));
    if (!selected.length || selected.length !== new Set(ids).size) throw new Error("Choose an existing element.");
    if (selected.some((element) => element.source === "secondsRing"))
        throw new Error("Seconds rings follow the watch boundary. Choose another element for this area.");
    const left = Math.min(...selected.map((element) => element.x));
    const top = Math.min(...selected.map((element) => element.y));
    const width = Math.max(...selected.map((element) => element.x + element.width)) - left;
    const height = Math.max(...selected.map((element) => element.y + element.height)) - top;
    const scale = Math.min(box.width / width, box.height / height);
    const groupWidth = Math.min(box.width, Math.max(1, Math.floor(width * scale)));
    const groupHeight = Math.min(box.height, Math.max(1, Math.floor(height * scale)));
    const x = box.x + Math.floor((box.width - groupWidth) / 2);
    const y = box.y + Math.floor((box.height - groupHeight) / 2);
    return { ...scene, elements: scene.elements.map((element) => {
        if (!ids.includes(element.id)) return element;
        const text = isEditableTextSource(element.source);
        const singleText = selected.length === 1 && text;
        const dx = singleText ? box.x : x + Math.floor((element.x - left) * scale);
        const dy = singleText ? box.y : y + Math.floor((element.y - top) * scale);
        return { ...element, x: dx, y: dy,
            width: singleText ? box.width : Math.max(1, Math.min(box.x + box.width - dx, Math.floor(element.width * scale))),
            height: singleText ? box.height : Math.max(1, Math.min(box.y + box.height - dy, Math.floor(element.height * scale))),
            ...(text ? { boxSizing: "fixed" as const, align: "centre" as const, verticalAlign: "middle" as const } : {}),
        };
    }) };
}
