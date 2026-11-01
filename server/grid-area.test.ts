import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGrid, type GridSettings } from '../src/watch/grid.ts';
import { selectGridArea, type GridArea } from '../src/watch/grid-area.ts';

const grid = (edits: GridSettings['edits'], rest: Partial<GridSettings> = {}): GridSettings =>
    ({ ...defaultGrid, visible: true, edits, ...rest });

function insideCircle(area: GridArea, size: number, inset: number) {
    const { x, y, width, height } = area.box;
    assert.ok([x, y, width, height].every(Number.isInteger));
    assert.ok(width > 0 && height > 0);
    for (const xx of [x, x + width]) for (const yy of [y, y + height]) {
        assert.ok((xx - size / 2) ** 2 + (yy - size / 2) ** 2 <= (size / 2 - inset) ** 2 + 1e-8);
    }
}

test('straight guide cells have independent connected coverage and safe maximal boxes', () => {
    const settings = grid({ 'rows-1': 0, 'columns-1': 0 });
    const before = structuredClone(settings);
    const left = selectGridArea(100, 0, settings, { x: 25, y: 25 })!;
    const same = selectGridArea(100, 0, settings, { x: 35, y: 35 })!;
    const right = selectGridArea(100, 0, settings, { x: 75, y: 25 })!;
    assert.deepEqual(left.bounds, { x: 0, y: 0, width: 50, height: 50 });
    assert.deepEqual(left.box, { x: 15, y: 15, width: 35, height: 35 });
    assert.deepEqual(same.bounds, left.bounds);
    assert.equal(same.path, left.path);
    assert.equal(right.bounds.x, 50);
    assert.equal(right.pixels, left.pixels);
    assert.ok(left.path.startsWith('M'));
    assert.deepEqual(settings, before);
    insideCircle(left, 100, 0);
    insideCircle(right, 100, 0);
});

test('stretched bands select their interiors using both edges regardless of Mirror presentation', () => {
    const settings = grid({ 'rows-1': 0 }, { gaps: { 'rows-1': 20 } });
    const band = selectGridArea(100, 0, settings, { x: 50, y: 50 })!;
    assert.equal(band.bounds.y, 40);
    assert.equal(band.bounds.height, 20);
    assert.deepEqual(band.box, { x: 2, y: 40, width: 96, height: 20 });
    const mirrored = selectGridArea(100, 0, { ...settings, gapMirrors: { 'rows-1': true } }, { x: 50, y: 50 })!;
    assert.deepEqual(mirrored, band);
    const above = selectGridArea(100, 0, settings, { x: 50, y: 20 })!;
    assert.ok(above.box.y + above.box.height <= 40);
    insideCircle(band, 100, 0);
});

test('curved rows and columns keep complete placement rectangles on their selected sides', () => {
    const settings = grid({ 'rows-1': .5, 'columns-1': -.5 }, { curvedRows: true, curvedColumns: true });
    const area = selectGridArea(100, 0, settings, { x: 50, y: 60 })!;
    const { x, y, width, height } = area.box;
    for (let yy = y; yy <= y + height; yy++) for (let xx = x; xx <= x + width; xx++) {
        const row = 50 + 25 * Math.sqrt(Math.max(0, 1 - ((xx - 50) / 50) ** 2));
        const column = 50 - 25 * Math.sqrt(Math.max(0, 1 - ((yy - 50) / 50) ** 2));
        assert.ok(yy <= row + 1e-8);
        assert.ok(xx >= column - 1e-8);
    }
    insideCircle(area, 100, 0);
});

test('rings distinguish inner discs and outer annuli without filling the hole', () => {
    const settings = grid({ 'rings-1': .6 });
    const inner = selectGridArea(100, 0, settings, { x: 50, y: 50 })!;
    const outer = selectGridArea(100, 0, settings, { x: 50, y: 10 })!;
    assert.equal(inner.bounds.x, 20);
    assert.equal(inner.bounds.y, 20);
    const { x, y, width, height } = outer.box;
    const nearX = Math.max(x - 50, 50 - x - width, 0);
    const nearY = Math.max(y - 50, 50 - y - height, 0);
    assert.ok(nearX ** 2 + nearY ** 2 >= 30 ** 2);
    insideCircle(inner, 100, 20);
    insideCircle(outer, 100, 0);
});

test('disconnected regions with the same guide-side signature remain separate', () => {
    const settings = grid({ 'rows-1': -.2, 'rows-2': .2, 'rings-1': .6 });
    const left = selectGridArea(100, 0, settings, { x: 10, y: 50 })!;
    const right = selectGridArea(100, 0, settings, { x: 90, y: 50 })!;
    assert.ok(left.bounds.x + left.bounds.width < 50);
    assert.ok(right.bounds.x > 50);
    assert.equal(left.pixels, right.pixels);
    assert.notEqual(left.path, right.path);
});

test('fractional guides use the clicked side and retain conservative integer placement', () => {
    const settings = grid({ 'rows-1': .004 }); // y=50.2
    const above = selectGridArea(100, 0, settings, { x: 50, y: 50.1 })!;
    const below = selectGridArea(100, 0, settings, { x: 50, y: 50.3 })!;
    assert.ok(above.box.y + above.box.height <= 50);
    assert.ok(below.box.y >= 51);
    insideCircle(above, 100, 0);
    insideCircle(below, 100, 0);
});

test('all watch sizes preserve the inset circle with curved guides, rings and bands', () => {
    for (const size of [390, 416, 454]) {
        const settings = grid({ 'rows-1': -.25, 'columns-1': .25, 'rings-1': .8 }, {
            curvedRows: true, curvedColumns: true, gaps: { 'rows-1': 12, 'rings-1': 10 },
        });
        const area = selectGridArea(size, 16, settings, { x: size / 2, y: size / 2 })!;
        insideCircle(area, size, 16);
        assert.ok(area.path.length < 100000);
    }
});

test('hidden, empty, invalid or exterior selections do not produce a placement area', () => {
    const settings = grid({ 'rows-1': 0 });
    assert.equal(selectGridArea(100, 0, defaultGrid, { x: 50, y: 50 }), undefined);
    assert.equal(selectGridArea(100, 0, grid({}), { x: 50, y: 50 }), undefined);
    assert.equal(selectGridArea(100, 0, settings, { x: 0, y: 0 }), undefined);
    assert.equal(selectGridArea(100, 50, settings, { x: 50, y: 50 }), undefined);
    assert.equal(selectGridArea(100, -1, settings, { x: 50, y: 50 }), undefined);
    assert.equal(selectGridArea(100.5, 0, settings, { x: 50, y: 50 }), undefined);
    assert.equal(selectGridArea(100000, 0, settings, { x: 50, y: 50 }), undefined);
    assert.equal(selectGridArea(100, 0, settings, { x: NaN, y: 50 }), undefined);
    assert.equal(selectGridArea(100, 0, grid({ 'rows-1': Infinity }), { x: 50, y: 50 }), undefined);
});
