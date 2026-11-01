import { devices, isEditableTextSource, type Scene } from '../../shared/scene.ts';
import { mapWatch } from './api.ts';

export type BoxField = 'x' | 'y' | 'width' | 'height';

/** Assign one absolute value to each selected box, leaving linked neighbours untouched. */
export function changeBatchGeometry(scene: Scene, ids: readonly string[], field: BoxField, value: number): Scene {
    if (!['x', 'y', 'width', 'height'].includes(field)) throw new Error('Choose X, Y, width or height.');
    const size = devices[scene.device];
    const position = field === 'x' || field === 'y';
    const minimum = position ? 0 : 1;
    const maximum = position ? size - 1 : size;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
        throw new Error(`Enter a whole-pixel value from ${minimum} to ${maximum}.`);
    const selected = new Set(ids);
    if (!selected.size || [...selected].some((id) => !scene.elements.some((element) => element.id === id)))
        throw new Error('Select the elements again before changing their boxes.');
    return { ...scene, elements: scene.elements.map((element) => {
        if (!selected.has(element.id)) return element;
        return { ...element, [field]: value,
            ...(!position && element.source === 'secondsRing' ? { width: value, height: value } : {}),
            ...(!position && isEditableTextSource(element.source) && element.source !== 'secondsRing'
                ? { boxSizing: 'fixed' as const } : {}),
        };
    }) };
}

/** The native validator accepts every changed box before one editor snapshot is published. */
export async function applyBatchGeometry(scene: Scene, ids: readonly string[], field: BoxField,
    value: number, signal?: AbortSignal): Promise<Scene> {
    signal?.throwIfAborted();
    const next = changeBatchGeometry(scene, ids, field, value);
    const mapped = await mapWatch(next, false, signal);
    signal?.throwIfAborted();
    return mapped.scene;
}
