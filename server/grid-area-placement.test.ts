import test from 'node:test';
import assert from 'node:assert/strict';
import { placeElementsInArea } from '../src/watch/grid-area-placement.ts';
import { scene as initial } from '../src/watch/scene.ts';
import { callBridge } from './bridge.ts';
import type { Scene, WatchMapping } from '../shared/scene.ts';

const box = { x: 80, y: 150, width: 256, height: 100 };

test('placing text uses the area box and centres native ink without changing typography, colours or layer', async () => {
    const scene: Scene = { ...initial, elements: [
        { ...initial.elements[0], id: 'back' },
        { ...initial.elements[0], id: 'front', backgroundColour: 0, nightBackgroundColour: 0x123456 },
    ] };
    const before = structuredClone(scene);
    const placed = placeElementsInArea(scene, ['front'], box);
    assert.deepEqual(placed.elements.map((item) => item.id), ['back', 'front']);
    assert.equal(placed.elements[0], scene.elements[0]);
    assert.deepEqual(placed.elements[1], { ...scene.elements[1], ...box, boxSizing: 'fixed', align: 'centre', verticalAlign: 'middle' });
    assert.deepEqual(scene, before);
    const mapped = await callBridge<WatchMapping>('layout', { scene: placed });
    assert.deepEqual(mapped.scene, placed);
    const ink = mapped.ops.filter((op) => op.kind === 'bitmap' && op.elementId === 'front');
    const top = Math.min(...ink.map((op) => op.y));
    const bottom = Math.max(...ink.map((op) => op.y + op.height));
    assert.ok(Math.abs((top + bottom) - (2 * box.y + box.height)) <= 1);
});

test('new groups retain their relative arrangement and every box fits the selected area', () => {
    const scene: Scene = { ...initial, elements: [
        { ...initial.elements[0], id: 'value', x: 100, y: 100, width: 100, height: 40 },
        { ...initial.elements[0], id: 'icon', source: 'stepsIcon', x: 76, y: 108, width: 20, height: 20 },
    ] };
    const small = { x: 80, y: 170, width: 150, height: 50 };
    const placed = placeElementsInArea(scene, ['value', 'icon'], small);
    assert.ok(placed.elements[1].x < placed.elements[0].x);
    for (const element of placed.elements) {
        assert.ok(element.x >= small.x && element.y >= small.y);
        assert.ok(element.x + element.width <= small.x + small.width);
        assert.ok(element.y + element.height <= small.y + small.height);
        assert.ok([element.x, element.y, element.width, element.height].every(Number.isInteger));
    }
    assert.equal(placed.elements[1].boxSizing, undefined);
});

test('invalid or missing targets and watch-boundary rings cannot be placed', () => {
    assert.throws(() => placeElementsInArea(initial, [], box), /existing element/);
    assert.throws(() => placeElementsInArea(initial, ['missing'], box), /existing element/);
    assert.throws(() => placeElementsInArea(initial, ['time'], { ...box, width: 0 }), /room/);
    assert.throws(() => placeElementsInArea(initial, ['time'], { ...box, x: .5 }), /room/);
    const ring: Scene = { ...initial, elements: [{ ...initial.elements[0], source: 'secondsRing' }] };
    assert.throws(() => placeElementsInArea(ring, ['time'], box), /watch boundary/);
    assert.deepEqual(initial.elements.map((item) => item.id), ['time']);
});
