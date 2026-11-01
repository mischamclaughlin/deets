import test from 'node:test';
import assert from 'node:assert/strict';
import { devices, type Scene, type WatchMapping } from '../shared/scene.ts';
import { applyBatchGeometry, changeBatchGeometry, type BoxField } from '../src/watch/batch-geometry.ts';
import { scene } from '../src/watch/scene.ts';
import { callBridge } from './bridge.ts';

function selectedScene(): Scene {
    return { ...structuredClone(scene), elements: Array.from({ length: 3 }, (_, index) => ({
        ...structuredClone(scene.elements[0]), id: `time-${index}`, x: 145 + index * 5,
        y: 150 + index * 5, width: 80, height: 88,
    })) };
}

test('batch geometry assigns each absolute field and preserves unselected and unrelated values', () => {
    for (const [field, value] of [['x', 160], ['y', 170], ['width', 60], ['height', 70]] as const) {
        const original = selectedScene();
        const before = structuredClone(original);
        const changed = changeBatchGeometry(original, ['time-0', 'time-1'], field, value);
        for (const element of changed.elements.slice(0, 2)) {
            assert.equal(element[field], value);
            for (const other of ['x', 'y', 'width', 'height'] as const)
                if (other !== field) assert.equal(element[other], original.elements.find((item) => item.id === element.id)![other]);
        }
        assert.equal(changed.elements[2], original.elements[2]);
        assert.deepEqual(original, before);
        if (field === 'width' || field === 'height') assert.equal(changed.elements[0].boxSizing, 'fixed');
    }
});

test('batch geometry preserves unselected activity partners and keeps seconds rings square', () => {
    const original = selectedScene();
    original.elements[0] = { ...original.elements[0], source: 'steps', activityId: 'group', moveTogether: true };
    original.elements[1] = { ...original.elements[1], source: 'stepsIcon', activityId: 'group' };
    original.elements[2] = { ...original.elements[2], source: 'secondsRing', width: 80, height: 80 };
    const moved = changeBatchGeometry(original, ['time-0'], 'x', 170);
    assert.equal(moved.elements[1], original.elements[1]);
    for (const field of ['width', 'height'] as const) {
        const resized = changeBatchGeometry(original, ['time-1', 'time-2'], field, 64);
        assert.equal(resized.elements[2].width, 64);
        assert.equal(resized.elements[2].height, 64);
        assert.equal(resized.elements[1].boxSizing, undefined);
        assert.equal(resized.elements[2].boxSizing, undefined);
    }
});

test('invalid values and stale selections fail before changing any element', () => {
    const original = selectedScene();
    const before = structuredClone(original);
    for (const value of [-1, 416, NaN, Infinity, 1.5])
        assert.throws(() => changeBatchGeometry(original, ['time-0'], 'x', value), /whole-pixel/);
    for (const value of [0, 417])
        assert.throws(() => changeBatchGeometry(original, ['time-0'], 'width', value), /whole-pixel/);
    for (const ids of [[], ['missing'], ['time-0', 'missing']])
        assert.throws(() => changeBatchGeometry(original, ids, 'x', 10), /Select/);
    assert.throws(() => changeBatchGeometry(original, ['time-0'], 'other' as BoxField, 10), /Choose/);
    assert.deepEqual(original, before);
});

test('batch edits make one native request containing every assignment before returning a snapshot', async (context) => {
    const original = selectedScene();
    let requests = 0;
    context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
        requests++;
        assert.equal(path, '/api/garmin/layout');
        const payload = JSON.parse(options.body as string);
        assert.equal(payload.night, false);
        assert.deepEqual(payload.scene.elements.slice(0, 2).map((element: { x: number }) => element.x), [160, 160]);
        assert.deepEqual(payload.scene.elements[2], original.elements[2]);
        return Response.json({ scene: payload.scene });
    });
    const result = await applyBatchGeometry(original, ['time-0', 'time-1'], 'x', 160);
    assert.equal(requests, 1);
    assert.equal(result.elements[0].x, 160);
    assert.equal(original.elements[0].x, 145);
});

test('native rejections and cancellation cannot publish partially applied batch boxes', async (context) => {
    const original = selectedScene();
    const before = structuredClone(original);
    const fetch = context.mock.method(globalThis, 'fetch', async () =>
        Response.json({ error: 'A selected box exceeds the circumference.' }, { status: 400 }));
    await assert.rejects(applyBatchGeometry(original, ['time-0', 'time-1'], 'x', 400), /circumference/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(applyBatchGeometry(original, ['time-0'], 'x', 10, controller.signal), /abort/i);
    assert.equal(fetch.mock.callCount(), 1);
    const late = new AbortController();
    context.mock.method(globalThis, 'fetch', async () => {
        late.abort();
        return Response.json({ scene: original });
    });
    await assert.rejects(applyBatchGeometry(original, ['time-0'], 'x', 160, late.signal), /abort/i);
    assert.deepEqual(original, before);
});

test('batch boxes round-trip native validation on every watch and reject boundary violations', async () => {
    for (const device of Object.keys(devices) as Scene['device'][]) {
        let original = { ...selectedScene(), device };
        original = { ...original, elements: original.elements.map((element) => ({ ...element, boxSizing: 'fixed' as const })) };
        for (const [field, value] of [['x', 150], ['y', 160], ['width', 70], ['height', 80]] as const) {
            const changed = changeBatchGeometry(original, ['time-0', 'time-1'], field, value);
            const mapped = await callBridge<WatchMapping>('layout', { scene: changed });
            assert.deepEqual(mapped.scene, changed);
        }
        const invalid = changeBatchGeometry(original, ['time-0', 'time-1'], 'x', 0);
        await assert.rejects(callBridge('layout', { scene: invalid }), /circumference/);
    }
});
