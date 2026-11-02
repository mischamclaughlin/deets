import test from 'node:test';
import assert from 'node:assert/strict';
import { readDrafts, removeDraft, writeDraft, draftPrefix } from '../src/watch/draft-recovery.ts';
import { createEditorState, editorHasChanges, reduceEditor } from '../src/watch/editor-document.ts';
import { scene } from '../src/watch/scene.ts';
import { defaultGrid } from '../src/watch/grid.ts';

function memoryStorage() {
    const records = new Map<string, string>();
    return { get length() { return records.size; }, key: (index: number) => [...records.keys()][index] ?? null,
        getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => { records.set(key, value); }, removeItem: (key: string) => { records.delete(key); } };
}
const draft = { id: 'session-one', updatedAt: '2026-11-02T12:00:00.000Z', savedDesignId: 'saved-one',
    document: { scene, grid: defaultGrid } };

test('independent sessions retain scene, grid, layout and saved association across reload', () => {
    const storage = memoryStorage();
    const layout = { lockedIds: ['time'], groups: [] };
    writeDraft({ ...draft, document: { ...draft.document, layout } }, storage);
    writeDraft({ ...draft, id: 'session-two', updatedAt: '2026-11-02T13:00:00.000Z' }, storage);
    const result = readDrafts(storage);
    assert.equal(result.drafts.length, 2);
    assert.equal(result.drafts[0].id, 'session-two');
    assert.deepEqual(result.drafts[1].document.layout, layout);
    assert.equal(result.drafts[1].savedDesignId, 'saved-one');
    removeDraft('session-two', storage);
    assert.equal(readDrafts(storage).drafts[0].id, 'session-one');
});

test('damaged and oversized recovery records are retained and valid backups stay available', () => {
    const storage = memoryStorage();
    storage.setItem(draftPrefix + 'damaged', '{bad');
    storage.setItem(draftPrefix + 'wrong', JSON.stringify({ version: 1, ...draft }));
    writeDraft(draft, storage);
    assert.equal(readDrafts(storage).drafts.length, 1);
    assert.deepEqual(readDrafts(storage).damaged.sort(), [draftPrefix + 'damaged', draftPrefix + 'wrong']);
    assert.ok(storage.getItem(draftPrefix + 'damaged'));
    assert.throws(() => writeDraft({ ...draft, id: '../invalid' }, storage));
    assert.throws(() => writeDraft({ ...draft, document: { ...draft.document,
        scene: { ...scene, name: 'x'.repeat(1024 * 1024) } } }, storage));
});

test('storage write failures preserve previous backup', () => {
    const storage = memoryStorage();
    writeDraft(draft, storage);
    const full = { ...storage, setItem: () => { throw new Error('Storage full'); } };
    assert.throws(() => writeDraft({ ...draft, document: { ...draft.document, scene: { ...scene, name: 'Changed' } } }, full));
    assert.equal(readDrafts(storage).drafts[0].document.scene.name, scene.name);
});

test('recovering a saved draft stays dirty, rejects old edits and can be undone', () => {
    const saved = reduceEditor(createEditorState(scene), { type: 'save', id: 'saved-one', name: scene.name });
    const recovered = reduceEditor(saved, { type: 'recover', document: { ...draft.document, savedDesignId: 'saved-one' } });
    assert.equal(editorHasChanges(recovered), true);
    assert.equal(recovered.history.present.savedDesignId, 'saved-one');
    assert.equal(reduceEditor(recovered, { type: 'edit', change: () => saved.history.present }, saved.generation), recovered);
    assert.equal(reduceEditor(recovered, { type: 'undo' }).history.present, saved.history.present);
    assert.equal(editorHasChanges(reduceEditor(recovered, { type: 'save', id: 'saved-one', name: scene.name })), false);
});
