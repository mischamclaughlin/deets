import test from 'node:test';
import assert from 'node:assert/strict';
import { addGridLine, configureGridRings, defaultGrid, editGridLine, gridLineGap, gridLines, gridLineValues,
    maxGridLineGap, moveGridLines, setGridLineGaps, setGridLineMirrors, type GridSettings } from '../src/watch/grid.ts';

/** Sample SVG endpoint arcs independently to check the actual filled path. */
function contains(path: string, x: number, y: number): boolean {
    const tokens = path.split(/\s+/);
    const contours: number[][][] = [];
    let points: number[][] = [], current = [0, 0], start = [0, 0];
    const number = () => Number(tokens.shift());
    while (tokens.length) {
        const command = tokens.shift();
        if (command === 'M') {
            current = [number(), number()]; start = current; points = [current];
        } else if (command === 'L') {
            current = [number(), number()]; points.push(current);
        } else if (command === 'A') {
            const rx = number(), ry = number();
            assert.equal(number(), 0);
            const large = number(), sweep = number(), end = [number(), number()];
            const dx = (current[0] - end[0]) / 2, dy = (current[1] - end[1]) / 2;
            const scale = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0,
                (rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx) /
                (rx * rx * dy * dy + ry * ry * dx * dx)));
            const cx = scale * rx * dy / ry + (current[0] + end[0]) / 2;
            const cy = -scale * ry * dx / rx + (current[1] + end[1]) / 2;
            const angle = Math.atan2((current[1] - cy) / ry, (current[0] - cx) / rx);
            let delta = Math.atan2((end[1] - cy) / ry, (end[0] - cx) / rx) - angle;
            if (sweep && delta < 0) delta += 2 * Math.PI;
            if (!sweep && delta > 0) delta -= 2 * Math.PI;
            for (let step = 1; step <= 180; step++) {
                const a = angle + delta * step / 180;
                points.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
            }
            current = end;
        } else if (command === 'Z') {
            points.push(start); contours.push(points); current = start;
        } else assert.fail(`Unexpected path command ${command}`);
    }
    let inside = false;
    for (const contour of contours) for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
        const a = contour[i], b = contour[j];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

test('stretched straight, curved and ring bands fill only their bounded interior on every device', () => {
    for (const size of [390, 416, 454]) for (const curved of [false, true]) {
        const inset = 16, radius = size / 2 - inset, centre = size / 2;
        for (const axis of ['rows', 'columns', 'rings'] as const) for (const position of axis === 'rings' ? [.3, .7] : [-.5, 0, .5]) {
            const id = `${axis}-1`;
            const grid: GridSettings = { ...defaultGrid, visible: true, curvedRows: curved, curvedColumns: curved,
                edits: { [id]: position }, gaps: { [id]: 32 } };
            const line = gridLines(size, inset, grid)[0];
            assert.ok(line.bandPath);
            assert.ok(!/NaN|Infinity/.test(line.bandPath));
            const values = gridLineValues(size, inset, grid, line);
            for (const nx of [-.95, -.65, -.45, -.2, -.05, .05, .2, .45, .65, .95]) {
                for (const ny of [-.95, -.65, -.45, -.2, -.05, .05, .2, .45, .65, .95]) {
                    const cross = axis === 'rows' ? nx : ny;
                    const value = axis === 'rows' ? ny : nx;
                    const scale = curved ? Math.sqrt(Math.max(0, 1 - cross * cross)) : 1;
                    const sample = axis === 'rings' ? Math.hypot(nx, ny) : value;
                    const low = axis === 'rings' ? values[0] : values[0] * scale;
                    const high = axis === 'rings' ? values[1] : values[1] * scale;
                    if (Math.min(Math.abs(sample - low), Math.abs(sample - high), Math.abs(Math.hypot(nx, ny) - 1)) < .002) continue;
                    assert.equal(contains(line.bandPath, centre + nx * radius, centre + ny * radius),
                        Math.hypot(nx, ny) < 1 && sample > low && sample < high,
                        `${size} ${axis} curved=${curved} position=${position} sample=${nx},${ny}`);
                }
            }
        }
    }
});

test('band widths clamp near boundaries and zero-width guides have no fill', () => {
    for (const size of [390, 416, 454]) for (const inset of [0, 16, size / 2 - 1]) {
        for (const axis of ['rows', 'columns', 'rings'] as const) {
            const id = `${axis}-1`;
            const grid: GridSettings = { ...defaultGrid, visible: true, edits: { [id]: .9 } };
            assert.equal(gridLines(size, inset, grid)[0].bandPath, undefined);
            const stretched = setGridLineGaps(size, inset, grid, [id], 10000);
            assert.equal(gridLineGap(size, inset, stretched, id), maxGridLineGap(size, inset, grid, [id]));
            const line = gridLines(size, inset, stretched)[0];
            assert.ok(!/NaN|Infinity/.test(line.bandPath ?? ''));
            assert.ok(gridLineValues(size, inset, stretched, line).every(v => v > (axis === 'rings' ? 0 : -1) && v < 1));
        }
    }
});

test('mirror presentation preserves stretch, survives movement and is removed with its guide', () => {
    const added = addGridLine(defaultGrid, 'rows');
    const stretched = setGridLineGaps(416, 16, added.grid, [added.id], 24);
    const mirrored = setGridLineMirrors(stretched, [added.id], true);
    assert.deepEqual(mirrored.gaps, stretched.gaps);
    assert.deepEqual(gridLines(416, 16, mirrored), gridLines(416, 16, stretched));
    assert.equal(moveGridLines(416, 16, mirrored, [added.id], .2).gapMirrors?.[added.id], true);
    const deleted = editGridLine(416, 16, mirrored, added.id, null);
    assert.equal(deleted.gapMirrors, undefined);
    const plain = setGridLineMirrors(mirrored, [added.id], false);
    assert.equal(plain.gapMirrors, undefined);
    assert.deepEqual(plain.gaps, stretched.gaps);
    const rings = configureGridRings(mirrored, { circumferences: 1 });
    const withRingMirror = setGridLineMirrors(rings, ['rings-1'], true);
    assert.deepEqual(configureGridRings(withRingMirror, { circumferences: 0 }).gapMirrors, { [added.id]: true });
    assert.throws(() => setGridLineMirrors(stretched, ['wrong'], true), RangeError);
    assert.throws(() => gridLines(416, 16, { ...stretched, gapMirrors: { 'rows-1': 1 as unknown as boolean } }), RangeError);
    assert.throws(() => setGridLineMirrors(stretched, Array.from({ length: 257 }, (_, i) => `rows-${i + 1}`), true), RangeError);
});
