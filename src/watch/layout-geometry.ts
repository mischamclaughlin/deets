import type { Scene } from '../../shared/scene.ts';
import { linkedElementIds, type EditorLayout } from './editor-layout.ts';

export type LayoutAction = 'left' | 'centreX' | 'right' | 'top' | 'centreY' | 'bottom' | 'distributeX' | 'distributeY';

/** Groups are rigid units; alignment never resizes text or silently clamps geometry. */
export function arrangeLayers(scene: Scene, ids: readonly string[], action: LayoutAction, layout?: EditorLayout): Scene {
    if (!['left', 'centreX', 'right', 'top', 'centreY', 'bottom', 'distributeX', 'distributeY'].includes(action))
        throw new Error('Choose an alignment or distribution action.');
    if (!ids.length || ids.some((id) => !scene.elements.some((element) => element.id === id))) throw new Error('Select the layers again.');
    const selected = [...new Set(ids.flatMap((id) => linkedElementIds(scene, id, layout)))];
    if (selected.some((id) => !scene.elements.some((element) => element.id === id))) throw new Error('Select the layers again.');
    if (selected.some((id) => layout?.lockedIds.includes(id))) throw new Error('Unlock the selected layers before arranging them.');
    const elements = scene.elements.filter((element) => selected.includes(element.id));
    if (elements.some((element) => element.source === 'secondsRing')) throw new Error('The outer seconds ring cannot be arranged.');
    const seen = new Set<string>();
    const units = elements.flatMap((element) => {
        if (seen.has(element.id)) return [];
        const members = elements.filter((item) => linkedElementIds(scene, element.id, layout).includes(item.id));
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
        const ordered = [...units].sort((a, b) => a[axis] - b[axis]);
        const gap = (last - first - units.reduce((total, unit) => total + unit[extent], 0)) / (units.length - 1);
        if (gap < 0) throw new Error('There is not enough room to distribute these layers without overlap.');
        let position = first;
        for (const unit of ordered) {
            const delta = Math.round(position) - unit[axis];
            unit.members.forEach((element) => translations.set(element.id, delta));
            position += unit[extent] + gap;
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
