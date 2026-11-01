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
