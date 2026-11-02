import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Scene } from '../../shared/scene.ts';
import { setLabelText } from './api.ts';

/** Literal labels use native glyph coverage and retain their accepted text on failure. */
export function TextLabelPanel({ scene, elementId, onSceneChange }: {
    scene: Scene;
    elementId: string;
    onSceneChange: (scene: Scene) => void;
}) {
    const element = scene.elements.find((item) => item.id === elementId)!;
    const [draft, setDraft] = useState({ original: element.text, text: element.text ?? '' });
    const text = draft.original === element.text ? draft.text : element.text ?? '';
    const setText = (value: string) => setDraft({ original: element.text, text: value });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const current = useRef(scene);
    const request = useRef<AbortController | undefined>(undefined);
    useLayoutEffect(() => { current.current = scene; }, [scene]);
    useEffect(() => () => request.current?.abort(), []);
    async function apply() {
        if (request.current || text === (element.text ?? '')) return;
        const controller = new AbortController();
        const snapshot = scene;
        request.current = controller;
        setBusy(true);
        setError(undefined);
        try {
            const mapped = await setLabelText(snapshot, elementId, text, controller.signal);
            if (controller.signal.aborted) return;
            if (current.current !== snapshot) throw new Error('Your canvas changed. Apply the text again.');
            onSceneChange(mapped.scene);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The text could not be updated.');
        } finally {
            if (request.current === controller) {
                request.current = undefined;
                setBusy(false);
            }
        }
    }
    return <section aria-labelledby="custom-text-heading" aria-busy={busy}>
        <h2 id="custom-text-heading">Custom text</h2>
        <form onSubmit={(event) => { event.preventDefault(); void apply(); }}>
            <label className="font-choice" htmlFor="custom-text-value">Text
                <input id="custom-text-value" type="text" value={text} maxLength={80} disabled={busy}
                    aria-invalid={!!error} aria-describedby={error ? 'custom-text-error' : undefined}
                    onChange={(event) => { setText(event.target.value); setError(undefined); }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            event.stopPropagation();
                            setText(element.text ?? '');
                            setError(undefined);
                        }
                    }} />
            </label>
            <button className="font-upload" type="submit" disabled={busy || text === (element.text ?? '')}>{busy ? 'Applying…' : 'Apply text'}</button>
        </form>
        {error && <p id="custom-text-error" className="typography-status" role="alert">{error}</p>}
    </section>;
}
