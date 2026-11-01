import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteSavedDesign, listSavedDesigns, saveDesign, savedDesignPrefix, type DesignStorage } from '../src/watch/saved-designs.ts';
import { defaultGrid } from '../src/watch/grid.ts';
import { scene } from '../src/watch/scene.ts';
import { createHistory, recordHistory, redoHistory, undoHistory } from '../src/watch/history.ts';

class MemoryStorage implements DesignStorage {
    records = new Map<string, string>();
    get length() { return this.records.size; }
    key(index: number) { return [...this.records.keys()][index] ?? null; }
    getItem(key: string) { return this.records.get(key) ?? null; }
    setItem(key: string, value: string) { this.records.set(key, value); }
    removeItem(key: string) { this.records.delete(key); }
}
const document = () => ({ scene: structuredClone(scene), grid: { ...defaultGrid, visible: true,
    edits: { 'rows-1': .25 }, gaps: { 'rows-1': 12 }, gapMirrors: { 'rows-1': true } } });

test('saved designs persist independent document snapshots across repository reads', () => {
    const storage = new MemoryStorage();
    const original = document();
    const saved = saveDesign(original, undefined, storage);
    assert.deepEqual(listSavedDesigns(storage), [saved]);
    original.scene.name = 'Changed elsewhere';
    saved.document.grid.edits!['rows-1'] = .5;
    const reopened = listSavedDesigns(storage)[0];
    assert.equal(reopened.name, 'Deets');
    assert.equal(reopened.document.grid.edits?.['rows-1'], .25);
    assert.equal(reopened.document.grid.gapMirrors?.['rows-1'], true);
});

test('updates retain identity and other records while Save as creates an independent design', () => {
    const storage = new MemoryStorage();
    const first = saveDesign(document(), undefined, storage);
    const second = saveDesign({ ...document(), scene: { ...scene, name: 'Other design' } }, undefined, storage);
    const otherRecord = storage.getItem(savedDesignPrefix + second.id);
    const updated = saveDesign({ ...document(), scene: { ...scene, name: ' Renamed ' } }, first.id, storage);
    assert.equal(updated.id, first.id);
    assert.equal(updated.name, 'Renamed');
    assert.equal(updated.document.scene.name, 'Renamed');
    assert.equal(storage.getItem(savedDesignPrefix + second.id), otherRecord);
    assert.equal(listSavedDesigns(storage).length, 2);
    const copy = saveDesign(updated.document, undefined, storage);
    assert.notEqual(copy.id, first.id);
    assert.equal(listSavedDesigns(storage).length, 3);
    deleteSavedDesign(first.id, storage);
    assert.equal(listSavedDesigns(storage).length, 2);
    const recovered = saveDesign(updated.document, first.id, storage);
    assert.notEqual(recovered.id, first.id);
});

test('invalid names and documents never write browser storage', () => {
    const storage = new MemoryStorage();
    for (const name of ['', '   ', 'a'.repeat(61)])
        assert.throws(() => saveDesign({ ...document(), scene: { ...scene, name } }, undefined, storage), /name/);
    assert.throws(() => saveDesign({ ...document(), grid: { ...defaultGrid, circumferences: 99 } }, undefined, storage));
    assert.equal(storage.length, 0);
});

test('corrupt records remain intact and cannot be silently overwritten', () => {
    const storage = new MemoryStorage();
    const key = savedDesignPrefix + 'broken';
    storage.setItem(key, '{');
    assert.throws(() => listSavedDesigns(storage), /stored data has been kept/);
    assert.throws(() => saveDesign(document(), 'broken', storage), /stored data has been kept/);
    assert.equal(storage.getItem(key), '{');
    storage.setItem('another-app', '{');
    deleteSavedDesign('broken', storage);
    assert.deepEqual(listSavedDesigns(storage), []);
    assert.equal(storage.getItem('another-app'), '{');
});

test('records reject mismatched IDs, invalid dates, scene names and hidden guide settings', () => {
    const storage = new MemoryStorage();
    const valid = saveDesign(document(), undefined, storage);
    const key = savedDesignPrefix + valid.id;
    const stored = JSON.parse(storage.getItem(key)!);
    for (const change of [{ id: 'different' }, { updatedAt: 'yesterday' }, { name: 'Mismatched' },
        { document: { ...document(), grid: { ...defaultGrid, visible: false, circumferences: 999 } } }]) {
        const corrupted = JSON.stringify({ ...stored, ...change });
        storage.setItem(key, corrupted);
        assert.throws(() => listSavedDesigns(storage), /stored data has been kept/);
        assert.equal(storage.getItem(key), corrupted);
    }
});

test('quota failures preserve saved data and explain how to recover', () => {
    const storage = new MemoryStorage();
    const saved = saveDesign(document(), undefined, storage);
    const before = storage.getItem(savedDesignPrefix + saved.id);
    storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    assert.throws(() => saveDesign(document(), saved.id, storage), /storage is full/);
    assert.equal(storage.getItem(savedDesignPrefix + saved.id), before);
});

test('blocked browser storage and invalid record identifiers fail clearly', () => {
    const storage = new MemoryStorage();
    storage.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    assert.throws(() => saveDesign(document(), 'existing', storage), /unavailable in this browser/);
    assert.throws(() => deleteSavedDesign('../other-app', storage), /valid saved design/);
});

test('undoing a library open restores the saved identity with its document', () => {
    const storage = new MemoryStorage();
    const first = saveDesign({ ...document(), scene: { ...scene, name: 'First design' } }, undefined, storage);
    const second = saveDesign({ ...document(), scene: { ...scene, name: 'Second design' } }, undefined, storage);
    const history = recordHistory(createHistory({ ...first.document, savedDesignId: first.id }),
        { ...second.document, savedDesignId: second.id });
    const restored = undoHistory(history);
    assert.equal(restored.present.savedDesignId, first.id);
    const edited = { ...restored.present, scene: { ...restored.present.scene, background: 0x123456 } };
    saveDesign(edited, edited.savedDesignId, storage);
    assert.deepEqual(listSavedDesigns(storage).find((design) => design.id === second.id), second);
    assert.equal(listSavedDesigns(storage).find((design) => design.id === first.id)!.document.scene.background, 0x123456);
    assert.equal(redoHistory(restored).present.savedDesignId, second.id);
});
