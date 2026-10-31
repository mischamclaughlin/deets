import { devices, type Scene } from "../../shared/scene.ts";
import { activityParts } from "./library-catalogue.ts";

export type IconPosition = "above" | "below";

/** Read the actual geometry so independent dragging and resizing stay editable. */
export function activityLayout(scene: Scene, activityId: string) {
    const value = scene.elements.find((element) => element.id === activityId);
    const parts = value && activityParts[value.source as keyof typeof activityParts];
    const icon = parts && scene.elements.find((element) => element.activityId === activityId && element.source === parts.icon);
    if (!value || !icon || !parts) return;
    const position: IconPosition = icon.y + icon.height / 2 <= value.y + value.height / 2 ? "above" : "below";
    const gap = Math.max(0, position === "above" ? value.y - icon.y - icon.height : icon.y - value.y - value.height);
    return { value, icon, parts, position, gap };
}

/** Arrange linked boxes; the native layout API validates the resulting boundary. */
export function arrangeActivity(scene: Scene, activityId: string, position: IconPosition, gap: number): Scene {
    if ((position !== "above" && position !== "below") || !Number.isInteger(gap) || gap < 0 || gap > devices[scene.device])
        throw new Error(`Enter a whole-pixel gap from 0 to ${devices[scene.device]}.`);
    const layout = activityLayout(scene, activityId);
    if (!layout) throw new Error("Choose activity data with a linked icon.");
    const { value, icon, parts } = layout;
    const y = position === "above" ? value.y - icon.height - gap : value.y + value.height + gap;
    const previousBottom = Math.max(value.y + value.height, icon.y + icon.height);
    const nextBottom = Math.max(value.y + value.height, y + icon.height);
    return { ...scene, elements: scene.elements.map((element) => {
        if (element.id === icon.id)
            return { ...element, x: value.x + Math.floor((value.width - icon.width) / 2), y };
        // Preserve a following graph's gap; independently positioned graphs stay put.
        if (element.activityId === activityId && element.source === parts.graph && element.y >= previousBottom)
            return { ...element, y: element.y + nextBottom - previousBottom };
        return element;
    }) };
}
