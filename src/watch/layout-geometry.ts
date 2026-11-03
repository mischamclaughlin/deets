import { devices, type Scene } from '../../shared/scene.ts';
import { linkedElementIds, type EditorLayout } from './editor-layout.ts';

export type LayoutAction = 'left' | 'centreX' | 'right' | 'top' | 'centreY' | 'bottom' | 'distributeX' | 'distributeY';
export type SpacingAction = Extract<LayoutAction, 'distributeX' | 'distributeY'>;
export const GROUP_SPACING_GAP = 8;

export interface GroupArrangementOptions {
    spacing?: 'gaps' | 'centres';
    keepLinkedParts?: boolean;
    expandToFit?: boolean;
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
    const next = arrange(scene, group.elementIds, action, { lockedIds: layout.lockedIds, groups: [] }, { ...options, groupSpacing: true });
    const members = next.elements.filter((element) => group.elementIds.includes(element.id));
    if (members.some((element, index) => members.slice(index + 1).some((other) =>
        element.x < other.x + other.width && element.x + element.width > other.x &&
        element.y < other.y + other.height && element.y + element.height > other.y)))
        throw new Error('This arrangement would overlap group members. Space them apart first.');
    if (!options.expandToFit && next.elements.some((element) => group.elementIds.includes(element.id) &&
        (element.x < bounds.x || element.y < bounds.y || element.x + element.width > bounds.x + bounds.width ||
            element.y + element.height > bounds.y + bounds.height)))
        throw new Error('There is not enough room within the group bounds. Use Expand to fit.');
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
    options: GroupArrangementOptions & { groupSpacing?: boolean } = {}): Scene {
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
    if (distributing && options.groupSpacing && units.some((unit) => unit.members.some((member, index) => unit.members.slice(index + 1).some((other) =>
        member.x < other.x + other.width && member.x + member.width > other.x &&
        member.y < other.y + other.height && member.y + member.height > other.y))))
        throw new Error('Linked parts overlap. Turn off Keep linked parts together to space them separately.');
    const minimum = distributing && !options.groupSpacing ? 3 : 2;
    if (units.length < minimum) throw new Error(`Select at least ${minimum === 3 ? 'three' : 'two'} independent layers or groups.`);
    const horizontal = ['left', 'centreX', 'right', 'distributeX'].includes(action);
    const axis = horizontal ? 'x' : 'y', extent = horizontal ? 'width' : 'height';
    const first = Math.min(...units.map((unit) => unit[axis]));
    const last = Math.max(...units.map((unit) => unit[axis] + unit[extent]));
    const translations = new Map<string, number>();
    if (distributing) {
        const centres = options.spacing === 'centres';
        const anchor = (unit: typeof units[number]) => unit[axis] + (centres ? unit[extent] / 2 : 0);
        const ordered = [...units].sort((a, b) => anchor(a) - anchor(b));
        const clearance = options.groupSpacing ? GROUP_SPACING_GAP : 0;
        const tooSmall = () => new Error('There is not enough room for clear spacing without overlap. Use Expand to fit.');
        if (centres) {
            let start = anchor(ordered[0]);
            let step = (anchor(ordered.at(-1)!) - start) / (ordered.length - 1);
            const requiredStep = Math.max(...ordered.slice(1).map((unit, index) =>
                (unit[extent] + ordered[index][extent]) / 2 + clearance));
            if (options.expandToFit && step < requiredStep) {
                step = Math.ceil(requiredStep);
                const span = step * (ordered.length - 1) + (ordered[0][extent] + ordered.at(-1)![extent]) / 2;
                start = (first + last - span + ordered[0][extent]) / 2;
            }
            ordered.forEach((unit, index) => {
                const position = start + step * index - unit[extent] / 2;
                unit.members.forEach((element) => translations.set(element.id, Math.round(position) - unit[axis]));
            });
        } else {
            const occupied = units.reduce((total, unit) => total + unit[extent], 0);
            let gap = (last - first - occupied) / (units.length - 1);
            if (options.expandToFit) gap = Math.max(clearance, gap);
            if (gap < clearance) throw tooSmall();
            let position = first;
            if (options.expandToFit) position = (first + last - occupied - gap * (units.length - 1)) / 2;
            for (const unit of ordered) {
                const delta = Math.round(position) - unit[axis];
                unit.members.forEach((element) => translations.set(element.id, delta));
                position += unit[extent] + gap;
            }
        }
        if (options.groupSpacing && ordered.slice(1).some((unit, index) => {
            const previous = ordered[index];
            return unit[axis] + translations.get(unit.members[0].id)! -
                (previous[axis] + translations.get(previous.members[0].id)! + previous[extent]) < clearance;
        })) throw tooSmall();
    } else {
        for (const unit of units) {
            const coordinate = ['left', 'top'].includes(action) ? first : ['right', 'bottom'].includes(action)
                ? last - unit[extent] : Math.round((first + last - unit[extent]) / 2);
            unit.members.forEach((element) => translations.set(element.id, coordinate - unit[axis]));
        }
    }
    let next: Scene = { ...scene, elements: scene.elements.map((element) => translations.has(element.id)
        ? { ...element, [axis]: element[axis] + translations.get(element.id)! } : element) };
    if (distributing && options.expandToFit) next = fitSpacingToWatch(next, selected, axis);
    return next;
}

/** Intersect all corner constraints, then choose the nearest whole-pixel translation. */
function fitSpacingToWatch(scene: Scene, ids: string[], axis: 'x' | 'y'): Scene {
    const size = devices[scene.device], centre = size / 2;
    const radius = centre - (scene.edgeInset ?? 0);
    let lower = -Infinity, upper = Infinity;
    for (const element of scene.elements.filter((item) => ids.includes(item.id))) {
        const across = axis === 'x' ? 'y' : 'x';
        const extent = axis === 'x' ? 'width' : 'height';
        const crossExtent = axis === 'x' ? 'height' : 'width';
        lower = Math.max(lower, -element[axis]);
        upper = Math.min(upper, size - element[axis] - element[extent]);
        for (const cross of [element[across], element[across] + element[crossExtent]]) {
            if (cross < 0 || cross > size) throw cannotFit();
            if (scene.edgeInset === undefined) continue;
            const square = radius ** 2 - (cross - centre) ** 2;
            if (square < 0) throw cannotFit();
            const span = Math.sqrt(square);
            lower = Math.max(lower, centre - span - element[axis]);
            upper = Math.min(upper, centre + span - element[axis] - element[extent]);
        }
    }
    const min = Math.ceil(lower), max = Math.floor(upper);
    if (min > max) throw cannotFit();
    const delta = Math.max(min, Math.min(max, 0));
    return delta ? { ...scene, elements: scene.elements.map((element) => ids.includes(element.id)
        ? { ...element, [axis]: element[axis] + delta } : element) } : scene;
}

function cannotFit(): Error {
    return new Error('These elements cannot fit on this watch with clear spacing. Reduce their sizes or use the other direction.');
}
