import test from 'node:test';
import assert from 'node:assert/strict';
import type { Scene } from '../shared/scene.ts';
import { parseLayout, groupLayers, setLayerLocks, selectionWithGroups, tidyLayout, renameElementGroup,
    assignLayersToGroup, removeLayersFromGroups, movementLayout } from '../src/watch/editor-layout.ts';
import { arrangeLayers, spaceGroupMembers } from '../src/watch/layout-geometry.ts';
import { moveSceneElement } from '../src/watch/snapping.ts';
import { parseDesign, serialiseDesign } from '../src/watch/design-file.ts';
import { defaultGrid } from '../src/watch/grid.ts';
import { createEditorState, editorHasChanges, reduceEditor } from '../src/watch/editor-document.ts';

const scene: Scene = { version: 2, name: 'Layout test', device: 'epix2pro47mm', background: 0, edgeInset: 16,
    elements: ['one', 'two', 'three'].map((id, index) => ({ id, source: 'label', text: 'X', font: 'widget',
        x: 100 + 60 * index, y: 180 + index * 10, width: 20, height: 20, align: 'left', colour: 0xffffff,
        nightColour: 0xffffff, visible: 'both' })) };
const layout = groupLayers(scene, undefined, ['one', 'two'], 'Time');

test('members select independently while an explicitly selected group stays selected for dragging', () => {
    assert.deepEqual(selectionWithGroups([], 'one', false, layout), ['one']);
    assert.deepEqual(selectionWithGroups(['one', 'two'], 'two', false, layout), ['one', 'two']);
    assert.deepEqual(selectionWithGroups(['one', 'two', 'three'], 'two', true, layout), ['one', 'three']);
    assert.deepEqual(selectionWithGroups(['one'], 'two', true, layout), ['one', 'two']);
    assert.deepEqual(selectionWithGroups(['one', 'two'], 'three', false, layout), ['three']);
    assert.deepEqual(selectionWithGroups(['one', 'two'], undefined, false, layout), []);
    assert.deepEqual(selectionWithGroups([], 'three', true, layout), ['three']);
});

test('movement follows individual or whole-group selection without changing saved membership', () => {
    const before = structuredClone(layout);
    const options = { enabled: false, showGuideLines: false };
    const individual = moveSceneElement(scene, 'one', { x: 110, y: 190 }, { ...options, layout: movementLayout(layout, ['one']) });
    assert.equal(individual.elements[0].x, 110);
    assert.equal(individual.elements[0].y, 190);
    assert.equal(individual.elements[1], scene.elements[1]);
    const group = moveSceneElement(scene, 'one', { x: 110, y: 190 }, { ...options, layout: movementLayout(layout, ['one', 'two']) });
    assert.equal(group.elements[1].x, 170);
    assert.equal(group.elements[1].y, 200);
    assert.equal(group.elements[2], scene.elements[2]);
    const locked = setLayerLocks(layout, ['one'], true);
    assert.equal(moveSceneElement(scene, 'one', { x: 110, y: 190 }, { ...options, layout: movementLayout(locked, ['one']) }), scene);
    assert.deepEqual(layout, before);
    assert.equal(movementLayout(undefined, ['one']), undefined);
});

test('individual group movement preserves linked activity parts and leaves other members fixed', () => {
    const activity: Scene = { ...scene, elements: [
        { ...scene.elements[0], source: 'steps' },
        { ...scene.elements[1], source: 'stepsIcon', activityId: 'one' },
        scene.elements[2],
    ] };
    const grouped = groupLayers(activity, undefined, ['one', 'three'], 'Stats');
    const moved = moveSceneElement(activity, 'one', { x: 110, y: 190 }, {
        enabled: false, showGuideLines: false, layout: movementLayout(grouped, ['one']),
    });
    assert.equal(moved.elements[1].x, 170);
    assert.equal(moved.elements[1].y, 200);
    assert.equal(moved.elements[2], activity.elements[2]);
});
test('locks and groups persist through document serialisation without changing scene', () => {
    const document = { scene, grid: defaultGrid, layout: setLayerLocks(layout, ['one'], true) };
    const parsed = parseDesign(serialiseDesign(document));
    assert.deepEqual(parsed, document);
    assert.deepEqual(parsed.layout?.lockedIds, ['one', 'two']);
    assert.throws(() => parseLayout({ lockedIds: ['absent'], groups: [] }, ['one']));
    assert.throws(() => parseLayout({ lockedIds: [], groups: [layout.groups[0], { ...layout.groups[0], id: 'other' }] }, ['one', 'two']));
});
test('group movement preserves relative offsets, locking either member freezes the unit', () => {
    const moved = moveSceneElement(scene, 'one', { x: 110, y: 190 }, { enabled: false, showGuideLines: false, layout });
    assert.equal(moved.elements[0].x, 110);
    assert.equal(moved.elements[1].x, 170);
    assert.equal(moved.elements[2], scene.elements[2]);
    const locked = { ...layout, lockedIds: ['two'] };
    assert.equal(moveSceneElement(scene, 'one', { x: 110, y: 190 }, { enabled: false, showGuideLines: false, layout: locked }), scene);
});
test('aligning uses rigid groups and distribution preserves outer edges with integer gaps', () => {
    const aligned = arrangeLayers(scene, ['one', 'three'], 'top', layout);
    assert.equal(aligned.elements[0].y, 180);
    assert.equal(aligned.elements[1].y, 190);
    assert.equal(aligned.elements[2].y, 180);
    const uneven = { ...scene, elements: scene.elements.map((element, index) => ({ ...element, x: [100, 130, 220][index] })) };
    assert.deepEqual(arrangeLayers(uneven, ['one', 'two', 'three'], 'distributeX').elements.map((element) => element.x), [100, 160, 220]);
    assert.throws(() => arrangeLayers(scene, ['one', 'two'], 'distributeX'));
    assert.throws(() => arrangeLayers(scene, ['one', 'three'], 'left', setLayerLocks(layout, ['one'], true)), /Unlock/);
});

for (const [action, axis, extent] of [['distributeX', 'x', 'width'], ['distributeY', 'y', 'height']] as const) {
    test(`group ${action} uses equal gaps within existing bounds without changing other geometry or membership`, () => {
        const uneven: Scene = { ...scene, elements: [
            ...scene.elements.map((element, index) => ({ ...element, [axis]: [80, 111, 201][index], [extent]: [20, 31, 25][index] })),
            { ...scene.elements[0], id: 'outside' },
        ] };
        const grouped = groupLayers(uneven, undefined, ['one', 'two', 'three'], 'Stats');
        const beforeScene = structuredClone(uneven), beforeLayout = structuredClone(grouped);
        const spaced = spaceGroupMembers(uneven, grouped, grouped.groups[0].id, action);
        // 146 pixels minus 76 pixels of elements leaves two 35-pixel gaps.
        assert.deepEqual(spaced.elements.slice(0, 3).map((element) => element[axis]), [80, 135, 201]);
        spaced.elements.slice(0, 3).forEach((element, index) =>
            assert.deepEqual(element, { ...uneven.elements[index], [axis]: [80, 135, 201][index] }));
        assert.equal(spaced.elements[3], uneven.elements[3]);
        assert.deepEqual(uneven, beforeScene);
        assert.deepEqual(grouped, beforeLayout);
        let state = createEditorState(uneven);
        state = reduceEditor(state, { type: 'edit', change: (document) => ({ ...document, layout: grouped }) });
        state = reduceEditor(state, { type: 'edit', change: (document) => ({ ...document, scene: spaced }) });
        state = reduceEditor(state, { type: 'undo' });
        assert.deepEqual(state.history.present.scene, uneven);
        assert.deepEqual(state.history.present.layout, grouped);
        assert.deepEqual(reduceEditor(state, { type: 'redo' }).history.present.scene, spaced);
    });
}

test('group spacing rounds fractional gaps to native pixels and rejects locks, overlap and stale groups atomically', () => {
    const uneven = { ...scene, elements: scene.elements.map((element, index) => ({ ...element, x: [80, 110, 201][index] })) };
    const grouped = groupLayers(uneven, undefined, ['one', 'two', 'three'], 'Stats');
    const id = grouped.groups[0].id;
    assert.deepEqual(spaceGroupMembers(uneven, grouped, id, 'distributeX').elements.map((element) => element.x), [80, 141, 201]);
    assert.throws(() => spaceGroupMembers(uneven, { ...grouped, lockedIds: ['two'] }, id, 'distributeX'), /Unlock/);
    assert.throws(() => spaceGroupMembers(uneven, grouped, 'missing', 'distributeX'), /existing group/);
    assert.throws(() => spaceGroupMembers(uneven, undefined, id, 'distributeX'), /existing group/);
    assert.doesNotThrow(() => spaceGroupMembers(uneven, layout, layout.groups[0].id, 'distributeX'));
    const overlap = { ...uneven, elements: uneven.elements.map((element) => ({ ...element, x: 100 })) };
    const before = structuredClone(overlap);
    assert.throws(() => spaceGroupMembers(overlap, grouped, id, 'distributeX'), /overlap/);
    assert.deepEqual(overlap, before);
    const stale = { ...grouped, groups: [{ ...grouped.groups[0], elementIds: ['one', 'two', 'missing'] }] };
    assert.throws(() => spaceGroupMembers(uneven, stale, id, 'distributeX'), /Select/);
});

test('group spacing keeps activity partners together and never moves a linked element outside the group', () => {
    const activity: Scene = { ...scene, elements: [
        { ...scene.elements[0], source: 'steps', x: 80 },
        { ...scene.elements[1], source: 'stepsIcon', activityId: 'one', x: 105 },
        { ...scene.elements[2], x: 140 },
        { ...scene.elements[2], id: 'four', x: 240 },
    ] };
    const grouped = groupLayers(activity, undefined, ['one', 'three', 'four'], 'Stats');
    const id = grouped.groups[0].id;
    const spaced = spaceGroupMembers(activity, grouped, id, 'distributeX');
    assert.deepEqual(spaced.elements.map((element) => element.x), [80, 105, 173, 240]);
    const partial = { ...grouped, groups: [{ ...grouped.groups[0], elementIds: ['one', 'three', 'four'] }] };
    assert.throws(() => spaceGroupMembers(activity, partial, id, 'distributeX'), /linked activity parts/);
    const twoUnits = groupLayers(activity, undefined, ['one', 'three'], 'Pair');
    assert.doesNotThrow(() => spaceGroupMembers(activity, twoUnits, twoUnits.groups[0].id, 'distributeX'));
});
test('metadata is undoable, stale references are removed, recovery remains dirty', () => {
    let state = createEditorState(scene);
    state = reduceEditor(state, { type: 'edit', change: (document) => ({ ...document, layout }) });
    assert.equal(editorHasChanges(state), true);
    assert.deepEqual(state.history.present.layout, layout);
    state = reduceEditor(state, { type: 'undo' });
    assert.equal(state.history.present.layout, undefined);
    const recovered = reduceEditor(state, { type: 'recover', document: { scene, grid: defaultGrid, layout, savedDesignId: 'saved' } });
    assert.equal(editorHasChanges(recovered), true);
    const deleted = { ...scene, elements: scene.elements.slice(1) };
    assert.deepEqual(tidyLayout(setLayerLocks(layout, ['one'], true), deleted), { lockedIds: ['two'], groups: [] });
});

test('undoing recovery restores a saved document cleanly without losing its savepoint', () => {
    let state = createEditorState(scene);
    state = reduceEditor(state, { type: 'save', id: 'saved', name: scene.name });
    assert.equal(editorHasChanges(state), false);
    const recoveredDocument = { scene, grid: defaultGrid, layout, savedDesignId: 'saved' };
    state = reduceEditor(state, { type: 'recover', document: recoveredDocument });
    assert.equal(editorHasChanges(state), true);
    state = reduceEditor(state, { type: 'undo' });
    assert.equal(editorHasChanges(state), false);
    state = reduceEditor(state, { type: 'redo' });
    assert.equal(editorHasChanges(state), true);
    state = reduceEditor(state, { type: 'save', id: 'saved', name: scene.name });
    assert.equal(editorHasChanges(state), false);
    state = reduceEditor(state, { type: 'edit', change: (document) => ({ ...document, scene: { ...document.scene, background: 12 } }) });
    assert.equal(editorHasChanges(state), true);
});

test('layout actions preserve linked activity offsets and groups include implicit companions', () => {
    const activity: Scene = { ...scene, elements: [
        { ...scene.elements[0], source: 'steps' },
        { ...scene.elements[1], source: 'stepsIcon', activityId: 'one' },
        scene.elements[2],
    ] };
    const aligned = arrangeLayers(activity, ['one', 'three'], 'top');
    assert.equal(aligned.elements[1].y - aligned.elements[0].y, activity.elements[1].y - activity.elements[0].y);
    assert.equal(aligned.elements[2].y, aligned.elements[0].y);
    assert.throws(() => arrangeLayers(activity, ['one', 'two'], 'left'), /independent/);
    assert.deepEqual(groupLayers(activity, undefined, ['one', 'three'], 'Stats').groups[0].elementIds.toSorted(), ['one', 'three', 'two']);
    assert.throws(() => arrangeLayers(activity, ['one', 'three'], 'top', { lockedIds: ['two'], groups: [] }), /Unlock/);
});

const membershipScene: Scene = { ...scene, elements: ['one', 'two', 'three', 'four', 'five', 'six'].map((id, index) =>
    ({ ...scene.elements[0], id, x: 80 + index * 30 })) };
const membershipLayout = {
    lockedIds: ['one'],
    groups: [
        { id: 'first', name: 'First', elementIds: ['one', 'two', 'three'] },
        { id: 'second', name: 'Second', elementIds: ['four', 'five'] },
    ],
};

test('renaming a group preserves its identity, membership and locks', () => {
    const before = structuredClone(membershipLayout);
    const renamed = renameElementGroup(membershipScene, membershipLayout, 'first', '  Time and date  ');
    assert.deepEqual(renamed.groups[0], { ...membershipLayout.groups[0], name: 'Time and date' });
    assert.deepEqual(renamed.lockedIds, ['one']);
    assert.deepEqual(renamed.groups[1], membershipLayout.groups[1]);
    assert.deepEqual(membershipLayout, before);
});

test('moving an individual member keeps the rest of its existing group intact', () => {
    const before = structuredClone(membershipLayout);
    const result = assignLayersToGroup(membershipScene, membershipLayout, ['one'], 'second');
    assert.deepEqual(result.groups, [
        { id: 'first', name: 'First', elementIds: ['two', 'three'] },
        { id: 'second', name: 'Second', elementIds: ['four', 'five', 'one'] },
    ]);
    assert.deepEqual(result.lockedIds, ['one']);
    assert.deepEqual(membershipLayout, before);
    assert.deepEqual(assignLayersToGroup(membershipScene, result, ['one'], 'second'), result);
});

test('removing individual members dissolves only groups left with fewer than two layers', () => {
    const removed = removeLayersFromGroups(membershipScene, membershipLayout, ['one']);
    assert.deepEqual(removed.groups[0], { id: 'first', name: 'First', elementIds: ['two', 'three'] });
    assert.deepEqual(removed.groups[1], membershipLayout.groups[1]);
    const dissolved = removeLayersFromGroups(membershipScene, removed, ['two']);
    assert.deepEqual(dissolved.groups, [membershipLayout.groups[1]]);
    assert.deepEqual(dissolved.lockedIds, ['one']);
    assert.deepEqual(removeLayersFromGroups(membershipScene, membershipLayout, ['six']), membershipLayout);
});

test('group membership transfers linked activity companions without absorbing unrelated members', () => {
    const activity: Scene = { ...membershipScene, elements: membershipScene.elements.map((element) =>
        element.id === 'one' ? { ...element, source: 'steps' }
            : element.id === 'two' ? { ...element, source: 'stepsIcon', activityId: 'one' } : element) };
    const transferred = assignLayersToGroup(activity, membershipLayout, ['one'], 'second');
    assert.deepEqual(transferred.groups, [{ id: 'second', name: 'Second', elementIds: ['four', 'five', 'one', 'two'] }]);
    const removed = removeLayersFromGroups(activity, transferred, ['two']);
    assert.deepEqual(removed.groups, [membershipLayout.groups[1]]);
    assert.deepEqual(removed.lockedIds, ['one']);
    const unlinked: Scene = { ...activity, elements: activity.elements.map((element) =>
        element.id === 'one' ? { ...element, moveTogether: false } : element) };
    assert.deepEqual(assignLayersToGroup(unlinked, membershipLayout, ['one'], 'second').groups[0].elementIds, ['two', 'three']);
});

test('invalid group membership changes reject atomically without changing scene or metadata', () => {
    const beforeScene = structuredClone(membershipScene), beforeLayout = structuredClone(membershipLayout);
    assert.throws(() => renameElementGroup(membershipScene, membershipLayout, 'missing', 'Name'), /existing group/);
    assert.throws(() => renameElementGroup(membershipScene, membershipLayout, 'first', ' '), /group name/);
    assert.throws(() => renameElementGroup(membershipScene, membershipLayout, 'first', 'x'.repeat(61)), /group name/);
    assert.throws(() => assignLayersToGroup(membershipScene, membershipLayout, ['one'], 'missing'), /existing group/);
    assert.throws(() => assignLayersToGroup(membershipScene, membershipLayout, ['absent'], 'second'), /Select/);
    assert.throws(() => removeLayersFromGroups(membershipScene, membershipLayout, []), /Select/);
    assert.throws(() => removeLayersFromGroups(membershipScene, membershipLayout, ['absent']), /Select/);
    const ringScene: Scene = { ...membershipScene, elements: membershipScene.elements.map((element) =>
        element.id === 'six' ? { ...element, source: 'secondsRing' } : element) };
    assert.throws(() => assignLayersToGroup(ringScene, membershipLayout, ['six'], 'second'), /seconds ring/);
    assert.deepEqual(membershipScene, beforeScene);
    assert.deepEqual(membershipLayout, beforeLayout);
});
