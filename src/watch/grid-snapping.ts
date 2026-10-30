import { devices, type Scene } from "../../shared/scene.ts";
import { gridLineGap, type GridLine, type GridSettings } from "./grid.ts";

interface Options {
    enabled: boolean;
    night?: boolean;
    threshold?: number;
}

/** Align browser-only grid geometry to native element edges and centres. */
export function snapGridLineToElements(scene: Scene, grid: GridSettings, line: GridLine,
    desiredValue: number, options: Options): number {
    const centre = devices[scene.device] / 2;
    const radius = centre - (scene.edgeInset ?? 0);
    const threshold = options.threshold ?? 6;
    if (!options.enabled || !grid.visible || radius <= 0 || !Number.isFinite(radius) ||
        !Number.isFinite(desiredValue) || !Number.isFinite(threshold) || threshold < 0) return desiredValue;
    // Match editGridLine's visible-chord limits so applying a snap does not move it again.
    const limit = Math.max(0.5, 1 - Math.min(0.5, 0.5 / radius));
    const minimum = line.axis === "rings" ? 1 - limit : -limit;
    const vertical = line.axis === "columns";
    const curved = vertical ? grid.curvedColumns : grid.curvedRows;
    const halfGap = gridLineGap(devices[scene.device], scene.edgeInset ?? 0, grid, line.id) / (2 * radius);
    let best = desiredValue;
    let distance = threshold + 1e-9;
    for (const element of scene.elements) {
        if (element.source === "secondsRing" || element.visible === (options.night ? "day" : "night")) continue;
        for (const x of [element.x, element.x + element.width / 2, element.x + element.width]) {
            for (const y of [element.y, element.y + element.height / 2, element.y + element.height]) {
                const dx = x - centre, dy = y - centre;
                if (dx * dx + dy * dy > radius * radius + 1e-9) continue;
                let value: number;
                if (line.axis === "rings") value = Math.hypot(dx, dy) / radius;
                else {
                    const cross = vertical ? dy : dx;
                    const factor = curved ? Math.sqrt(Math.max(0, 1 - (cross / radius) ** 2)) : 1;
                    // An ellipse endpoint is shared by every curve and supplies no unique snap.
                    if (factor < 1e-9) continue;
                    value = (vertical ? dx : dy) / (radius * factor);
                }
                for (const target of halfGap > 0 ? [value - halfGap, value + halfGap] : [value]) {
                    if (!Number.isFinite(target) || target - halfGap < minimum || target + halfGap > limit) continue;
                    const delta = Math.abs(target - desiredValue) * radius;
                    if (delta < distance) { best = target; distance = delta; }
                }
            }
        }
    }
    return best;
}
