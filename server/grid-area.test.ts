import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGridAreas, toggleGridArea } from '../src/watch/grid-area-selection.ts';
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


const rectangleGrid = () => grid({ 'rows-1': -.4, 'rows-2': 0, 'rows-3': .4,
    'columns-1': -.4, 'columns-2': 0, 'columns-3': .4 });
const rectangleCells = (settings = rectangleGrid()) => [
    { x: 40, y: 40 }, { x: 60, y: 40 }, { x: 40, y: 60 }, { x: 60, y: 60 },
].map((point) => selectGridArea(100, 0, settings, point)!);

test('two adjacent cells and complete two-by-two collections merge into one seam-free placement rectangle', () => {
    const cells = rectangleCells();
    const row = mergeGridAreas(100, 0, cells.slice(0, 2));
    assert.equal(row.error, undefined);
    assert.deepEqual(row.area!.box, { x: 30, y: 30, width: 40, height: 20 });
    assert.equal(row.area!.path, 'M30 30h40v20h-40Z');
    const square = mergeGridAreas(100, 0, cells);
    assert.equal(square.error, undefined);
    assert.deepEqual(square.area!.box, { x: 30, y: 30, width: 40, height: 40 });
    insideCircle(square.area!, 100, 0);
    assert.deepEqual(mergeGridAreas(100, 0, [cells[0], cells[0], cells[1]]).area!.box, row.area!.box);
});

test('L shapes and diagonal contact stay selected but cannot become a placement rectangle', () => {
    const cells = rectangleCells();
    for (const collection of [[cells[0], cells[3]], cells.slice(0, 3)]) {
        const merged = mergeGridAreas(100, 0, collection);
        assert.equal(merged.area, undefined);
        assert.match(merged.error!, /connected.*rectangle.*gaps/);
    }
});

test('gaps and a missing central cell cannot be filled by the collection bounding box', () => {
    const settings = grid(Object.fromEntries(['rows', 'columns'].flatMap((axis) =>
        [-.6, -.2, .2, .6].map((value, index) => [`${axis}-${index + 1}`, value]))));
    const cells = [30, 50, 70].flatMap((y) => [30, 50, 70].map((x) => selectGridArea(100, 0, settings, { x, y })!));
    assert.equal(mergeGridAreas(100, 0, cells.filter((_, index) => index !== 4)).area, undefined);
    assert.equal(mergeGridAreas(100, 0, [cells[0], cells[2]]).area, undefined);
    assert.deepEqual(mergeGridAreas(100, 0, cells).area!.box, { x: 20, y: 20, width: 60, height: 60 });
});

test('fractional cell boundaries merge continuously and round only the final placement box inward', () => {
    const settings = grid({ 'rows-1': -.394, 'rows-2': .006,
        'columns-1': -.396, 'columns-2': .004, 'columns-3': .404 });
    const cells = [40, 60].map((x) => selectGridArea(100, 0, settings, { x, y: 40 })!);
    const merged = mergeGridAreas(100, 0, cells);
    assert.equal(merged.error, undefined);
    assert.ok(Math.abs(merged.area!.rectangle!.x - 30.2) < 1e-8);
    assert.ok(Math.abs(merged.area!.rectangle!.y - 30.3) < 1e-8);
    assert.deepEqual(merged.area!.box, { x: 31, y: 31, width: 39, height: 19 });
    const tinyGap = grid({ 'rows-1': -.4, 'rows-2': .4, 'columns-1': -.4,
        'columns-2': -.002, 'columns-3': .002, 'columns-4': .4 });
    const separated = [40, 60].map((x) => selectGridArea(100, 0, tinyGap, { x, y: 50 })!);
    assert.equal(mergeGridAreas(100, 0, separated).area, undefined, 'a subpixel slit must not disappear when merging');
});

test('stretched band interiors can join neighbouring cells into one continuous rectangle', () => {
    const settings = grid({ 'rows-1': 0, 'rows-2': -.4, 'rows-3': .4,
        'columns-1': -.4, 'columns-2': .4 }, { gaps: { 'rows-1': 10 } });
    const cells = [40, 50, 60].map((y) => selectGridArea(100, 0, settings, { x: 50, y })!);
    assert.deepEqual(mergeGridAreas(100, 0, cells).area!.box, { x: 30, y: 30, width: 40, height: 40 });
});

test('curved or circumference-cut outer edges and annular holes never produce a false rectangle', () => {
    const quarters = grid({ 'rows-1': 0, 'columns-1': 0 });
    const clipped = [25, 75].map((x) => selectGridArea(100, 0, quarters, { x, y: 25 })!);
    assert.equal(mergeGridAreas(100, 0, clipped).area, undefined);
    const curved = rectangleGrid();
    curved.curvedRows = true;
    const curvedCells = rectangleCells(curved);
    assert.equal(mergeGridAreas(100, 0, curvedCells.slice(0, 2)).area, undefined);
    const annular = grid({ 'rings-1': .5, 'rows-1': 0 });
    const ringCells = [10, 90].map((y) => selectGridArea(100, 0, annular, { x: 50, y })!);
    assert.equal(mergeGridAreas(100, 0, ringCells).area, undefined);
    // A distant ring is redundant: it must not prevent ordinary rectangles.
    const redundant = rectangleGrid();
    redundant.edits!['rings-1'] = .9;
    assert.deepEqual(mergeGridAreas(100, 0, rectangleCells(redundant)).area!.box,
        { x: 30, y: 30, width: 40, height: 40 });
});

test('single-cell placement is preserved and mixed grid provenance cannot be combined', () => {
    const cell = rectangleCells()[0];
    assert.equal(mergeGridAreas(100, 0, [cell]).area, cell);
    assert.equal(mergeGridAreas(100, 1, [cell]).area, undefined);
    assert.equal(mergeGridAreas(100, -1, [cell]).area, undefined);
    assert.deepEqual(mergeGridAreas(100, 0, []), {});
    const changed = rectangleGrid();
    changed.edits!['columns-2'] = .1;
    const other = selectGridArea(100, 0, changed, { x: 60, y: 40 })!;
    assert.match(mergeGridAreas(100, 0, [cell, other]).error!, /grid changed/i);
    assert.equal(mergeGridAreas(100, 1, rectangleCells().slice(0, 2)).area, undefined);
});

test('additive selection toggles stable cells without depending on the click point or changing prior arrays', () => {
    const settings = rectangleGrid();
    const [first, second] = rectangleCells(settings);
    const collection = toggleGridArea([], first, true);
    const both = toggleGridArea(collection, second, true);
    assert.deepEqual(collection, [first]);
    assert.deepEqual(both, [first, second]);
    const same = selectGridArea(100, 0, settings, { x: 44, y: 44 })!;
    assert.equal(first.key, same.key);
    assert.deepEqual(toggleGridArea(both, same, true), [second]);
    assert.deepEqual(toggleGridArea(both, first, false), [first]);
});
