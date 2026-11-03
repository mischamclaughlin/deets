import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Scene } from '../../shared/scene.ts';
import type { DesignDocument } from './design-file.ts';
import { mapWatch } from './api.ts';
import { expandGroups, linkedElementIds, setLayerLocks, type EditorLayout } from './editor-layout.ts';
import { arrangeLayers, type LayoutAction } from './layout-geometry.ts';
import { layoutActions } from './layout-actions.ts';
import './LayoutPanel.css';

/** Editing metadata and native geometry publish together as one undoable document. */
export function LayoutPanel({ scene, layout, ids, onDocumentChange }: {
    scene: Scene; layout?: EditorLayout; ids: string[];
    onDocumentChange: Dispatch<SetStateAction<DesignDocument>>;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const request = useRef<AbortController | undefined>(undefined);
    const latest = useRef({ scene, layout });
    useLayoutEffect(() => { latest.current = { scene, layout }; }, [scene, layout]);
    useEffect(() => () => request.current?.abort(), []);
    const members = expandGroups(ids, layout);
    const allLocked = members.length > 0 && members.every((id) => layout?.lockedIds.includes(id));
    const anyLocked = members.some((id) => layout?.lockedIds.includes(id));
    const units = new Set(members.map((id) => linkedElementIds(scene, id, layout).toSorted().join("|"))).size;

    function metadata(change: () => EditorLayout) {
        try {
            const next = change();
            onDocumentChange((document) => document.scene === scene && document.layout === layout ? { ...document, layout: next } : document);
            setError('');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'The layers could not be changed.'); }
    }
    async function geometry(action: LayoutAction) {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError('');
        try {
            const next = arrangeLayers(scene, members, action, layout);
            const mapped = await mapWatch(next, false, controller.signal);
            if (controller.signal.aborted) return;
            if (latest.current.scene !== scene || latest.current.layout !== layout) throw new Error('The design changed. Try arranging the layers again.');
            onDocumentChange((document) => document.scene === scene && document.layout === layout
                ? { ...document, scene: mapped.scene } : document);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The layers could not be arranged.');
        } finally { if (request.current === controller) { request.current = undefined; setBusy(false); } }
    }
    return <section className="layout-panel" aria-label="Layer layout" aria-busy={busy}>
        <h2>Layout</h2>
        <div className="layout-actions">
            <button type="button" disabled={busy || !members.length} onClick={() => metadata(() => setLayerLocks(layout, members, !allLocked))}>{allLocked ? 'Unlock' : 'Lock'} {members.length === 1 ? 'element' : 'selection'}</button>
        </div>
        {units > 1 && (
            <div className="layout-alignment" role="group" aria-label="Align and distribute layers">
                {layoutActions.map(([action, label]) => <button key={action} type="button" title={label} disabled={busy || anyLocked || units < (action.startsWith('distribute') ? 3 : 2)} onClick={() => void geometry(action)}>{label}</button>)}
            </div>
        )}
        {anyLocked && <p className="control-hint">Locked layers stay fixed when dragging, nudging or arranging.</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
