import { useState } from 'react';
import { followPresetSelection, type PresetSelection } from './preset-selection.ts';

export function usePresetSelection(elementId: string | undefined, linkedId: string | undefined, initialId?: string) {
    const [selection, setSelection] = useState<PresetSelection>(() => ({ elementId, linkedId, selectedId: linkedId ?? initialId }));
    const current = followPresetSelection(selection, elementId, linkedId);
    if (current !== selection) setSelection(current);
    return [current.selectedId, (selectedId: string | null | undefined) => setSelection({ ...current, selectedId: selectedId ?? undefined })] as const;
}
