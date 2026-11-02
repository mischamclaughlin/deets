import test from 'node:test';
import assert from 'node:assert/strict';
import type { Scene } from '../shared/scene.ts';
import { parseLayout, groupLayers, setLayerLocks, selectionWithGroups, tidyLayout } from '../src/watch/editor-layout.ts';
import { arrangeLayers } from '../src/watch/layout-geometry.ts';
import { moveSceneElement } from '../src/watch/snapping.ts';
import { parseDesign, serialiseDesign } from '../src/watch/design-file.ts';
import { defaultGrid } from '../src/watch/grid.ts';
import { createEditorState, editorHasChanges, reduceEditor } from '../src/watch/editor-document.ts';

const scene: Scene = { version: 2, name: 'Layout test', device: 'epix2pro47mm', background: 0, edgeInset: 16,
    elements: ['one', 'two', 'three'].map((id, index) => ({ id, source: 'label', text: 'X', font: 'widget',
        x: 100 + 60 * index, y: 180 + index * 10, width: 20, height: 20, align: 'left', colour: 0xffffff,
        nightColour: 0xffffff, visible: 'both' })) };
const layout = groupLayers(scene, undefined, ['one', 'two'], 'Time');

test('groups select as one unit and toggle atomically', () => {
    assert.deepEqual(selectionWithGroups([], 'one', false, layout), ['one', 'two']);
    assert.deepEqual(selectionWithGroups(['one', 'two', 'three'], 'two', true, layout), ['three']);
    assert.deepEqual(selectionWithGroups([], 'three', true, layout), ['three']);
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
