import { isClockSource, isDateSource, type Scene } from "../../shared/scene.ts";

/** Use the same name in the element list and the selection inspector. */
export function elementLabel(scene: Scene, id: string): string {
    const index = scene.elements.findIndex((element) => element.id === id);
    const element = scene.elements[index];
    if (!element) return id;
    if (element.source === "customIcon") return element.icon?.name || "Custom icon";
    const preceding = scene.elements.slice(0, index + 1);
    if (isClockSource(element.source)) {
        return `Time ${preceding.filter((item) => isClockSource(item.source)).length}`;
    }
    if (isDateSource(element.source)) {
        return `Date ${preceding.filter((item) => isDateSource(item.source)).length}`;
    }
    if (element.source === "divider") {
        return `Divider ${preceding.filter((item) => item.source === "divider").length}`;
    }
    return element.id;
}
