import type { Scene } from '../../shared/scene.ts';

/** Follow explicit links rather than guessing from matching values. */
export function elementPresetIds(scene: Scene, elementId?: string) {
    const element = scene.elements.find((item) => item.id === elementId);
    const text = scene.textPresets?.find((preset) => preset.id === element?.textPresetId)?.id;
    const colourLinks = [element?.colourPresetId, ...(element?.zoneColourPresetIds ?? []),
        element?.nightColourPresetId, ...(element?.nightZoneColourPresetIds ?? [])];
    const colour = colourLinks.find((id): id is string =>
        typeof id === 'string' && !!scene.colourPresets?.some((preset) => preset.id === id));
    return { text, colour };
}

export interface PresetSelection {
    elementId?: string;
    linkedId?: string;
    selectedId?: string;
}

/** A manual choice lasts until the selected element or its preset link changes. */
export function followPresetSelection(previous: PresetSelection, elementId?: string, linkedId?: string): PresetSelection {
    if (previous.elementId === elementId && previous.linkedId === linkedId) return previous;
    return { elementId, linkedId, selectedId: linkedId ?? previous.selectedId };
}
