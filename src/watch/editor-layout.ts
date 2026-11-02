import type { Scene } from '../../shared/scene.ts';
import { activityParts } from './library-catalogue.ts';

export interface ElementGroup { id: string; name: string; elementIds: string[] }
/** Browser editing metadata. Never passed to the native scene or renderer. */
export interface EditorLayout { lockedIds: string[]; groups: ElementGroup[] }
export const emptyLayout: EditorLayout = { lockedIds: [], groups: [] };

export function parseLayout(value: unknown, ids: readonly string[]): EditorLayout {
    const invalid = () => new Error('This file contains invalid layer locks or groups.');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const item = value as Record<string, unknown>;
    if (Object.keys(item).some((key) => key !== 'lockedIds' && key !== 'groups') ||
        !Array.isArray(item.lockedIds) || !Array.isArray(item.groups) || item.groups.length > 20) throw invalid();
    const validIds = (members: unknown): members is string[] => Array.isArray(members) && members.length <= 40 &&
        members.every((id) => typeof id === 'string' && ids.includes(id)) && new Set(members).size === members.length;
    if (!validIds(item.lockedIds)) throw invalid();
    const groupIds = new Set<string>(), used = new Set<string>();
    for (const raw of item.groups as unknown[]) {
        const group = raw as Record<string, unknown>;
        if (!group || typeof group !== 'object' || Array.isArray(group) ||
            Object.keys(group).some((key) => !['id', 'name', 'elementIds'].includes(key)) ||
            typeof group.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(group.id) || groupIds.has(group.id) ||
            typeof group.name !== 'string' || !group.name.trim() || group.name.length > 60 ||
            !validIds(group.elementIds) || group.elementIds.length < 2 || group.elementIds.some((id) => used.has(id))) throw invalid();
        groupIds.add(group.id);
        group.elementIds.forEach((id) => used.add(id));
    }
    return structuredClone(value) as EditorLayout;
}

/** Deletion drops stale references; groups with fewer than two members dissolve. */
export function tidyLayout(layout: EditorLayout | undefined, scene: Scene): EditorLayout | undefined {
    if (!layout) return undefined;
    const ids = new Set(scene.elements.map((element) => element.id));
    return { lockedIds: layout.lockedIds.filter((id) => ids.has(id)), groups: layout.groups.map((group) =>
        ({ ...group, elementIds: group.elementIds.filter((id) => ids.has(id)) })).filter((group) => group.elementIds.length >= 2) };
}

export function expandGroups(ids: readonly string[], layout?: EditorLayout): string[] {
    const result = new Set(ids);
    for (const group of layout?.groups ?? []) if (group.elementIds.some((id) => result.has(id)))
        group.elementIds.forEach((id) => result.add(id));
    return [...result];
}
export function selectionWithGroups(current: string[], id: string | undefined, additive: boolean, layout?: EditorLayout): string[] {
    if (!id) return [];
    const members = expandGroups([id], layout);
    if (!additive) return members;
    return members.every((member) => current.includes(member)) ? current.filter((member) => !members.includes(member))
        : [...new Set([...current, ...members])];
}

export function setLayerLocks(layout: EditorLayout | undefined, ids: readonly string[], locked: boolean): EditorLayout {
    const next = new Set(layout?.lockedIds ?? []);
    for (const id of expandGroups(ids, layout)) { if (locked) next.add(id); else next.delete(id); }
    return { groups: layout?.groups ?? [], lockedIds: [...next] };
}
export function groupLayers(scene: Scene, layout: EditorLayout | undefined, ids: readonly string[], name: string): EditorLayout {
    if (ids.some((id) => !scene.elements.some((element) => element.id === id))) throw new Error('Select the layers again.');
    const members = [...new Set(ids.flatMap((id) => linkedElementIds(scene, id, layout)))];
    if (members.length < 2 || !name.trim() || name.trim().length > 60) throw new Error('Select at least two layers and enter a group name up to 60 characters.');
    if (scene.elements.some((element) => members.includes(element.id) && element.source === 'secondsRing'))
        throw new Error('The outer seconds ring cannot join a movable group.');
    const groups = (layout?.groups ?? []).filter((group) => !group.elementIds.some((id) => members.includes(id)));
    let sequence = 1;
    while (groups.some((group) => group.id === `group-${sequence}`)) sequence++;
    return parseLayout({ lockedIds: layout?.lockedIds ?? [], groups: [...groups,
        { id: `group-${sequence}`, name: name.trim(), elementIds: members }] }, scene.elements.map((element) => element.id));
}
export function ungroupLayers(layout: EditorLayout | undefined, ids: readonly string[]): EditorLayout {
    return { lockedIds: layout?.lockedIds ?? [], groups: (layout?.groups ?? [])
        .filter((group) => !group.elementIds.some((id) => ids.includes(id))) };
}

export function renameElementGroup(scene: Scene, layout: EditorLayout | undefined, groupId: string, name: string): EditorLayout {
    if (!layout?.groups.some((group) => group.id === groupId)) throw new Error('Choose an existing group.');
    if (!name.trim() || name.trim().length > 60) throw new Error('Enter a group name from 1 to 60 characters.');
    return parseLayout({ ...layout, groups: layout.groups.map((group) =>
        group.id === groupId ? { ...group, name: name.trim() } : group) }, scene.elements.map((element) => element.id));
}

/** Membership edits affect the chosen layers and activity partners, not their whole named group. */
function membershipIds(scene: Scene, ids: readonly string[]): string[] {
    if (!ids.length || ids.some((id) => !scene.elements.some((element) => element.id === id)))
        throw new Error('Select the layers again.');
    return [...new Set(ids.flatMap((id) => linkedElementIds(scene, id)))];
}

export function assignLayersToGroup(scene: Scene, layout: EditorLayout | undefined, ids: readonly string[], targetGroupId: string): EditorLayout {
    const target = layout?.groups.find((group) => group.id === targetGroupId);
    if (!layout || !target) throw new Error('Choose an existing group.');
    const members = membershipIds(scene, ids);
    if (scene.elements.some((element) => members.includes(element.id) && element.source === 'secondsRing'))
        throw new Error('The outer seconds ring cannot join a movable group.');
    const groups = layout.groups.map((group) => group.id === targetGroupId
        ? { ...group, elementIds: [...new Set([...group.elementIds, ...members])] }
        : { ...group, elementIds: group.elementIds.filter((id) => !members.includes(id)) })
        .filter((group) => group.elementIds.length >= 2);
    return parseLayout({ lockedIds: layout.lockedIds, groups }, scene.elements.map((element) => element.id));
}

export function removeLayersFromGroups(scene: Scene, layout: EditorLayout | undefined, ids: readonly string[]): EditorLayout {
    const members = membershipIds(scene, ids);
    const groups = (layout?.groups ?? []).map((group) =>
        ({ ...group, elementIds: group.elementIds.filter((id) => !members.includes(id)) }))
        .filter((group) => group.elementIds.length >= 2);
    return parseLayout({ lockedIds: layout?.lockedIds ?? [], groups }, scene.elements.map((element) => element.id));
}

export const isSelectionLocked = (ids: readonly string[], layout?: EditorLayout): boolean =>
    expandGroups(ids, layout).some((id) => layout?.lockedIds.includes(id));

/** Only an activity's icon and data share movement; its graph is independent. */
function activityLinkedIds(scene: Scene, elementId: string): string[] {
    const selected = scene.elements.find((element) => element.id === elementId);
    if (!selected) return [];
    const root = selected.activityId
        ? scene.elements.find((element) => element.id === selected.activityId)
        : selected;
    if (!root || root.moveTogether === false) return [elementId];
    const iconSource = activityParts[root.source as keyof typeof activityParts]?.icon;
    if (selected.id !== root.id && selected.source !== iconSource) return [elementId];
    return scene.elements.filter((element) => element.id === root.id ||
        (element.activityId === root.id && element.source === iconSource))
        .map((element) => element.id);
}

/** Resolve groups and linked activity parts transitively as one rigid movement. */
export function linkedElementIds(scene: Scene, elementId: string, layout?: EditorLayout): string[] {
    const ids = new Set([elementId]);
    let before = 0;
    while (before !== ids.size) {
        before = ids.size;
        for (const id of expandGroups([...ids], layout)) {
            ids.add(id);
            activityLinkedIds(scene, id).forEach((member) => ids.add(member));
        }
    }
    return scene.elements.filter((element) => ids.has(element.id)).map((element) => element.id);
}
