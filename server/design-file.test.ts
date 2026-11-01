import test from 'node:test';
import assert from 'node:assert/strict';
import { designFilename, maxDesignBytes, parseDesign, prepareDesign, serialiseDesign } from '../src/watch/design-file.ts';
import { defaultGrid, gridLines } from '../src/watch/grid.ts';
import { scene } from '../src/watch/scene.ts';
import { createHistory, recordHistory, undoHistory, redoHistory } from '../src/watch/history.ts';

test('design files round-trip scene, presets and independent guide settings without changing either', () => {
    const document = { scene: structuredClone(scene), grid: {
        ...defaultGrid, visible: true, curvedRows: true, circumferences: 2,
        edits: { 'rows-1': .25, 'columns-1': -.4, 'rings-1': null },
        gaps: { 'rows-1': 12 }, gapMirrors: { 'rows-1': true },
    } };
    const original = structuredClone(document);
    const parsed = parseDesign(serialiseDesign(document));
    assert.deepEqual(parsed, original);
    assert.deepEqual(document, original);
    assert.deepEqual(gridLines(416, 0, parsed.grid), gridLines(416, 0, original.grid));
    parsed.scene.elements[0].x++;
    assert.deepEqual(document, original);
});

test('invalid, oversized and unsupported files are rejected before native preparation', () => {
    assert.throws(() => parseDesign('{'), /valid JSON/);
    assert.throws(() => parseDesign(' '.repeat(maxDesignBytes + 1)), /1 MB/);
    for (const value of [null, [], {}, { format: 'deets', version: 2, scene, grid: defaultGrid },
        { format: 'deets', version: 1, scene: { ...scene, device: '__proto__' }, grid: defaultGrid }]) {
        assert.throws(() => parseDesign(JSON.stringify(value)), /supported/);
    }
});

test('hidden grids cannot bypass geometry and annotation validation', () => {
    for (const grid of [
        { ...defaultGrid, visible: 'yes' },
        { ...defaultGrid, curvedRows: null },
        { ...defaultGrid, edits: [] },
        { ...defaultGrid, gaps: null },
        { ...defaultGrid, edits: { 'rows-1': 1.5 } },
        { ...defaultGrid, edits: { 'bad-id': 0 } },
        { ...defaultGrid, gaps: { 'rows-1': -1 } },
        { ...defaultGrid, gapMirrors: { 'rows-1': 1 } },
        { ...defaultGrid, circumferences: 25 },
        { ...defaultGrid, circumferenceSpacing: 0 },
        { ...defaultGrid, unexpected: true },
    ]) assert.throws(() => parseDesign(JSON.stringify({ format: 'deets', version: 1, scene, grid })));
    assert.throws(() => parseDesign(serialiseDesign({ scene: { ...scene, edgeInset: 999 }, grid: defaultGrid })), /clearance/);
});

test('whole-document imports form one reversible history entry', () => {
    const before = { scene, grid: defaultGrid };
    const imported = parseDesign(serialiseDesign({ scene: { ...scene, name: 'Imported design' },
        grid: { ...defaultGrid, visible: true, edits: { 'rows-1': .2 } } }));
    const history = recordHistory(createHistory(before), imported);
    assert.equal(history.past.length, 1);
    assert.deepEqual(undoHistory(history).present, before);
    assert.deepEqual(redoHistory(undoHistory(history)).present, imported);
});

test('download names remain usable for punctuation and empty names', () => {
    assert.equal(designFilename(' My design / version 2 '), 'My-design-version-2.deets.json');
    assert.equal(designFilename('../'), 'design.deets.json');
});

test('import prepares native glyphs with only the scene and keeps browser guides separate', async (context) => {
    const document = { scene, grid: { ...defaultGrid, visible: true, edits: { 'rows-1': .2 } } };
    const mapped = { ...scene, name: 'Native-validated design' };
    const fetch = context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
        assert.equal(path, '/api/garmin/refresh-fonts');
        assert.deepEqual(JSON.parse(options.body as string), { scene });
        return Response.json({ scene: mapped });
    });
    assert.deepEqual(await prepareDesign(serialiseDesign(document)), { scene: mapped, grid: document.grid });
    assert.equal(fetch.mock.callCount(), 1);
});

test('malformed imports, native failures and cancellation cannot produce an imported document', async (context) => {
    const fetch = context.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Missing custom font' }, { status: 400 }));
    await assert.rejects(prepareDesign('{}'), /supported/);
    assert.equal(fetch.mock.callCount(), 0);
    const text = serialiseDesign({ scene, grid: defaultGrid });
    await assert.rejects(prepareDesign(text), /Missing custom font/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(prepareDesign(text, controller.signal), /abort/i);
    assert.equal(fetch.mock.callCount(), 1);
});
