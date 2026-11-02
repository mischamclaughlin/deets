import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prepareDesign, serialiseDesign, type DesignDocument } from './design-file.ts';
import { readDrafts, removeDraft, writeDraft, type DraftRecord } from './draft-recovery.ts';
import './DraftRecovery.css';

export function DraftRecovery({ document, savedDesignId, dirty, ready, revision, onRestore }: {
    document: DesignDocument;
    savedDesignId?: string;
    dirty: boolean;
    ready: boolean;
    revision: number;
    onRestore: (document: DesignDocument & { savedDesignId?: string }) => void;
}) {
    const [sessionId] = useState(() => crypto.randomUUID());
    const [recovery, setRecovery] = useState(() => {
        try { return { ...readDrafts(), error: '' }; }
        catch { return { drafts: [] as DraftRecord[], damaged: [] as string[], error: 'Draft recovery is unavailable. Download or save your design regularly.' }; }
    });
    const [storageError, setStorageError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const latest = useRef({ document, savedDesignId, dirty, ready, revision });
    useLayoutEffect(() => { latest.current = { document, savedDesignId, dirty, ready, revision }; }, [document, savedDesignId, dirty, ready, revision]);
    const request = useRef<AbortController | undefined>(undefined);
    useEffect(() => () => request.current?.abort(), []);

    useEffect(() => {
        function persist() {
            const current = latest.current;
            if (!current.ready) return;
            try {
                if (current.dirty) writeDraft({ id: sessionId, updatedAt: new Date().toISOString(),
                    document: current.document, savedDesignId: current.savedDesignId });
                else removeDraft(sessionId);
                setStorageError('');
            } catch { setStorageError('Your draft could not be backed up. Save or download a copy before leaving.'); }
        }
        persist();
        window.addEventListener('pagehide', persist);
        function warn(event: BeforeUnloadEvent) {
            if (!latest.current.dirty) return;
            persist();
            event.preventDefault();
            event.returnValue = '';
        }
        window.addEventListener('beforeunload', warn);
        return () => { window.removeEventListener('pagehide', persist); window.removeEventListener('beforeunload', warn); };
    }, [document, dirty, ready, savedDesignId, sessionId]);

    async function restore(draft: DraftRecord) {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        const snapshot = latest.current;
        setBusy(true);
        setMessage('');
        try {
            const prepared = await prepareDesign(serialiseDesign(draft.document), controller.signal);
            if (controller.signal.aborted) return;
            if (latest.current.document !== snapshot.document || latest.current.revision !== snapshot.revision)
                throw new Error('Your design changed during recovery. Restore the draft again.');
            // Persist under this session before retiring the old recovery record.
            writeDraft({ ...draft, id: sessionId, document: prepared, updatedAt: new Date().toISOString() });
            onRestore({ ...prepared, savedDesignId: draft.savedDesignId });
            try { removeDraft(draft.id); } catch { /* Keep the original backup if storage becomes unavailable. */ }
            setRecovery((current) => ({ ...current, drafts: current.drafts.filter((item) => item.id !== draft.id) }));
            setMessage('Draft restored. Save the design when you are ready.');
        } catch (failure) {
            if (!controller.signal.aborted) setMessage(failure instanceof Error ? failure.message : 'The draft could not be restored. Its backup has been kept.');
        } finally {
            if (request.current === controller) { request.current = undefined; setBusy(false); }
        }
    }

    return <div className="draft-recovery" aria-label="Draft recovery" aria-busy={busy}>
        {recovery.error && <p className="typography-status" role="alert">{recovery.error}</p>}
        {storageError && <p className="typography-status" role="alert">{storageError}</p>}
        {!!recovery.damaged.length && <p className="typography-status" role="alert">A damaged recovery draft has been kept in browser storage.</p>}
        {recovery.drafts.map((draft) => <div key={draft.id} className="draft-recovery-item">
            <p>Recover <strong>{draft.document.scene.name}</strong>? <time dateTime={draft.updatedAt}>{new Date(draft.updatedAt).toLocaleString('en-GB')}</time></p>
            <div className="design-name-actions">
                <button type="button" disabled={!ready || busy} onClick={() => void restore(draft)}>Restore draft</button>
                <button type="button" disabled={busy} onClick={() => {
                    try {
                        removeDraft(draft.id);
                        setRecovery((current) => ({ ...current, drafts: current.drafts.filter((item) => item.id !== draft.id) }));
                    } catch { setMessage('The draft could not be discarded. Its backup has been kept.'); }
                }}>Discard draft</button>
            </div>
        </div>)}
        {message && <p className="typography-status" role="status">{message}</p>}
    </div>;
}
