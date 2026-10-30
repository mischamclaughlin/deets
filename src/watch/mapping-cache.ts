import type { Scene, WatchMapping } from "../../shared/scene.ts";

interface Prepared { day?: WatchMapping; night?: WatchMapping }
const prepared = new WeakMap<Scene, Prepared>();
const sources: Array<{ mapping: WatchMapping; night: boolean; shape: string }> = [];
let previewSequence = 0;

function shape(scene: Scene): string {
    const value = { ...scene, elements: scene.elements.map((element) => ({ ...element, x: 0, y: 0 })) };
    return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item);
}

function save(scene: Scene, night: boolean, mapping: WatchMapping): WatchMapping {
    const entry = prepared.get(scene) ?? {};
    entry[night ? "night" : "day"] = mapping;
    prepared.set(scene, entry);
    return mapping;
}

/** Keep canonical mutation responses so the canvas does not request them again. */
export function rememberMapping(mapping: WatchMapping, night = false): WatchMapping {
    const previous = sources.findIndex((entry) => entry.mapping.scene === mapping.scene && entry.night === night);
    if (previous >= 0) sources.splice(previous, 1);
    sources.push({ mapping, night, shape: shape(mapping.scene) });
    if (sources.length > 16) sources.shift();
    return save(mapping.scene, night, mapping);
}

/** Translate canonical clipped ink only when every other scene property is unchanged. */
export function preparedMapping(scene: Scene, night = false): WatchMapping | undefined {
    const exact = prepared.get(scene)?.[night ? "night" : "day"];
    if (exact) return exact;
    const signature = shape(scene);
    const source = sources.findLast((entry) => entry.night === night && entry.shape === signature)?.mapping;
    if (!source) return;
    const offsets = new Map<string, { x: number; y: number }>();
    let moved = false;
    for (let index = 0; index < scene.elements.length; index++) {
        const element = scene.elements[index];
        const original = source.scene.elements[index];
        if (!Number.isInteger(element.x) || !Number.isInteger(element.y) || element.x < 0 || element.y < 0 ||
            element.x + element.width > source.size || element.y + element.height > source.size) return;
        const offset = { x: element.x - original.x, y: element.y - original.y };
        if (offset.x || offset.y) {
            if (element.source === "secondsRing") return;
            if (scene.edgeInset !== undefined) {
                const radius = source.size / 2 - scene.edgeInset;
                if ([element.x, element.x + element.width].some((x) =>
                    [element.y, element.y + element.height].some((y) =>
                        (x - source.size / 2) ** 2 + (y - source.size / 2) ** 2 > radius ** 2))) return;
            }
            moved = true;
        }
        offsets.set(element.id, offset);
    }
    if (source.ops.some((operation) => operation.kind === "rect" ? moved : !offsets.has(operation.elementId))) return;
    const translated: WatchMapping = {
        ...source,
        scene,
        // A browser translation is not a fresh server validation token.
        mapping: `preview:${++previewSequence}`,
        areas: source.areas.map((area) => {
            const offset = offsets.get(area.id)!;
            return { ...area, x: area.x + offset.x, y: area.y + offset.y };
        }),
        ops: source.ops.map((operation) => {
            if (operation.kind === "rect") return operation;
            const offset = offsets.get(operation.elementId)!;
            return { ...operation, x: operation.x + offset.x, y: operation.y + offset.y };
        }),
    };
    return save(scene, night, translated);
}
