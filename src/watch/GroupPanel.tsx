import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Scene } from '../../shared/scene.ts';
import { mapWatch } from './api.ts';
import type { DesignDocument } from './design-file.ts';
import { assignLayersToGroup, groupLayers, linkedElementIds, removeLayersFromGroups, renameElementGroup,
    ungroupLayers, type EditorLayout } from './editor-layout.ts';
import { elementName } from './element-name.ts';
import { arrangeGroupMembers, groupBounds, GROUP_SPACING_GAP, type GroupArrangementOptions, type LayoutAction } from './layout-geometry.ts';
import { layoutActions } from './layout-actions.ts';
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
export function GroupPanel({ scene, layout, ids, options, onOptionsChange, onDocumentChange, onSelect }: {
    scene: Scene; layout?: EditorLayout; ids: string[];
    options: Required<GroupArrangementOptions>;
    onOptionsChange: Dispatch<SetStateAction<Required<GroupArrangementOptions>>>;
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
    const wholeGroupSelected = !!group && group.elementIds.every((id) => ids.includes(id));
    const bounds = group && groupBounds(scene, group.elementIds);
    const { spacing, keepLinkedParts, expandToFit } = options;
    const [newName, setNewName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ scene: Scene; message: string }>();
    const [status, setStatus] = useState<{ scene: Scene; message: string }>();
    const latest = useRef({ scene, layout });
    const request = useRef<AbortController | undefined>(undefined);
    useLayoutEffect(() => { latest.current = { scene, layout }; }, [scene, layout]);
    useEffect(() => () => request.current?.abort(), []);

    function updateOptions(change: Partial<GroupArrangementOptions>) {
        onOptionsChange((current) => ({ ...current, ...change }));
        setStatus(undefined); setError(undefined);
    }
    function reportError(failure: unknown, fallback: string) {
        setError({ scene, message: failure instanceof Error ? failure.message : fallback });
    }

    function change(make: () => EditorLayout) {
        try {
            const next = make();
            onDocumentChange((document) => document.scene === scene && document.layout === layout ? { ...document, layout: next } : document);
            setError(undefined); setStatus(undefined);
        } catch (failure) { reportError(failure, 'The group could not be updated.'); }
    }
    const arrangements = layoutActions.map(([action, label]) => {
        try {
            if (group) arrangeGroupMembers(scene, layout, group.id, action, { spacing, keepLinkedParts, expandToFit });
            return { action, label, reason: '' };
        } catch (failure) {
            return { action, label, reason: failure instanceof Error ? failure.message : 'The members cannot be arranged.' };
        }
    });
    const unavailableSpacing = arrangements.filter((item) => item.action.startsWith('distribute') && item.reason);
    const reasons = unavailableSpacing.length === 2 && unavailableSpacing[0].reason === unavailableSpacing[1].reason
        ? [unavailableSpacing[0].reason] : unavailableSpacing.map((item) => `${item.label}: ${item.reason}`);
    async function arrange(action: LayoutAction) {
        if (!group || request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError(undefined); setStatus(undefined);
        try {
            const next = arrangeGroupMembers(scene, layout, group.id, action, { spacing, keepLinkedParts, expandToFit });
            if (next.elements.every((element, index) => element.x === scene.elements[index].x && element.y === scene.elements[index].y)) {
                setStatus({ scene, message: 'Members already match this arrangement.' });
                return;
            }
            const mapped = await mapWatch(next, false, controller.signal);
            if (controller.signal.aborted) return;
            if (latest.current.scene !== scene || latest.current.layout !== layout) throw new Error('The design changed. Try arranging the group again.');
            onDocumentChange((document) => document.scene === scene && document.layout === layout
                ? { ...document, scene: mapped.scene } : document);
            setStatus({ scene: mapped.scene, message: 'Members arranged.' });
        } catch (failure) {
            if (!controller.signal.aborted) reportError(failure, 'The group could not be arranged.');
        } finally { if (request.current === controller) { request.current = undefined; setBusy(false); } }
    }
    async function duplicate() {
        if (!group || request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError(undefined); setStatus(undefined);
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
            if (!controller.signal.aborted) reportError(failure, 'The group could not be duplicated.');
        } finally { if (request.current === controller) { request.current = undefined; setBusy(false); } }
    }
    const membershipControl = <label className="group-field">Membership
            <select aria-label="Element group" value={value} disabled={busy || includesRing} onChange={(event) => change(() => event.target.value
                ? assignLayersToGroup(scene, layout, ids, event.target.value) : removeLayersFromGroups(scene, layout, ids))}>
                <option value="">No group</option>
                {value === '__mixed__' && <option value="__mixed__" disabled>Mixed groups</option>}
                {groups.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.elementIds.length}</option>)}
            </select>
        </label>;
    return <section className="group-panel" aria-label="Element group" aria-busy={busy}>
        {group ? <>
            <GroupName key={group.id} name={group.name} disabled={busy} onCommit={(name) => change(() => renameElementGroup(scene, layout, group.id, name))} />
            <div className="group-selection">
                <span>{wholeGroupSelected ? 'Whole group selected' : `${ids.length} of ${group.elementIds.length} selected`}</span>
                <button type="button" aria-pressed={wholeGroupSelected} disabled={busy} onClick={() => onSelect(group.elementIds)}>Select group</button>
            </div>
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
            <section className="group-arrangement" aria-label="Arrange group members">
                <h3>Arrange members</h3>
                {bounds && <p className="group-bounds">Bounds · {bounds.x}, {bounds.y} · {bounds.width} × {bounds.height} px</p>}
                <label className="group-linked"><input type="checkbox" checked={keepLinkedParts} disabled={busy}
                    onChange={(event) => updateOptions({ keepLinkedParts: event.target.checked })} />Keep linked parts together</label>
                <div className="group-alignment" role="group" aria-label="Align members within group bounds">
                    {arrangements.filter((item) => !item.action.startsWith('distribute')).map(({ action, label, reason }) =>
                        <button key={action} type="button" title={reason || label} disabled={busy || !!reason}
                            onClick={() => void arrange(action)}>{label}</button>)}
                </div>
                <label className="group-field">Spacing
                    <select aria-label="Group spacing mode" value={spacing} disabled={busy}
                        onChange={(event) => updateOptions({ spacing: event.target.value as 'gaps' | 'centres' })}>
                        <option value="gaps">Equal gaps</option><option value="centres">Equal centres</option>
                    </select>
                </label>
                <label className="group-field">Spacing bounds
                    <select aria-label="Group spacing bounds" value={expandToFit ? 'expand' : 'current'} disabled={busy}
                        onChange={(event) => updateOptions({ expandToFit: event.target.value === 'expand' })}>
                        <option value="current">Within current bounds</option><option value="expand">Expand to fit</option>
                    </select>
                </label>
                <p className="group-hint">Spacing keeps at least {GROUP_SPACING_GAP} px between items. Expand to fit makes room without resizing them.</p>
                <div className="group-spacing" role="group" aria-label="Space members within group bounds">
                    {arrangements.filter((item) => item.action.startsWith('distribute')).map(({ action, label, reason }) =>
                        <button key={action} type="button" title={reason || label} disabled={busy || !!reason}
                            onClick={() => void arrange(action)}>{label}</button>)}
                </div>
                {reasons.map((reason) => <p key={reason} className="group-hint">{reason}</p>)}
                {status?.scene === scene && <p className="group-hint" role="status">{status.message}</p>}
            </section>
            {membershipControl}
            <div className="group-actions">
                <button type="button" disabled={busy || scene.elements.length + group.elementIds.length > 40 || groups.length >= 20}
                    onClick={() => void duplicate()}>Duplicate</button>
                <button type="button" className="group-ungroup" disabled={busy} onClick={() => change(() => ungroupLayers(layout, group.elementIds))}>Ungroup</button>
            </div>
        </> : <>{membershipControl}{canCreate ? <form className="group-create" onSubmit={(event) => {
            event.preventDefault();
            change(() => groupLayers(scene, layout, ids, newName.trim() || `Group ${groups.length + 1}`));
        }}>
            <label className="group-field">New group name<input type="text" maxLength={60} placeholder={`Group ${groups.length + 1}`}
                value={newName} disabled={busy} onChange={(event) => setNewName(event.target.value)} /></label>
            <button className="group-create-button" type="submit" disabled={busy}>{grouped ? 'Merge into new group' : 'Create group'}</button>
        </form> : <p className="group-hint">{includesRing ? 'The outer seconds ring stays outside movable groups.' : 'Choose a group above, or Shift-click another element to create one.'}</p>}</>}
        {error?.scene === scene && <p className="typography-status" role="alert">{error.message}</p>}
    </section>;
}
