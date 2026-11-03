import test from 'node:test';
import assert from 'node:assert/strict';
import type { Scene, WatchMapping } from '../shared/scene.ts';
import { groupLayers } from '../src/watch/editor-layout.ts';
import { arrangeGroupMembers, groupBounds, GROUP_SPACING_GAP, type LayoutAction } from '../src/watch/layout-geometry.ts';
import { callBridge } from './bridge.ts';

const scene: Scene = { version: 2, name: 'Group arrangement', device: 'epix2pro47mm', background: 0, edgeInset: 16,
    elements: [100, 130, 240].map((x, index) => ({ id: `member${index}`, source: 'label', text: 'X', font: 'widget',
        boxSizing: 'fixed', x, y: 180 + index * 10, width: [20, 40, 30][index], height: 20,
        align: 'left', colour: 0xffffff, nightColour: 0xffffff, visible: 'both' })) };
const ids = scene.elements.map((element) => element.id);
const layout = groupLayers(scene, undefined, ids, 'Stats');
const groupId = layout.groups[0].id;

test('group bounds follow native boxes and reject missing or empty membership', () => {
    assert.deepEqual(groupBounds(scene, ids), { x: 100, y: 180, width: 170, height: 40 });
    assert.deepEqual(groupBounds({ ...scene, elements: scene.elements.map((element) =>
        element.id === ids[0] ? { ...element, x: 90 } : element) }, ids), { x: 90, y: 180, width: 180, height: 40 });
    assert.equal(groupBounds(scene, []), undefined);
    assert.equal(groupBounds(scene, ['missing']), undefined);
    assert.equal(groupBounds(scene, [ids[0], 'missing']), undefined);
});

test('equal centres and equal gaps have distinct predictable results for unequal widths', () => {
    const gaps = arrangeGroupMembers(scene, layout, groupId, 'distributeX', { spacing: 'gaps' });
    const centres = arrangeGroupMembers(scene, layout, groupId, 'distributeX', { spacing: 'centres' });
    assert.deepEqual(gaps.elements.map((element) => element.x), [100, 160, 240]);
    assert.deepEqual(centres.elements.map((element) => element.x), [100, 163, 240]);
    assert.deepEqual(groupBounds(gaps, ids), groupBounds(scene, ids));
    assert.deepEqual(groupBounds(centres, ids), groupBounds(scene, ids));
    for (const next of [gaps, centres]) next.elements.forEach((element, index) =>
        assert.deepEqual(element, { ...scene.elements[index], x: element.x }));
});

test('vertical equal centres use heights and preserve the horizontal positions', () => {
    const vertical: Scene = { ...scene, elements: scene.elements.map((element, index) =>
        ({ ...element, y: [100, 130, 240][index], height: [20, 40, 30][index] })) };
    const next = arrangeGroupMembers(vertical, layout, groupId, 'distributeY', { spacing: 'centres' });
    assert.deepEqual(next.elements.map((element) => element.y), [100, 163, 240]);
    assert.deepEqual(next.elements.map((element) => element.x), scene.elements.map((element) => element.x));
});

test('all six group alignment commands use the bounds captured before arranging', () => {
    const expected: [LayoutAction, 'x' | 'y', number[]][] = [
        ['left', 'x', [100, 100, 100]], ['centreX', 'x', [175, 165, 170]], ['right', 'x', [250, 230, 240]],
        ['top', 'y', [180, 180, 180]], ['centreY', 'y', [190, 190, 190]], ['bottom', 'y', [200, 200, 200]],
    ];
    const outside = { ...scene.elements[0], id: 'outside' };
    const original: Scene = { ...scene, elements: [...scene.elements, outside] };
    for (const [action, axis, positions] of expected) {
        const next = arrangeGroupMembers(original, layout, groupId, action);
        assert.deepEqual(next.elements.slice(0, 3).map((element) => element[axis]), positions);
        assert.equal(next.elements[3], outside);
        next.elements.slice(0, 3).forEach((element, index) =>
            assert.deepEqual(element, { ...scene.elements[index], [axis]: positions[index] }));
    }
});

test('linked parts can be arranged independently without changing their persistent movement setting', () => {
    const activity: Scene = { ...scene, elements: scene.elements.map((element, index) => index === 0
        ? { ...element, source: 'steps', moveTogether: true }
        : index === 1 ? { ...element, source: 'stepsIcon', activityId: ids[0] } : element) };
    assert.doesNotThrow(() => arrangeGroupMembers(activity, layout, groupId, 'distributeX'));
    const beforeScene = structuredClone(activity), beforeLayout = structuredClone(layout);
    const next = arrangeGroupMembers(activity, layout, groupId, 'distributeX', { keepLinkedParts: false });
    assert.deepEqual(next.elements.map((element) => element.x), [100, 160, 240]);
    assert.equal(next.elements[0].moveTogether, true);
    assert.equal(next.elements[1].activityId, ids[0]);
    assert.deepEqual(activity, beforeScene);
    assert.deepEqual(layout, beforeLayout);
    const partial = { ...layout, groups: [{ ...layout.groups[0], elementIds: [ids[0], ids[2]] }] };
    assert.throws(() => arrangeGroupMembers(activity, partial, groupId, 'left'), /linked activity parts/);
    const separate = arrangeGroupMembers(activity, partial, groupId, 'left', { keepLinkedParts: false });
    assert.equal(separate.elements[1], activity.elements[1]);
});

test('unavailable arrangements reject atomically and explain the reason', () => {
    const before = structuredClone(scene);
    assert.throws(() => arrangeGroupMembers(scene, { ...layout, lockedIds: [ids[1]] }, groupId, 'left'), /Unlock/);
    assert.throws(() => arrangeGroupMembers(scene, layout, 'missing', 'left'), /existing group/);
    assert.throws(() => arrangeGroupMembers(scene, layout, groupId, 'invalid' as LayoutAction), /alignment/);
    const overlapping: Scene = { ...scene, elements: scene.elements.map((element, index) =>
        ({ ...element, x: [100, 110, 120][index], width: 40 })) };
    assert.throws(() => arrangeGroupMembers(overlapping, layout, groupId, 'distributeX'), /Expand to fit/);
    assert.throws(() => arrangeGroupMembers(overlapping, layout, groupId, 'distributeX', { spacing: 'centres' }), /Expand to fit/);
    const protruding: Scene = { ...scene, elements: scene.elements.map((element, index) =>
        ({ ...element, x: [170, 100, 270][index], width: [20, 300, 20][index] })) };
    assert.throws(() => arrangeGroupMembers(protruding, layout, groupId, 'distributeX', { spacing: 'centres' }), /Expand to fit/);
    assert.deepEqual(scene, before);
});

test('group spacing reaches native validation with unchanged boxes and exact arranged positions', async () => {
    const next = arrangeGroupMembers(scene, layout, groupId, 'distributeX', { spacing: 'centres' });
    const mapped = await callBridge<WatchMapping>('layout', { scene: next });
    assert.deepEqual(mapped.scene, next);
    assert.deepEqual(mapped.areas.map((area) => area.x), [100, 163, 240]);
});

const liveScene: Scene = { ...scene, elements: scene.elements.map((element, index) => ({ ...element,
    x: [111, 148, 194][index], y: [128, 158, 161][index], width: [185, 112, 20][index], height: [87, 26, 20][index],
    ...(index === 1 ? { source: 'steps' as const, moveTogether: true } :
        index === 2 ? { source: 'stepsIcon' as const, activityId: ids[1], boxSizing: undefined } : {}),
})) };

test('overlapping linked activity parts require explicit independent spacing', () => {
    assert.throws(() => arrangeGroupMembers(liveScene, layout, groupId, 'distributeY', { expandToFit: true }), /Linked parts overlap.*Turn off/);
    const pair = { ...layout, groups: [{ ...layout.groups[0], elementIds: ids.slice(1) }] };
    assert.throws(() => arrangeGroupMembers(liveScene, pair, groupId, 'distributeY', { expandToFit: true }), /Linked parts overlap.*Turn off/);
});

for (const spacing of ['gaps', 'centres'] as const) {
    test(`expanded ${spacing} separates the actual overlapping group without resizing or changing links`, async () => {
        const before = structuredClone(liveScene), beforeLayout = structuredClone(layout);
        assert.throws(() => arrangeGroupMembers(liveScene, layout, groupId, 'distributeY', { spacing, keepLinkedParts: false }), /Expand to fit/);
        const next = arrangeGroupMembers(liveScene, layout, groupId, 'distributeY', { spacing, keepLinkedParts: false, expandToFit: true });
        const ordered = next.elements.toSorted((a, b) => a.y - b.y);
        ordered.slice(1).forEach((element, index) => assert.ok(element.y - ordered[index].y - ordered[index].height >= GROUP_SPACING_GAP));
        next.elements.forEach((element, index) => assert.deepEqual(element, { ...liveScene.elements[index], y: element.y }));
        const mapped = await callBridge<WatchMapping>('layout', { scene: next });
        assert.deepEqual(mapped.scene, JSON.parse(JSON.stringify(next)));
        assert.deepEqual(liveScene, before);
        assert.deepEqual(layout, beforeLayout);
    });
}

test('two independent units can expand without disturbing internal activity offsets', () => {
    const linked: Scene = { ...liveScene, elements: liveScene.elements.map((element, index) => ({ ...element,
        x: [100, 137, 183][index], y: [212, 248, 212][index],
    })) };
    const next = arrangeGroupMembers(linked, layout, groupId, 'distributeY', { expandToFit: true });
    assert.equal(next.elements[1].y - next.elements[2].y, 36);
    const activityTop = Math.min(next.elements[1].y, next.elements[2].y);
    assert.ok(activityTop - next.elements[0].y - next.elements[0].height >= GROUP_SPACING_GAP);
});

test('expansion chooses a safe integer translation near the circle edge and rejects impossible fits atomically', () => {
    const edge: Scene = { ...scene, elements: scene.elements.map((element, index) =>
        ({ ...element, x: 180, y: [20, 30, 40][index], width: 20, height: 60 })) };
    const next = arrangeGroupMembers(edge, layout, groupId, 'distributeY', { expandToFit: true });
    for (const element of next.elements) {
        assert.equal(Number.isInteger(element.y), true);
        for (const x of [element.x, element.x + element.width]) for (const y of [element.y, element.y + element.height])
            assert.ok((x - 208) ** 2 + (y - 208) ** 2 <= 192 ** 2);
    }
    const impossible: Scene = { ...scene, elements: scene.elements.map((element) => ({ ...element, x: 100, width: 200 })) };
    const before = structuredClone(impossible);
    assert.throws(() => arrangeGroupMembers(impossible, layout, groupId, 'distributeX', { expandToFit: true }), /cannot fit on this watch.*Reduce/);
    assert.deepEqual(impossible, before);
});
