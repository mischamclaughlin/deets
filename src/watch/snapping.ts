import { devices, type Scene, type SceneElement } from "../../shared/scene.ts";
import { gridRadii, type GridSettings } from "./grid.ts";

interface Point { x: number; y: number }
export interface SnapOptions {
    enabled: boolean;
    showGuideLines: boolean;
    showCircumference: boolean;
    grid?: GridSettings;
    threshold?: number;
}

/** All geometry is in native pixels, independent of browser text and CSS. */
export function moveElement(scene: Scene, element: SceneElement, desired: Point, options: SnapOptions): Point {
    if (element.source === "secondsRing") return { x: element.x, y: element.y };
    const size = devices[scene.device];
    const centre = size / 2;
    const radius = centre - (scene.edgeInset ?? 0);
    const { width, height } = element;
    const valid = (point: Point) => {
        if (point.x < 0 || point.y < 0 || point.x + width > size || point.y + height > size) return false;
        return scene.edgeInset === undefined || [point.x, point.x + width].every((x) =>
            [point.y, point.y + height].every((y) => (x - centre) ** 2 + (y - centre) ** 2 <= radius ** 2));
    };
    const centred = { x: Math.floor((size - width) / 2), y: Math.floor((size - height) / 2) };
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
        const result = options.showGuideLines ? [centre] : [];
        if (grid?.visible) {
            const count = vertical ? grid.columns : grid.rows;
            const curved = vertical ? grid.curvedColumns : grid.curvedRows;
            if (Math.abs(cross) <= radius) {
                const factor = Math.sqrt(Math.max(0, 1 - (cross / radius) ** 2));
                for (let index = 1; index < count; index++) {
                    const offset = radius * (2 * index / count - 1);
                    if (curved) result.push(centre + offset * factor);
                    else if (offset ** 2 + cross ** 2 <= radius ** 2) result.push(centre + offset);
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
        if (options.showCircumference) {
            // Use the farthest box corner to make boundary snaps safe for the whole box.
            const perpendicular = axis === "x" ? location.y : location.x;
            const otherExtent = axis === "x" ? height : width;
            const farthest = Math.max(Math.abs(perpendicular - centre), Math.abs(perpendicular + otherExtent - centre));
            if (farthest <= radius) {
                const span = Math.sqrt(Math.max(0, radius ** 2 - farthest ** 2));
                values.push(Math.ceil(centre - span), Math.floor(centre + span - extent));
            }
        }
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
