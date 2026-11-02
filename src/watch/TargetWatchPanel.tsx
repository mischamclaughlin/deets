import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { devices, type Device } from '../../shared/scene.ts';
import type { DesignDocument } from './design-file.ts';
import { convertWatchDevice } from './api.ts';
import { gridLines } from './grid.ts';

const watchNames: Record<Device, string> = {
    epix2pro42mm: 'Epix Pro · 42 mm',
    epix2pro47mm: 'Epix Pro · 47 mm',
    epix2pro51mm: 'Epix Pro · 51 mm',
};

export function TargetWatchPanel({ document, onChange }: {
    document: DesignDocument;
    onChange: (document: DesignDocument) => void;
}) {
    const latest = useRef(document);
    useLayoutEffect(() => { latest.current = document; }, [document]);
    const request = useRef<AbortController | undefined>(undefined);
    useEffect(() => () => request.current?.abort(), []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function change(device: Device) {
        if (request.current || device === document.scene.device) return;
        const snapshot = document;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setError('');
        try {
            const mapping = await convertWatchDevice(snapshot.scene, device, controller.signal);
            if (controller.signal.aborted) return;
            if (latest.current !== snapshot) throw new Error('Your design changed. Choose the target watch again.');
            gridLines(devices[device], mapping.scene.edgeInset ?? 0, { ...snapshot.grid, visible: true });
            onChange({ ...snapshot, scene: mapping.scene });
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'The watch could not be changed.');
        } finally {
            if (request.current === controller) { request.current = undefined; setBusy(false); }
        }
    }
    return <section aria-label="Target watch" aria-busy={busy}>
        <label className="font-choice">Target watch
            <select value={document.scene.device} disabled={busy} onChange={(event) => void change(event.target.value as Device)}>
                {(Object.keys(devices) as Device[]).map((device) => <option key={device} value={device}>{watchNames[device]} · {devices[device]} px</option>)}
            </select>
        </label>
        <p className="control-hint">Repositions elements proportionally. Text size and fixed boxes stay unchanged.</p>
        {busy && <p className="typography-status" role="status">Preparing target watch…</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
