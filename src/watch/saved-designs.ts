import { parseDesign, serialiseDesign, type DesignDocument } from './design-file.ts';

export interface SavedDesign {
    id: string;
    name: string;
    updatedAt: string;
    document: DesignDocument;
}
export type DesignStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
export const savedDesignPrefix = 'deets.saved-design.v1.';

function storageOperation<T>(operation: () => T): T {
    try { return operation(); } catch (failure) {
        if (failure instanceof Error && failure.name === 'QuotaExceededError')
            throw new Error('Browser storage is full. Download a copy or delete an older saved design.', { cause: failure });
        throw new Error('Saved designs are unavailable in this browser. Allow website storage or download a copy.', { cause: failure });
    }
}

function resolveStorage(storage?: DesignStorage): DesignStorage {
    return storage ?? storageOperation(() => {
        if (!globalThis.localStorage) throw new Error('Storage unavailable');
        return globalThis.localStorage;
    });
}

function recordKey(id: string): string {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Choose a valid saved design.');
    return savedDesignPrefix + id;
}

function readRecord(text: string, key: string): SavedDesign {
    try {
        const value = JSON.parse(text) as Record<string, unknown>;
        if (!value || Array.isArray(value) || value.version !== 1 || typeof value.id !== 'string' ||
            recordKey(value.id) !== key || typeof value.name !== 'string' ||
            !value.name.trim() || value.name.length > 60 || value.name !== value.name.trim() ||
            typeof value.updatedAt !== 'string' || new Date(value.updatedAt).toISOString() !== value.updatedAt)
            throw new Error('Invalid saved design');
        const document = parseDesign(JSON.stringify({ format: 'deets', version: 1,
            ...(value.document as object) }));
        if (document.scene.name !== value.name) throw new Error('Invalid saved design name');
        return { id: value.id, name: value.name, updatedAt: value.updatedAt, document };
    } catch {
        throw new Error('A saved design could not be read. Its stored data has been kept.');
    }
}

/** Separate records keep saves in other tabs from replacing the whole collection. */
export function listSavedDesigns(storage?: DesignStorage): SavedDesign[] {
    const target = resolveStorage(storage);
    const keys = storageOperation(() => Array.from({ length: target.length }, (_, index) => target.key(index))
        .filter((key): key is string => key !== null && key.startsWith(savedDesignPrefix)));
    const result: SavedDesign[] = [];
    for (const key of keys) {
        const text = storageOperation(() => target.getItem(key));
        if (text !== null) result.push(readRecord(text, key));
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export function saveDesign(document: DesignDocument, id?: string, storage?: DesignStorage): SavedDesign {
    const name = document.scene.name.trim();
    if (!name || name.length > 60) throw new Error('Give the design a name from 1 to 60 characters.');
    const snapshot = parseDesign(serialiseDesign({ ...document, scene: { ...document.scene, name } }));
    const target = resolveStorage(storage);
    const existingKey = id === undefined ? undefined : recordKey(id);
    const existing = existingKey === undefined ? null : storageOperation(() => target.getItem(existingKey));
    if (existing !== null && existingKey !== undefined) readRecord(existing, existingKey);
    const saved: SavedDesign = { id: existing !== null && id !== undefined ? id : globalThis.crypto.randomUUID(),
        name, updatedAt: new Date().toISOString(), document: snapshot };
    storageOperation(() => target.setItem(recordKey(saved.id), JSON.stringify({ version: 1, ...saved })));
    return saved;
}

export function deleteSavedDesign(id: string, storage?: DesignStorage): void {
    const target = resolveStorage(storage);
    const key = recordKey(id);
    storageOperation(() => target.removeItem(key));
}
