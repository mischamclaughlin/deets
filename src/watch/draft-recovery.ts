import { parseDesign, serialiseDesign, type DesignDocument } from './design-file.ts';

export const draftPrefix = 'deets.draft.v1.';
export interface DraftRecord {
    id: string;
    updatedAt: string;
    document: DesignDocument;
    savedDesignId?: string;
}
type DraftStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
const keyFor = (id: string) => {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid recovery draft.');
    return draftPrefix + id;
};

/** Each editing session has its own record, so separate tabs cannot overwrite drafts. */
export function writeDraft(record: DraftRecord, storage: DraftStorage = localStorage): void {
    const document = parseDesign(serialiseDesign(record.document));
    storage.setItem(keyFor(record.id), JSON.stringify({ version: 1, ...record, document }));
}

export function readDrafts(storage: DraftStorage = localStorage): { drafts: DraftRecord[]; damaged: string[] } {
    const drafts: DraftRecord[] = [];
    const damaged: string[] = [];
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => !!key?.startsWith(draftPrefix));
    for (const key of keys) {
        try {
            const value = JSON.parse(storage.getItem(key) ?? '') as Record<string, unknown>;
            if (!value || value.version !== 1 || typeof value.id !== 'string' || keyFor(value.id) !== key ||
                typeof value.updatedAt !== 'string' || new Date(value.updatedAt).toISOString() !== value.updatedAt ||
                (value.savedDesignId !== undefined && (typeof value.savedDesignId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.savedDesignId))))
                throw new Error('Invalid recovery draft.');
            const document = parseDesign(serialiseDesign(value.document as DesignDocument));
            drafts.push({ id: value.id, updatedAt: value.updatedAt, document, savedDesignId: value.savedDesignId as string | undefined });
        } catch { damaged.push(key); }
    }
    return { drafts: drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), damaged };
}

export function removeDraft(id: string, storage: DraftStorage = localStorage): void {
    storage.removeItem(keyFor(id));
}
