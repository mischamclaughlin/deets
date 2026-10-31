import type { Scene } from "../../shared/scene.ts";

export type LayerAction = "front" | "forward" | "backward" | "back";

/** Scene drawing runs back to front; the Layers list presents the front first. */
export const frontToBack = (scene: Scene) => scene.elements.toReversed();

export function moveLayer(scene: Scene, elementId: string, action: LayerAction): Scene {
    const index = scene.elements.findIndex((element) => element.id === elementId);
    if (index < 0) return scene;
    const last = scene.elements.length - 1;
    const destination = { front: last, forward: Math.min(last, index + 1), backward: Math.max(0, index - 1), back: 0 }[action];
    if (destination === index) return scene;
    const elements = [...scene.elements];
    const [element] = elements.splice(index, 1);
    elements.splice(destination, 0, element);
    return { ...scene, elements };
}

/** Place a dragged layer on either side of a row in the front-first list. */
export function placeLayer(scene: Scene, elementId: string, targetId: string, edge: "before" | "after"): Scene {
    if (elementId === targetId || !scene.elements.some((element) => element.id === elementId)) return scene;
    const layers = frontToBack(scene);
    const element = layers.find((item) => item.id === elementId)!;
    const remaining = layers.filter((item) => item.id !== elementId);
    const target = remaining.findIndex((item) => item.id === targetId);
    if (target < 0) return scene;
    remaining.splice(target + (edge === "after" ? 1 : 0), 0, element);
    const elements = remaining.toReversed();
    return elements.every((item, index) => item === scene.elements[index]) ? scene : { ...scene, elements };
}
