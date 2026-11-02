import type { Scene } from '../../shared/scene.ts';
import type { DesignDocument } from './design-file.ts';
import { createHistory, recordHistory, redoHistory, undoHistory, type History } from './history.ts';
import { defaultGrid } from './grid.ts';

export interface EditorDocument extends DesignDocument { savedDesignId?: string; documentId: number }

/** All history sessions for the same saved record share its latest savepoint. */
export function documentCheckpointKey(document: EditorDocument): string {
    return document.savedDesignId ? `saved:${document.savedDesignId}` : `session:${document.documentId}`;
}

/** Workspace preferences and saved-record identifiers do not change design content. */
export function documentFingerprint({ scene, grid }: DesignDocument): string {
    return JSON.stringify({ scene, grid });
}

export function hasDocumentChanges(document: DesignDocument, checkpoint?: string): boolean {
    return checkpoint === undefined || documentFingerprint(document) !== checkpoint;
}

/** Start with an empty face on the current watch, without carrying over its styles. */
export function blankDesign(device: Scene['device']): DesignDocument {
    return { scene: { version: 2, name: 'Untitled design', device, background: 0, edgeInset: 16,
        textPresets: [], colourPresets: [], defaultTextPresetId: null, elements: [] }, grid: { ...defaultGrid } };
}

export interface EditorState {
    history: History<EditorDocument>;
    checkpoints: ReadonlyMap<string, string>;
    sequence: number;
    generation: number;
}

type EditorAction =
    | { type: 'edit'; change: (document: EditorDocument) => EditorDocument }
    | { type: 'save'; id: string; name: string }
    | { type: 'prepare'; scene: Scene }
    | { type: 'import'; document: DesignDocument & { savedDesignId?: string } }
    | { type: 'new' }
    | { type: 'undo' | 'redo' };

export function createEditorState(scene: Scene): EditorState {
    const document = { scene, grid: { ...defaultGrid }, documentId: 0 };
    return { history: createHistory(document), sequence: 0, generation: 0,
        checkpoints: new Map([[documentCheckpointKey(document), documentFingerprint(document)]]) };
}

/** Document transitions are atomic; stale asynchronous edits cannot cross generations. */
export function reduceEditor(state: EditorState, action: EditorAction, expectedGeneration = state.generation): EditorState {
    if (expectedGeneration !== state.generation) return state;
    let { history, sequence, generation } = state;
    const checkpoints = new Map(state.checkpoints);
    const remember = (document: EditorDocument) => checkpoints.set(documentCheckpointKey(document), documentFingerprint(document));
    switch (action.type) {
        case 'edit':
            history = recordHistory(history, action.change(history.present));
            if (history === state.history) return state;
            break;
        case 'save': {
            const document = { ...history.present, savedDesignId: action.id, scene: { ...history.present.scene, name: action.name } };
            history = recordHistory(history, document);
            remember(document);
            const sessions = new Set([document.documentId, ...[...history.past, ...history.future]
                .filter((entry) => entry.savedDesignId === action.id).map((entry) => entry.documentId)]);
            for (const documentId of sessions)
                checkpoints.set(`session:${documentId}`, documentFingerprint(document));
            break;
        }
        case 'prepare': {
            const before = history.present;
            const checkpoint = checkpoints.get(documentCheckpointKey(before));
            if (checkpoint !== undefined) {
                const clean = JSON.parse(checkpoint) as DesignDocument;
                if (JSON.stringify(clean.scene) === JSON.stringify(before.scene))
                    checkpoints.set(documentCheckpointKey(before), documentFingerprint({ scene: action.scene, grid: clean.grid }));
            }
            history = createHistory({ ...before, scene: action.scene });
            break;
        }
        case 'import': {
            const document = { ...action.document, documentId: ++sequence };
            if (document.savedDesignId) remember(document);
            history = recordHistory(history, document);
            generation++;
            break;
        }
        case 'new': {
            const document = { ...blankDesign(history.present.scene.device), documentId: ++sequence };
            remember(document);
            history = createHistory(document);
            generation++;
            break;
        }
        case 'undo':
        case 'redo': {
            const next = action.type === 'undo' ? undoHistory(history) : redoHistory(history);
            if (next === history) return state;
            history = next;
            generation++;
            break;
        }
    }
    const retained = new Set([...history.past, history.present, ...history.future].map(documentCheckpointKey));
    for (const key of checkpoints.keys()) if (!retained.has(key)) checkpoints.delete(key);
    return { history, checkpoints, sequence, generation };
}

export function editorHasChanges(state: EditorState): boolean {
    return hasDocumentChanges(state.history.present, state.checkpoints.get(documentCheckpointKey(state.history.present)));
}
