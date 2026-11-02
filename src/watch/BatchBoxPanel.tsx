import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { devices, type Scene } from '../../shared/scene.ts';
import { applyBatchGeometry, type BoxField } from './batch-geometry.ts';
import { SliderValue } from './SliderValue.tsx';
import './BatchBoxPanel.css';
import { isSelectionLocked, type EditorLayout } from './editor-layout.ts';

const fields = ['x', 'y', 'width', 'height'] as const;
const fieldLabel = (field: BoxField) => field === 'x' || field === 'y' ? field.toUpperCase() : field === 'width' ? 'Width' : 'Height';

/** Shared absolute geometry, committed as one native-validated history snapshot. */
export function BatchBoxPanel({ scene, layout, ids, onSceneChange }: {
    scene: Scene;
    layout?: EditorLayout;
    ids: string[];
    onSceneChange: Dispatch<SetStateAction<Scene>>;
}) {
    const request = useRef<AbortController | undefined>(undefined);
    const latestScene = useRef(scene);
    const latestLayout = useRef(layout);
    useLayoutEffect(() => { latestScene.current = scene; latestLayout.current = layout; }, [scene, layout]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState(false);
    useEffect(() => () => request.current?.abort(), []);
    const selected = scene.elements.filter((element) => ids.includes(element.id));
    const size = devices[scene.device];

    async function apply(field: BoxField, value: number) {
        if (request.current || isSelectionLocked(ids, layout)) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setError(false);
        setMessage(`Applying ${fieldLabel(field)}…`);
        try {
            const next = await applyBatchGeometry(scene, ids, field, value, controller.signal);
            if (controller.signal.aborted) return;
            if (latestScene.current !== scene || latestLayout.current !== layout) throw new Error('The canvas changed while applying these values. Try again.');
            onSceneChange((current) => current === scene ? next : current);
            setMessage('');
        } catch (failure) {
            if (controller.signal.aborted) return;
            setError(true);
            setMessage(failure instanceof Error ? failure.message : 'The selected elements could not be changed.');
        } finally {
            if (request.current === controller) { request.current = undefined; setBusy(false); }
        }
    }

    return <section className="batch-box-panel" aria-labelledby="batch-box-heading" aria-busy={busy}>
        <h2 id="batch-box-heading">Position and size <span className="section-unit">px</span></h2>
        <p className="control-hint">Each value applies to every selected element.</p>
        <div className="batch-box-fields">
            {fields.map((field) => {
                const value = selected[0]?.[field];
                const shared = selected.every((element) => element[field] === value) ? value : undefined;
                return <label key={field}>{fieldLabel(field)}
                    <SliderValue label={fieldLabel(field)} value={shared} min={field === 'x' || field === 'y' ? 0 : 1}
                        max={field === 'x' || field === 'y' ? size - 1 : size} disabled={busy || !selected.length || isSelectionLocked(ids, layout)}
                        onChange={(value) => void apply(field, value)} />
                </label>;
            })}
        </div>
        {message && <p className="typography-status" role={error ? 'alert' : 'status'}>{message}</p>}
    </section>;
}
