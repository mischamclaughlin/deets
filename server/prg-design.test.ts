import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readPrgDesign, maxPrgBytes } from '../src/watch/prg-design.ts';
import { scene } from '../src/watch/scene.ts';
import { defaultGrid } from '../src/watch/grid.ts';

const linkedScene = { ...scene,
    name: 'Éditable design',
    textPresets: [{ id: 'time-style', name: 'Time style', size: 88, thickness: 0, width: 100, letterSpacing: 1 }],
    colourPresets: [{ id: 'rose', name: 'Rose', colour: 0xff0000 }],
    elements: [{ ...scene.elements[0], textPresetId: 'time-style', colourPresetId: 'rose' }],
};
const document = { format: 'deets', version: 1, scene: linkedScene, grid: { ...defaultGrid, visible: true, edits: { 'rows-1': 0.2 } } };
const envelope = (text = JSON.stringify(document)) => `DEETS_EDITABLE_V1:${deflateSync(text).toString('base64')}:END_DEETS_EDITABLE_V1`;
function section(tag: number, body: Uint8Array = new Uint8Array()) {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(tag);
    header.writeUInt32BE(body.length, 4);
    return Buffer.concat([header, body]);
}
function program(resource = envelope(), code = 'opaque executable bytes') {
    return Buffer.concat([section(0xd000d00d), section(0xc0debabe, Buffer.from(code)),
        section(0xf00d600d, Buffer.from(`\x00\x01resource-table\x00${resource}\x00`)), section(0)]);
}

test('a compiled resource restores the exact scene, links, presets and browser grid without running code', async () => {
    const original = program();
    const copy = Buffer.from(original);
    assert.deepEqual(await readPrgDesign(original), { scene: linkedScene, grid: document.grid });
    assert.deepEqual(original, copy);
});

test('CLI metadata without a grid restores default annotations', async () => {
    const cli = { format: document.format, version: document.version, scene };
    assert.deepEqual(await readPrgDesign(program(envelope(JSON.stringify(cli)))) , { scene, grid: defaultGrid });
});

test('legacy PRGs and markers outside compiler resources cannot masquerade as editable exports', async () => {
    await assert.rejects(readPrgDesign(program('old resources', envelope())), /no editable Deets design/);
    await assert.rejects(readPrgDesign(new Uint8Array([1, 2, 3])), /damaged or unsupported/);
    const truncated = program().subarray(0, program().length - 1);
    await assert.rejects(readPrgDesign(truncated), /damaged or unsupported/);
    const oversized = new Uint8Array(maxPrgBytes + 1);
    await assert.rejects(readPrgDesign(oversized), /16 MB/);
    const invalidLength = program();
    invalidLength.writeUInt32BE(0xffffffff, 4);
    await assert.rejects(readPrgDesign(invalidLength), /damaged or unsupported/);
});

test('damaged, duplicate, invalid and excessively expanded documents are rejected', async () => {
    for (const value of [envelope() + envelope(), 'DEETS_EDITABLE_V1:%%%:END_DEETS_EDITABLE_V1',
        'DEETS_EDITABLE_V1:AAAA:END_DEETS_EDITABLE_V1', envelope('{'), envelope('{}'),
        envelope(JSON.stringify({ ...document, grid: { ...defaultGrid, circumferences: 999 } })),
        envelope(' '.repeat(1024 * 1024 + 1))]) {
        await assert.rejects(readPrgDesign(program(value)));
    }
    const duplicateSection = Buffer.concat([section(0xd000d00d), section(0xf00d600d), section(0xf00d600d), section(0)]);
    await assert.rejects(readPrgDesign(duplicateSection), /damaged or unsupported/);
});

test('cancelled imports do not return an editable document', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(readPrgDesign(program(), controller.signal), { name: 'AbortError' });
});
