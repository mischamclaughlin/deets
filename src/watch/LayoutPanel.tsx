import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Scene } from '../../shared/scene.ts';
import type { DesignDocument } from './design-file.ts';
import { mapWatch } from './api.ts';
import { expandGroups, linkedElementIds, groupLayers, setLayerLocks, ungroupLayers, type EditorLayout } from './editor-layout.ts';
import { arrangeLayers, type LayoutAction } from './layout-geometry.ts';
import './LayoutPanel.css';

const actions: [LayoutAction, string][] = [['left', 'Left'], ['centreX', 'Centre horizontally'], ['right', 'Right'],
    ['top', 'Top'], ['centreY', 'Centre vertically'], ['bottom', 'Bottom'], ['distributeX', 'Space horizontally'], ['distributeY', 'Space vertically']];

/** Editing metadata and native geometry publish together as one undoable document. */
export function LayoutPanel({ scene, layout, ids, onDocumentChange, onSelect }: {
    scene: Scene; layout?: EditorLayout; ids: string[];
    onDocumentChange: Dispatch<SetStateAction<DesignDocument>>;
    onSelect?: (ids: string[]) => void;
}) {
    const [name, setName] = useState(() => layout?.groups.find((item) => ids.length > 0 && ids.every((id) => item.elementIds.includes(id)))?.name ?? 'Group');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const request = useRef<AbortController | undefined>(undefined);
    const latest = useRef({ scene, layout });
    useLayoutEffect(() => { latest.current = { scene, layout }; }, [scene, layout]);
    useEffect(() => () => request.current?.abort(), []);
    const members = expandGroups(ids, layout);
    const allLocked = members.length > 0 && members.every((id) => layout?.lockedIds.includes(id));
    const anyLocked = members.some((id) => layout?.lockedIds.includes(id));
    const groups = (layout?.groups ?? []).filter((group) => group.elementIds.some((id) => ids.includes(id)));
    const group = groups.length === 1 && members.every((id) => groups[0].elementIds.includes(id)) ? groups[0] : undefined;
    const units = new Set(members.map((id) => linkedElementIds(scene, id, layout).toSorted().join("|"))).size;

    function metadata(change: () => EditorLayout) {
        try {
            const next = change();
            onDocumentChange((document) => document.scene === scene && document.layout === layout ? { ...document, layout: next } : document);
            setError('');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'The layers could not be changed.'); }
    }
    async function geometry(action: LayoutAction | 'duplicate') {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError('');
        try {
            let next: Scene, nextLayout = layout;
            let copied: string[] | undefined;
            if (action === 'duplicate') {
                if (!group) throw new Error('Select one group to duplicate.');
                const originals = scene.elements.filter((element) => members.includes(element.id));
                const copies = originals.map((element) =>
                    ({ ...element, id: `copy_${crypto.randomUUID().replaceAll('-', '')}` }));
                const idMap = new Map(originals.map((element, index) => [element.id, copies[index].id]));
                for (const copy of copies) if (copy.activityId) {
                    if (idMap.has(copy.activityId)) copy.activityId = idMap.get(copy.activityId);
                    else delete copy.activityId;
                }
                next = { ...scene, elements: [...scene.elements, ...copies] };
                copied = copies.map((element) => element.id);
                nextLayout = groupLayers(next, layout, copied, `${group.name.slice(0, 55)} copy`);
            } else next = arrangeLayers(scene, members, action, layout);
            const mapped = await mapWatch(next, false, controller.signal);
            if (controller.signal.aborted) return;
            if (latest.current.scene !== scene || latest.current.layout !== layout) throw new Error('The design changed. Try arranging the layers again.');
            onDocumentChange((document) => document.scene === scene && document.layout === layout
                ? { ...document, scene: mapped.scene, ...(nextLayout ? { layout: nextLayout } : {}) } : document);
            if (copied) onSelect?.(copied);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The layers could not be arranged.');
        } finally { if (request.current === controller) { request.current = undefined; setBusy(false); } }
    }
    return <section className="layout-panel" aria-label="Layer layout" aria-busy={busy}>
        <h2>Layout</h2>
        <div className="layout-actions">
            <button type="button" disabled={busy || !members.length} onClick={() => metadata(() => setLayerLocks(layout, members, !allLocked))}>{allLocked ? 'Unlock' : 'Lock'} layers</button>
            {!!groups.length && <button type="button" disabled={busy} onClick={() => metadata(() => ungroupLayers(layout, members))}>Ungroup</button>}
            {group && <button type="button" disabled={busy} onClick={() => void geometry('duplicate')}>Duplicate group</button>}
        </div>
        {members.length > 1 && <>
            <label className="layout-group-name">Group name<input type="text" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /></label>
            <button type="button" disabled={busy || !name.trim()} onClick={() => metadata(() => groupLayers(scene, layout, members, name))}>{group ? 'Rename group' : 'Group selection'}</button>
            <div className="layout-alignment" role="group" aria-label="Align and distribute layers">
                {actions.map(([action, label]) => <button key={action} type="button" title={label} disabled={busy || anyLocked || units < (action.startsWith('distribute') ? 3 : 2)} onClick={() => void geometry(action)}>{label}</button>)}
            </div>
        </>}
        {anyLocked && <p className="control-hint">Locked layers stay fixed when dragging, nudging or arranging.</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
