import { isClockSource, isDateSource, type Scene } from "../../shared/scene.ts";
import { libraryEntries } from "./library-catalogue.ts";

/** Keep added elements recognisable in the list and inspector, including copies. */
export function elementName(scene: Scene, id: string): string {
    const selected = scene.elements.findIndex((element) => element.id === id);
    if (selected < 0) return id;
    const element = scene.elements[selected];
    if (element.source === "customIcon") {
        const name = element.icon?.name?.trim() || "Imported icon";
        const matching = scene.elements.filter((item) => item.source === "customIcon" && (item.icon?.name?.trim() || "Imported icon") === name);
        return matching.length > 1 ? `${name} ${matching.findIndex((item) => item.id === id) + 1}` : name;
    }
    const group = (source: string) => isClockSource(source) ? "Time"
        : isDateSource(source) ? "Date"
            : libraryEntries.find((entry) => entry.source === source)?.label;
    const label = group(element.source);
    if (!label) return element.id;
    const number = scene.elements.slice(0, selected + 1).filter((item) => group(item.source) === label).length;
    return `${label} ${number}`;
}

export function activityName(scene: Scene, id: string): string | undefined {
    const source = scene.elements.find((element) => element.id === id)?.source;
    return libraryEntries.some((entry) => entry.source === source && entry.category !== "clock" && entry.category !== "device")
        ? elementName(scene, id) : undefined;
}
