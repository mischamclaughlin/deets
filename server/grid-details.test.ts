import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGrid, editGridLine, gridLines, type GridSettings } from '../src/watch/grid.ts';
import { copyGridLines, gridLineDetails } from '../src/watch/grid-details.ts';

test('copies preserve straight, curved and ring geometry and presentation independently', () => {
    const grid: GridSettings = { ...defaultGrid, visible: true, circumferences: 1, curvedRows: true,
        edits: { 'rows-1': -.25, 'columns-1': .3 }, gaps: { 'rows-1': 20 }, gapMirrors: { 'rows-1': true } };
    const original = structuredClone(grid);
    const lines = gridLines(416, 16, grid);
    const result = copyGridLines(416, 16, grid, lines.map((line) => line.id));
    assert.equal(result.ids.length, 3);
    assert.ok(result.ids.includes('rings-25'));
    assert.deepEqual(grid, original);
    const copies = gridLines(416, 16, result.grid).filter((line) => result.ids.includes(line.id));
    assert.deepEqual(copies.map(({ path, bandPath }) => ({ path, bandPath })), lines.map(({ path, bandPath }) => ({ path, bandPath })));
    assert.equal(result.grid.gapMirrors?.['rows-2'], true);
    assert.equal(result.grid.gaps?.['rows-2'], 20);
    const moved = editGridLine(416, 16, result.grid, 'rows-2', .1);
    assert.equal(moved.edits?.['rows-1'], -.25);
    assert.equal(moved.edits?.['rows-2'], .1);
});

test('copy IDs avoid deleted and metadata-only guide IDs, and batch capacity is atomic', () => {
    const grid: GridSettings = { ...defaultGrid, visible: true, edits: { 'rows-1': 0, 'rows-2': null }, gaps: { 'rows-3': 1 } };
    assert.deepEqual(copyGridLines(416, 16, grid, ['rows-1', 'rows-1', 'missing']).ids, ['rows-4']);
    assert.deepEqual(copyGridLines(416, 16, grid, ['missing']), { grid, ids: [] });
    const full: GridSettings = { ...defaultGrid, visible: true,
        edits: Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`rows-${index + 1}`, 0])) };
    const original = structuredClone(full);
    assert.throws(() => copyGridLines(416, 16, full, ['rows-1']), RangeError);
    assert.deepEqual(full, original);
});

test('details expose native coordinates, curved centre crossing, offsets and ring boundaries', () => {
    const grid: GridSettings = { ...defaultGrid, visible: true, curvedRows: true,
        edits: { 'rows-1': -.25, 'columns-1': .5, 'rings-1': .5 }, gaps: { 'rows-1': 20, 'rings-1': 10 } };
    const [row, column, ring] = gridLineDetails(416, 16, grid, ['rows-1', 'columns-1', 'rings-1']);
    assert.equal(row.coordinate, 160);
    assert.equal(row.offset, -48);
    assert.equal(row.curved, true);
    assert.deepEqual(row.edges, [150, 170]);
    assert.equal(column.coordinate, 304);
    assert.equal(column.curved, false);
    assert.equal(ring.coordinate, 96);
    assert.deepEqual(ring.edges, [91, 101]);
    assert.deepEqual(gridLineDetails(416, 16, { ...grid, visible: false }, ['rows-1']), []);
});

test('mirror copies reflect straight and curved bands exactly across the native watch centre', () => {
    for (const size of [390, 416, 454]) for (const curved of [false, true]) {
        const grid: GridSettings = { ...defaultGrid, visible: true, curvedRows: curved, curvedColumns: curved,
            edits: { 'rows-1': -.25, 'columns-1': .3 }, gaps: { 'rows-1': 20, 'columns-1': 12 },
            gapMirrors: { 'rows-1': true } };
        const original = structuredClone(grid);
        const copied = copyGridLines(size, 16, grid, ['rows-1', 'columns-1'], true);
        assert.equal(copied.ids.length, 2);
        const originals = gridLineDetails(size, 16, grid, ['rows-1', 'columns-1']);
        const reflections = gridLineDetails(size, 16, copied.grid, copied.ids);
        for (let index = 0; index < originals.length; index++) {
            const source = originals[index], target = reflections[index];
            assert.equal(source.coordinate + target.coordinate, size);
            assert.equal(source.offset, -target.offset);
            assert.equal(target.width, source.width);
            assert.equal(target.curved, curved);
            assert.equal(source.edges[0] + target.edges[1], size);
            assert.equal(source.edges[1] + target.edges[0], size);
        }
        assert.equal(copied.grid.gapMirrors?.['rows-2'], true);
        const moved = editGridLine(size, 16, copied.grid, 'rows-2', .1);
        assert.equal(moved.edits?.['rows-1'], -.25);
        assert.deepEqual(grid, original);
    }
});

test('mirror copy skips symmetric rings and keeps centred copies independent', () => {
    const grid: GridSettings = { ...defaultGrid, visible: true, circumferences: 2, edits: { 'rows-1': 0 } };
    assert.deepEqual(copyGridLines(416, 16, grid, ['rings-1', 'rings-2'], true), { grid, ids: [] });
    const copied = copyGridLines(416, 16, grid, ['rows-1', 'rows-1', 'rings-1', 'missing'], true);
    assert.deepEqual(copied.ids, ['rows-2']);
    assert.equal(copied.grid.edits?.['rows-2'], 0);
    assert.equal(Object.is(copied.grid.edits?.['rows-2'], -0), false);
    assert.equal(gridLines(416, 16, copied.grid).length, 4);
});

test('mirror batches enforce capacity atomically and only count guides that can be reflected', () => {
    const grid: GridSettings = { ...defaultGrid, visible: true, circumferences: 1,
        edits: Object.fromEntries(Array.from({ length: 255 }, (_, index) => [`rows-${index + 1}`, .2])) };
    const before = structuredClone(grid);
    const copied = copyGridLines(416, 16, grid, ['rings-1', 'rows-1'], true);
    assert.equal(Object.keys(copied.grid.edits!).length, 256);
    assert.throws(() => copyGridLines(416, 16, grid, ['rows-1', 'rows-2'], true), RangeError);
    assert.deepEqual(grid, before);
});
