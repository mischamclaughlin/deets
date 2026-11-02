import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDesign, createEditorState, editorHasChanges, reduceEditor } from '../src/watch/editor-document.ts';
import { scene } from '../src/watch/scene.ts';
import { devices } from '../shared/scene.ts';
import { callBridge } from './bridge.ts';

const editName = (state: ReturnType<typeof createEditorState>, name: string) => reduceEditor(state, { type: 'edit',
    change: (document) => ({ ...document, scene: { ...document.scene, name } }) });

test('initial designs are clean and document edits, including grid edits, are unsaved', () => {
    const initial = createEditorState(scene);
    assert.equal(editorHasChanges(initial), false);
    assert.equal(editorHasChanges(editName(initial, 'Changed')), true);
    const grid = reduceEditor(initial, { type: 'edit', change: (document) => ({ ...document, grid: { ...document.grid, visible: true } }) });
    assert.equal(editorHasChanges(grid), true);
    assert.equal(editorHasChanges(initial), false);
});

test('saving under an unchanged name publishes a clean savepoint and undo/redo follow content', () => {
    const saved = reduceEditor(createEditorState(scene), { type: 'save', id: 'saved-one', name: scene.name });
    const edited = reduceEditor(saved, { type: 'edit', change: (document) => ({ ...document,
        scene: { ...document.scene, background: 0xffffff } }) });
    assert.equal(editorHasChanges(edited), true);
    const undo = reduceEditor(edited, { type: 'undo' });
    assert.equal(editorHasChanges(undo), false);
    assert.equal(editorHasChanges(reduceEditor(undo, { type: 'redo' })), true);
    const resaved = reduceEditor(edited, { type: 'save', id: 'saved-one', name: scene.name });
    assert.equal(resaved.history, edited.history);
    assert.notEqual(resaved, edited);
    assert.equal(editorHasChanges(resaved), false);
});

test('undoing a first save with identical content remains clean', () => {
    const edited = editName(createEditorState(scene), 'Ready to save');
    const saved = reduceEditor(edited, { type: 'save', id: 'saved-one', name: 'Ready to save' });
    assert.equal(editorHasChanges(reduceEditor(saved, { type: 'undo' })), false);
});

test('file imports remain unsaved while saved-design opens are clean', () => {
    const initial = createEditorState(scene);
    const document = { scene, grid: initial.history.present.grid };
    assert.equal(editorHasChanges(reduceEditor(initial, { type: 'import', document })), true);
    assert.equal(editorHasChanges(reduceEditor(initial, { type: 'import', document: { ...document, savedDesignId: 'saved-one' } })), false);
});

test('saving a reopened record updates its checkpoint across earlier history sessions', () => {
    const first = reduceEditor(createEditorState(scene), { type: 'save', id: 'saved-one', name: 'Saved' });
    const reopened = reduceEditor(first, { type: 'import', document: first.history.present });
    const edited = editName(reopened, 'Updated');
    const saved = reduceEditor(edited, { type: 'save', id: 'saved-one', name: 'Updated' });
    assert.equal(editorHasChanges(saved), false);
    const oldSession = reduceEditor(reduceEditor(saved, { type: 'undo' }), { type: 'undo' });
    assert.equal(oldSession.history.present.documentId, first.history.present.documentId);
    assert.equal(editorHasChanges(oldSession), true);
});

test('New creates a clean empty face on the same watch and rejects old asynchronous edits', () => {
    const saved = reduceEditor(createEditorState(scene), { type: 'save', id: 'saved-one', name: 'Saved' });
    const edited = editName(saved, 'Unsaved');
    const generation = edited.generation;
    const fresh = reduceEditor(edited, { type: 'new' });
    assert.deepEqual(fresh.history.present.scene, blankDesign(scene.device).scene);
    assert.equal(fresh.history.present.savedDesignId, undefined);
    assert.equal(fresh.history.past.length, 0);
    assert.equal(fresh.history.future.length, 0);
    assert.equal(fresh.checkpoints.size, 1);
    assert.equal(editorHasChanges(fresh), false);
    assert.equal(reduceEditor(fresh, { type: 'edit', change: () => edited.history.present }, generation), fresh);
    assert.equal(reduceEditor(fresh, { type: 'save', id: 'old', name: 'Old save' }, generation), fresh);
    assert.equal(edited.history.present.scene.name, 'Unsaved');
});

test('initial font preparation is clean while preserving unsaved grid changes', () => {
    const initial = createEditorState(scene);
    const preparedScene = { ...scene, name: 'Prepared fonts' };
    assert.equal(editorHasChanges(reduceEditor(initial, { type: 'prepare', scene: preparedScene })), false);
    const edited = reduceEditor(initial, { type: 'edit', change: (document) => ({ ...document,
        grid: { ...document.grid, visible: true } }) });
    assert.equal(editorHasChanges(reduceEditor(edited, { type: 'prepare', scene: preparedScene })), true);
    const sceneEdit = editName(initial, 'Unsaved name');
    assert.equal(editorHasChanges(reduceEditor(sceneEdit, { type: 'prepare', scene: sceneEdit.history.present.scene })), true);
});

test('empty new designs pass canonical validation on every supported watch', async () => {
    for (const device of Object.keys(devices) as Array<keyof typeof devices>) {
        const document = blankDesign(device);
        const mapped = await callBridge<{ scene: typeof scene }>('layout', { scene: document.scene });
        assert.deepEqual(mapped.scene, document.scene);
    }
});
