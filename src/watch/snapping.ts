import { devices, type Scene, type SceneElement } from "../../shared/scene.ts";
import { gridLines, gridLineValues, gridRadii, type GridSettings } from "./grid.ts";
import { activityParts } from "./library-catalogue.ts";

interface Point { x: number; y: number }
export interface SnapOptions {
    enabled: boolean;
    showGuideLines: boolean;
    snapToGrid?: boolean;
    snapToGuides?: boolean;
    snapToElements?: boolean;
    night?: boolean;
    grid?: GridSettings;
    threshold?: number;
}

/** Only an activity's icon and data share movement; its graph is independent. */
export function linkedElementIds(scene: Scene, elementId: string): string[] {
    const selected = scene.elements.find((element) => element.id === elementId);
    if (!selected) return [];
    const root = selected.activityId
        ? scene.elements.find((element) => element.id === selected.activityId)
        : selected;
    if (!root || root.moveTogether === false) return [elementId];
    const iconSource = activityParts[root.source as keyof typeof activityParts]?.icon;
    if (selected.id !== root.id && selected.source !== iconSource) return [elementId];
    return scene.elements.filter((element) => element.id === root.id ||
        (element.activityId === root.id && element.source === iconSource))
        .map((element) => element.id);
}

/** Apply a single bounded native-pixel translation to the selected activity. */
export function moveSceneElement(scene: Scene, elementId: string, desired: Point, options: SnapOptions): Scene {
    const selected = scene.elements.find((element) => element.id === elementId);
    if (!selected) return scene;
    const position = moveElement(scene, selected, desired, options);
    const dx = position.x - selected.x, dy = position.y - selected.y;
    if (!dx && !dy) return scene;
    const linked = new Set(linkedElementIds(scene, elementId));
    return { ...scene, elements: scene.elements.map((element) => linked.has(element.id)
        ? { ...element, x: element.x + dx, y: element.y + dy } : element) };
}

/** All geometry is in native pixels, independent of browser text and CSS. */
export function moveElement(scene: Scene, element: SceneElement, desired: Point, options: SnapOptions): Point {
    if (element.source === "secondsRing") return { x: element.x, y: element.y };
    const size = devices[scene.device];
    const centre = size / 2;
    const radius = centre - (scene.edgeInset ?? 0);
    const { width, height } = element;
    const linked = new Set(linkedElementIds(scene, element.id));
    const members = scene.elements.filter((item) => linked.has(item.id) && item.id !== element.id).concat(element);
    const valid = (point: Point) => members.every((member) => {
        const x = point.x + member.x - element.x, y = point.y + member.y - element.y;
        if (x < 0 || y < 0 || x + member.width > size || y + member.height > size) return false;
        return scene.edgeInset === undefined || [x, x + member.width].every((cx) =>
            [y, y + member.height].every((cy) => (cx - centre) ** 2 + (cy - centre) ** 2 <= radius ** 2));
    });
    const left = Math.min(...members.map((member) => member.x));
    const top = Math.min(...members.map((member) => member.y));
    const right = Math.max(...members.map((member) => member.x + member.width));
    const bottom = Math.max(...members.map((member) => member.y + member.height));
    let centred = { x: Math.floor((size - (right - left)) / 2) + element.x - left,
        y: Math.floor((size - (bottom - top)) / 2) + element.y - top };
    // An asymmetric group can fit even when its bounding rectangle's centre cannot.
    if (!valid(centred)) centred = { x: element.x, y: element.y };
    if (!valid(centred) || !Number.isFinite(desired.x) || !Number.isFinite(desired.y))
        return { x: element.x, y: element.y };
    const distance = (point: Point, target: Point) => Math.hypot(point.x - target.x, point.y - target.y);
    let point = { x: Math.round(desired.x), y: Math.round(desired.y) };
    if (!valid(point)) {
        // The feasible region is convex: move out from its centre until reaching its edge.
        let lower = 0, upper = 1;
        for (let iteration = 0; iteration < 48; iteration++) {
            const fraction = (lower + upper) / 2;
            const trial = { x: centred.x + (desired.x - centred.x) * fraction,
                y: centred.y + (desired.y - centred.y) * fraction };
            if (valid(trial)) lower = fraction;
            else upper = fraction;
        }
        const edge = { x: centred.x + (desired.x - centred.x) * lower,
            y: centred.y + (desired.y - centred.y) * lower };
        point = centred;
        for (let x = Math.floor(edge.x) - 1; x <= Math.ceil(edge.x) + 1; x++) {
            for (let y = Math.floor(edge.y) - 1; y <= Math.ceil(edge.y) + 1; y++) {
                const trial = { x, y };
                if (valid(trial) && distance(trial, desired) < distance(point, desired)) point = trial;
            }
        }
    }
    if (!options.enabled) return point;
    const threshold = options.threshold ?? 6;
    const grid = options.grid;
    const targets = (axis: "x" | "y", location: Point): number[] => {
        const vertical = axis === "x";
        const perpendicular = vertical ? location.y + height / 2 : location.x + width / 2;
        const cross = perpendicular - centre;
        const result = options.snapToGuides !== false && options.showGuideLines ? [centre] : [];
        if (options.snapToElements) {
            for (const other of scene.elements) {
                if (other.id === element.id || linked.has(other.id) || other.source === "secondsRing" ||
                    other.visible === (options.night ? "day" : "night")) continue;
                const start = vertical ? other.x : other.y;
                const extent = vertical ? other.width : other.height;
                result.push(start, start + extent / 2, start + extent);
            }
        }
        if (options.snapToGrid !== false && grid?.visible) {
            const curved = vertical ? grid.curvedColumns : grid.curvedRows;
            if (Math.abs(cross) <= radius) {
                const factor = Math.sqrt(Math.max(0, 1 - (cross / radius) ** 2));
                for (const line of gridLines(size, scene.edgeInset ?? 0, grid)) {
                    if (line.axis !== (vertical ? "columns" : "rows")) continue;
                    for (const value of gridLineValues(size, scene.edgeInset ?? 0, grid, line)) {
                        const offset = radius * value;
                        if (curved) result.push(centre + offset * factor);
                        else if (offset ** 2 + cross ** 2 <= radius ** 2) result.push(centre + offset);
                    }
                }
            }
            for (const ring of gridRadii(size, scene.edgeInset ?? 0, grid)) {
                if (Math.abs(cross) > ring) continue;
                const span = Math.sqrt(Math.max(0, ring ** 2 - cross ** 2));
                result.push(centre - span, centre + span);
            }
        }
        return result;
    };
    const candidates = (axis: "x" | "y", location: Point): number[] => {
        const extent = axis === "x" ? width : height;
        const values = targets(axis, location).flatMap((target) => [0, extent / 2, extent]
            .flatMap((anchor) => [Math.floor(target - anchor), Math.ceil(target - anchor)]));
        return [...new Set(values)].filter((value) => Math.abs(value - point[axis]) <= threshold);
    };
    const results: Array<{ point: Point; axes: number }> = [];
    // Try both orders: moving one axis changes the other axis's curved targets.
    for (const [first, second] of [["x", "y"], ["y", "x"]] as const) {
        for (const value of candidates(first, point)) {
            const trial = { ...point, [first]: value };
            if (!valid(trial)) continue;
            results.push({ point: trial, axes: 1 });
            for (const other of candidates(second, trial)) {
                const combined = { ...trial, [second]: other };
                // A second-axis move changes curved intersections: retain both snaps only
                // when the first anchor is still aligned at the final position.
                if (valid(combined) && candidates(first, combined).includes(value))
                    results.push({ point: combined, axes: 2 });
            }
        }
    }
    results.sort((a, b) => b.axes - a.axes || distance(a.point, point) - distance(b.point, point));
    return results[0]?.point ?? point;
}
