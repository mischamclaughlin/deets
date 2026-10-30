import { devices, type Scene } from "../../shared/scene.ts";
import { gridLines, type GridLine, type GridSettings } from "./grid.ts";

interface Options {
    enabled: boolean;
    night?: boolean;
    threshold?: number;
}
interface GapOptions extends Options {
    mirror?: boolean;
    gridGaps?: boolean;
    elementGaps?: boolean;
}

function geometry(scene: Scene, grid: GridSettings, line: GridLine) {
    const centre = devices[scene.device] / 2;
    const radius = centre - (scene.edgeInset ?? 0);
    // Match editGridLine so applying a snap does not clamp it away from its target.
    const limit = Math.max(0.5, 1 - Math.min(0.5, 0.5 / radius));
    const minimum = line.axis === "rings" ? 1 - limit : -limit;
    const vertical = line.axis === "columns";
    const curved = vertical ? grid.curvedColumns : grid.curvedRows;
    const at = (x: number, y: number): number => {
        const dx = x - centre, dy = y - centre;
        if (dx * dx + dy * dy > radius * radius + 1e-9) return NaN;
        if (line.axis === "rings") return Math.hypot(dx, dy) / radius;
        const cross = vertical ? dy : dx;
        const factor = curved ? Math.sqrt(Math.max(0, 1 - (cross / radius) ** 2)) : 1;
        // Ellipse endpoints are shared by every curve and have no unique target.
        return factor < 1e-9 ? NaN : (vertical ? dx : dy) / (radius * factor);
    };
    return { centre, radius, minimum, limit, vertical, at };
}

function elements(scene: Scene, night = false) {
    return scene.elements.filter((element) => element.source !== "secondsRing" &&
        element.visible !== (night ? "day" : "night"));
}

function elementTargets(scene: Scene, grid: GridSettings, line: GridLine, night = false): number[] {
    const { at } = geometry(scene, grid, line);
    return elements(scene, night).flatMap((element) =>
        [element.x, element.x + element.width / 2, element.x + element.width].flatMap((x) =>
            [element.y, element.y + element.height / 2, element.y + element.height].map((y) => at(x, y))));
}

function gapTargets(scene: Scene, grid: GridSettings, line: GridLine, desired: number, options: GapOptions): number[] {
    const { vertical, at } = geometry(scene, grid, line);
    const result: number[] = [];
    if (options.gridGaps !== false) {
        const lines = gridLines(devices[scene.device], scene.edgeInset ?? 0, grid);
        const mirrored = options.mirror && line.axis !== "rings";
        const partner = mirrored ? lines.find((other) => other.id !== line.id && other.axis === line.axis &&
            Math.abs(other.value + line.value) < 1e-9)?.id ??
            (line.id.endsWith("-mirror") ? line.id.slice(0, -7) : `${line.id}-mirror`) : undefined;
        // Positions are affine in the dragged value: a mirrored partner moves as -value.
        const positions = [line.axis === "rings" ? 0 : -1, 1].map((value) => ({ a: value, b: 0 }));
        for (const other of lines) {
            if (other.axis === line.axis && other.id !== line.id && other.id !== partner)
                positions.push({ a: other.value, b: 0 });
        }
        if (mirrored) positions.push({ a: 0, b: -1 });
        const ordered = positions.sort((left, right) => (left.a + left.b * desired) - (right.a + right.b * desired));
        const upper = ordered.findIndex((point) => point.a + point.b * desired > desired);
        const left = ordered[upper - 1], right = ordered[upper];
        if (upper > 0 && right) {
            const consider = (value: number) => {
                // A solution must retain the neighbour order used by its equation.
                const retainsOrder = ordered.every((point, index) => index === 0 ||
                    ordered[index - 1].a + ordered[index - 1].b * value <= point.a + point.b * value + 1e-9);
                if (retainsOrder && value > left.a + left.b * value + 1e-9 &&
                    value < right.a + right.b * value - 1e-9) result.push(value);
            };
            // Equal gaps on either side, or repeat the immediately adjacent interval.
            consider((left.a + right.a) / (2 - left.b - right.b));
            const previous = ordered[upper - 2], next = ordered[upper + 1];
            if (previous) consider((2 * left.a - previous.a) / (1 - 2 * left.b + previous.b));
            if (next) consider((2 * right.a - next.a) / (1 - 2 * right.b + next.b));
        }
    }
    if (options.elementGaps !== false && line.axis !== "rings") {
        const boxes = elements(scene, options.night).map((element) => ({
            start: vertical ? element.x : element.y,
            end: vertical ? element.x + element.width : element.y + element.height,
            crossStart: vertical ? element.y : element.x,
            crossEnd: vertical ? element.y + element.height : element.x + element.width,
        }));
        // Sweep perpendicular bands. Adjacent occupied intervals bound genuinely empty gaps,
        // including when another element blocks only part of the overlap between a pair.
        const edges = [...new Set(boxes.flatMap((box) => [box.crossStart, box.crossEnd]))].sort((a, b) => a - b);
        for (let index = 1; index < edges.length; index++) {
            const cross = (edges[index - 1] + edges[index]) / 2;
            const active = boxes.filter((box) => box.crossStart < cross && box.crossEnd > cross)
                .sort((a, b) => a.start - b.start);
            let end: number | undefined;
            for (const box of active) {
                if (end !== undefined && box.start > end) {
                    const midpoint = (end + box.start) / 2;
                    result.push(vertical ? at(midpoint, cross) : at(cross, midpoint));
                }
                end = end === undefined ? box.end : Math.max(end, box.end);
            }
        }
    }
    return result;
}

function nearest(scene: Scene, grid: GridSettings, line: GridLine, desired: number, targets: number[], threshold = 6): number {
    const { radius, minimum, limit } = geometry(scene, grid, line);
    if (!grid.visible || radius <= 0 || !Number.isFinite(radius) || !Number.isFinite(desired) ||
        !Number.isFinite(threshold) || threshold < 0) return desired;
    let best = desired, distance = threshold + 1e-9;
    for (const value of targets) {
        if (!Number.isFinite(value) || value < minimum || value > limit) continue;
        const delta = Math.abs(value - desired) * radius;
        if (delta < distance) { best = value; distance = delta; }
    }
    return best;
}

/** Align browser-only grid geometry to native element edges and centres. */
export function snapGridLineToElements(scene: Scene, grid: GridSettings, line: GridLine,
    desiredValue: number, options: Options): number {
    return options.enabled ? nearest(scene, grid, line, desiredValue, elementTargets(scene, grid, line, options.night), options.threshold) : desiredValue;
}

/** Find equal neighbouring grid intervals and the centres of empty element gaps. */
export function snapGridLineToEvenGaps(scene: Scene, grid: GridSettings, line: GridLine,
    desiredValue: number, options: GapOptions): number {
    return options.enabled && grid.visible && Number.isFinite(desiredValue)
        ? nearest(scene, grid, line, desiredValue, gapTargets(scene, grid, line, desiredValue, options), options.threshold) : desiredValue;
}

/** Compare every enabled target with the original pointer position; direct alignment wins ties. */
export function snapGridLine(scene: Scene, grid: GridSettings, line: GridLine, desiredValue: number,
    options: Omit<GapOptions, "enabled"> & { toElements: boolean; toEvenGaps: boolean }): number {
    if (!grid.visible || !Number.isFinite(desiredValue)) return desiredValue;
    const targets = options.toElements ? elementTargets(scene, grid, line, options.night) : [];
    if (options.toEvenGaps) targets.push(...gapTargets(scene, grid, line, desiredValue, { ...options, enabled: true }));
    return nearest(scene, grid, line, desiredValue, targets, options.threshold);
}
