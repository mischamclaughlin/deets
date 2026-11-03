import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Scene } from '../../shared/scene.ts';
import { mapWatch } from './api.ts';
import type { DesignDocument } from './design-file.ts';
import { assignLayersToGroup, groupLayers, linkedElementIds, removeLayersFromGroups, renameElementGroup,
    ungroupLayers, type EditorLayout } from './editor-layout.ts';
import { elementName } from './element-name.ts';
import { spaceGroupMembers, type SpacingAction } from './layout-geometry.ts';
import './GroupPanel.css';

function GroupName({ name, disabled, onCommit }: { name: string; disabled: boolean; onCommit: (name: string) => void }) {
    const [draft, setDraft] = useState({ original: name, value: name });
    const value = draft.original === name ? draft.value : name;
    const commit = () => { if (value !== name) onCommit(value); };
    return <form onSubmit={(event) => { event.preventDefault(); commit(); }}>
        <label className="group-field">Name
            <input type="text" maxLength={60} value={value} disabled={disabled} aria-label="Group name"
                onChange={(event) => setDraft({ original: name, value: event.target.value })} onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key !== 'Escape') return;
                    event.stopPropagation();
                    setDraft({ original: name, value: name });
                }} />
        </label>
    </form>;
}

/** Group membership and internal spacing belong beside element properties. */
export function GroupPanel({ scene, layout, ids, onDocumentChange, onSelect }: {
    scene: Scene; layout?: EditorLayout; ids: string[];
    onDocumentChange: Dispatch<SetStateAction<DesignDocument>>;
    onSelect: (ids: string[]) => void;
}) {
    const groups = layout?.groups ?? [];
    const group = groups.find((item) => ids.length > 0 && ids.every((id) => item.elementIds.includes(id)));
    const grouped = groups.some((item) => item.elementIds.some((id) => ids.includes(id)));
    const value = group?.id ?? (grouped ? '__mixed__' : '');
    const members = [...new Set(ids.flatMap((id) => linkedElementIds(scene, id, layout)))];
    const includesRing = scene.elements.some((element) => members.includes(element.id) && element.source === 'secondsRing');
    const canCreate = members.length >= 2 && !includesRing;
    const groupUnits = new Set(group?.elementIds.map((id) => linkedElementIds(scene, id).toSorted().join('|'))).size;
    const groupLocked = group?.elementIds.some((id) => layout?.lockedIds.includes(id));
    const [newName, setNewName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const latest = useRef({ scene, layout });
    const request = useRef<AbortController | undefined>(undefined);
    useLayoutEffect(() => { latest.current = { scene, layout }; }, [scene, layout]);
    useEffect(() => () => request.current?.abort(), []);

    function change(make: () => EditorLayout) {
        try {
            const next = make();
            onDocumentChange((document) => document.scene === scene && document.layout === layout ? { ...document, layout: next } : document);
            setError('');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'The group could not be updated.'); }
    }
    async function space(action: SpacingAction) {
        if (!group || request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError('');
        try {
            const next = spaceGroupMembers(scene, layout, group.id, action);
            const mapped = await mapWatch(next, false, controller.signal);
            if (controller.signal.aborted) return;
            if (latest.current.scene !== scene || latest.current.layout !== layout) throw new Error('The design changed. Try spacing the group again.');
            onDocumentChange((document) => document.scene === scene && document.layout === layout
                ? { ...document, scene: mapped.scene } : document);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The group could not be spaced.');
        } finally { if (request.current === controller) { request.current = undefined; setBusy(false); } }
    }
    async function duplicate() {
        if (!group || request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError('');
        try {
            const originals = scene.elements.filter((element) => group.elementIds.includes(element.id));
            const copies = originals.map((element) => ({ ...element, id: `copy_${crypto.randomUUID().replaceAll('-', '')}` }));
            const idMap = new Map(originals.map((element, index) => [element.id, copies[index].id]));
            for (const copy of copies) if (copy.activityId) {
                if (idMap.has(copy.activityId)) copy.activityId = idMap.get(copy.activityId);
                else delete copy.activityId;
            }
            const next = { ...scene, elements: [...scene.elements, ...copies] };
            const copied = copies.map((element) => element.id);
            const nextLayout = groupLayers(next, layout, copied, `${group.name.slice(0, 55)} copy`);
            const mapped = await mapWatch(next, false, controller.signal);
            if (controller.signal.aborted) return;
            if (latest.current.scene !== scene || latest.current.layout !== layout) throw new Error('The design changed. Duplicate the group again.');
            onDocumentChange((document) => document.scene === scene && document.layout === layout
                ? { ...document, scene: mapped.scene, layout: nextLayout } : document);
            onSelect(copied);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The group could not be duplicated.');
        } finally { if (request.current === controller) { request.current = undefined; setBusy(false); } }
    }
    return <section className="group-panel" aria-label="Element group" aria-busy={busy}>
        <label className="group-field">Membership
            <select aria-label="Element group" value={value} disabled={busy || includesRing} onChange={(event) => change(() => event.target.value
                ? assignLayersToGroup(scene, layout, ids, event.target.value) : removeLayersFromGroups(scene, layout, ids))}>
                <option value="">No group</option>
                {value === '__mixed__' && <option value="__mixed__" disabled>Mixed groups</option>}
                {groups.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.elementIds.length}</option>)}
            </select>
        </label>
        {group ? <>
            <GroupName key={group.id} name={group.name} disabled={busy} onCommit={(name) => change(() => renameElementGroup(scene, layout, group.id, name))} />
            <div className="group-members-heading"><span>Members</span><span>{group.elementIds.length} elements</span></div>
            <ul className="group-members" aria-label={`${group.name} members`}>
                {group.elementIds.map((id) => <li key={id}>
                    <button className="group-member" type="button" disabled={busy} aria-pressed={ids.includes(id)}
                        onClick={() => onSelect([id])}><span className="group-member-dot" aria-hidden="true" />{elementName(scene, id)}</button>
                    <button className="group-remove" type="button" disabled={busy}
                        aria-label={`Remove ${elementName(scene, id)} from ${group.name}`} title="Remove from group"
                        onClick={() => change(() => removeLayersFromGroups(scene, layout, [id]))}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
                    </button>
                </li>)}
            </ul>
            <div className="group-spacing" role="group" aria-label="Space members within group bounds">
                <button type="button" disabled={busy || groupLocked || groupUnits < 3} onClick={() => void space('distributeX')}>Space horizontally</button>
                <button type="button" disabled={busy || groupLocked || groupUnits < 3} onClick={() => void space('distributeY')}>Space vertically</button>
            </div>
            {(groupLocked || groupUnits < 3) && <p className="group-hint">{groupLocked
                ? 'Unlock the group to space its members.' : 'Spacing needs at least three independent elements. Linked activity parts move together.'}</p>}
            <div className="group-actions">
                <button type="button" disabled={busy} onClick={() => onSelect(group.elementIds)}>Select group</button>
                <button type="button" disabled={busy || scene.elements.length + group.elementIds.length > 40 || groups.length >= 20}
                    onClick={() => void duplicate()}>{busy ? 'Duplicating…' : 'Duplicate'}</button>
                <button type="button" className="group-ungroup" disabled={busy} onClick={() => change(() => ungroupLayers(layout, group.elementIds))}>Ungroup</button>
            </div>
        </> : canCreate ? <form className="group-create" onSubmit={(event) => {
            event.preventDefault();
            change(() => groupLayers(scene, layout, ids, newName.trim() || `Group ${groups.length + 1}`));
        }}>
            <label className="group-field">New group name<input type="text" maxLength={60} placeholder={`Group ${groups.length + 1}`}
                value={newName} disabled={busy} onChange={(event) => setNewName(event.target.value)} /></label>
            <button className="group-create-button" type="submit" disabled={busy}>{grouped ? 'Merge into new group' : 'Create group'}</button>
        </form> : <p className="group-hint">{includesRing ? 'The outer seconds ring stays outside movable groups.' : 'Choose a group above, or Shift-click another element to create one.'}</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
