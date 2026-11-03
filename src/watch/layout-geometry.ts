import type { Scene } from '../../shared/scene.ts';
import { linkedElementIds, type EditorLayout } from './editor-layout.ts';

export type LayoutAction = 'left' | 'centreX' | 'right' | 'top' | 'centreY' | 'bottom' | 'distributeX' | 'distributeY';
export type SpacingAction = Extract<LayoutAction, 'distributeX' | 'distributeY'>;

export interface GroupArrangementOptions {
    spacing?: 'gaps' | 'centres';
    keepLinkedParts?: boolean;
}

/** Native element boxes only; this is a browser annotation, never exported geometry. */
export function groupBounds(scene: Scene, ids: readonly string[]): { x: number; y: number; width: number; height: number } | undefined {
    if (!ids.length || ids.some((id) => !scene.elements.some((element) => element.id === id))) return undefined;
    const elements = scene.elements.filter((element) => ids.includes(element.id));
    const x = Math.min(...elements.map((element) => element.x));
    const y = Math.min(...elements.map((element) => element.y));
    return { x, y, width: Math.max(...elements.map((element) => element.x + element.width)) - x,
        height: Math.max(...elements.map((element) => element.y + element.height)) - y };
}

/** Arrange members inside the bounds captured before this command, without changing membership. */
export function arrangeGroupMembers(scene: Scene, layout: EditorLayout | undefined, groupId: string,
    action: LayoutAction, options: GroupArrangementOptions = {}): Scene {
    const group = layout?.groups.find((item) => item.id === groupId);
    if (!layout || !group) throw new Error('Choose an existing group.');
    if (options.spacing !== undefined && options.spacing !== 'gaps' && options.spacing !== 'centres')
        throw new Error('Choose equal gaps or equal centres.');
    const bounds = groupBounds(scene, group.elementIds);
    if (!bounds) throw new Error('Select the layers again.');
    if (options.keepLinkedParts !== false && group.elementIds.some((id) =>
        linkedElementIds(scene, id).some((member) => !group.elementIds.includes(member))))
        throw new Error('Add the linked activity parts to this group before arranging its members.');
    const next = arrange(scene, group.elementIds, action, { lockedIds: layout.lockedIds, groups: [] }, options);
    if (next.elements.some((element) => group.elementIds.includes(element.id) &&
        (element.x < bounds.x || element.y < bounds.y || element.x + element.width > bounds.x + bounds.width ||
            element.y + element.height > bounds.y + bounds.height)))
        throw new Error('These element sizes cannot be spaced by their centres within the group bounds.');
    return next;
}

/** Compatibility wrapper for equal-gap group spacing. */
export function spaceGroupMembers(scene: Scene, layout: EditorLayout | undefined, groupId: string, action: SpacingAction): Scene {
    if (action !== 'distributeX' && action !== 'distributeY') throw new Error('Choose a spacing action.');
    return arrangeGroupMembers(scene, layout, groupId, action);
}

/** Groups are rigid units; alignment never resizes text or silently clamps geometry. */
export function arrangeLayers(scene: Scene, ids: readonly string[], action: LayoutAction, layout?: EditorLayout): Scene {
    return arrange(scene, ids, action, layout);
}

function arrange(scene: Scene, ids: readonly string[], action: LayoutAction, layout?: EditorLayout,
    options: GroupArrangementOptions = {}): Scene {
    const linkedIds = (id: string) => options.keepLinkedParts === false ? [id] : linkedElementIds(scene, id, layout);
    if (!['left', 'centreX', 'right', 'top', 'centreY', 'bottom', 'distributeX', 'distributeY'].includes(action))
        throw new Error('Choose an alignment or distribution action.');
    if (!ids.length || ids.some((id) => !scene.elements.some((element) => element.id === id))) throw new Error('Select the layers again.');
    const selected = [...new Set(ids.flatMap(linkedIds))];
    if (selected.some((id) => !scene.elements.some((element) => element.id === id))) throw new Error('Select the layers again.');
    if (selected.some((id) => layout?.lockedIds.includes(id))) throw new Error('Unlock the selected layers before arranging them.');
    const elements = scene.elements.filter((element) => selected.includes(element.id));
    if (elements.some((element) => element.source === 'secondsRing')) throw new Error('The outer seconds ring cannot be arranged.');
    const seen = new Set<string>();
    const units = elements.flatMap((element) => {
        if (seen.has(element.id)) return [];
        const members = elements.filter((item) => linkedIds(element.id).includes(item.id));
        members.forEach((item) => seen.add(item.id));
        const x = Math.min(...members.map((item) => item.x)), y = Math.min(...members.map((item) => item.y));
        return [{ members, x, y, width: Math.max(...members.map((item) => item.x + item.width)) - x,
            height: Math.max(...members.map((item) => item.y + item.height)) - y }];
    });
    const distributing = action.startsWith('distribute');
    if (units.length < (distributing ? 3 : 2)) throw new Error(`Select at least ${distributing ? 'three' : 'two'} independent layers or groups.`);
    const horizontal = ['left', 'centreX', 'right', 'distributeX'].includes(action);
    const axis = horizontal ? 'x' : 'y', extent = horizontal ? 'width' : 'height';
    const first = Math.min(...units.map((unit) => unit[axis]));
    const last = Math.max(...units.map((unit) => unit[axis] + unit[extent]));
    const translations = new Map<string, number>();
    if (distributing) {
        const centres = options.spacing === 'centres';
        const anchor = (unit: typeof units[number]) => unit[axis] + (centres ? unit[extent] / 2 : 0);
        const ordered = [...units].sort((a, b) => anchor(a) - anchor(b));
        if (centres) {
            const start = anchor(ordered[0]), end = anchor(ordered.at(-1)!);
            ordered.forEach((unit, index) => {
                const position = start + (end - start) * index / (ordered.length - 1) - unit[extent] / 2;
                unit.members.forEach((element) => translations.set(element.id, Math.round(position) - unit[axis]));
            });
        } else {
            const gap = (last - first - units.reduce((total, unit) => total + unit[extent], 0)) / (units.length - 1);
            if (gap < 0) throw new Error('There is not enough room for equal gaps without overlap. Try equal centres.');
            let position = first;
            for (const unit of ordered) {
                const delta = Math.round(position) - unit[axis];
                unit.members.forEach((element) => translations.set(element.id, delta));
                position += unit[extent] + gap;
            }
        }
    } else {
        for (const unit of units) {
            const coordinate = ['left', 'top'].includes(action) ? first : ['right', 'bottom'].includes(action)
                ? last - unit[extent] : Math.round((first + last - unit[extent]) / 2);
            unit.members.forEach((element) => translations.set(element.id, coordinate - unit[axis]));
        }
    }
    return { ...scene, elements: scene.elements.map((element) => translations.has(element.id)
        ? { ...element, [axis]: element[axis] + translations.get(element.id)! } : element) };
}
