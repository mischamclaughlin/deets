import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { designFilename, maxDesignBytes, prepareDesign, serialiseDesign, type DesignDocument } from './design-file.ts';
import './DesignFilePanel.css';

export function DesignFilePanel({ scene, grid, revision, disabled, onImport }: DesignDocument & {
    revision: number;
    disabled: boolean;
    onImport: (document: DesignDocument) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const request = useRef<AbortController | undefined>(undefined);
    const current = useRef({ scene, grid, revision });
    useLayoutEffect(() => { current.current = { scene, grid, revision }; }, [scene, grid, revision]);
    useEffect(() => () => request.current?.abort(), []);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState(false);

    async function importFile(file: File) {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        const snapshot = current.current;
        setBusy(true);
        setError(false);
        setMessage('Checking design…');
        try {
            if (file.size > maxDesignBytes) throw new Error('Choose a design file up to 1 MB.');
            const document = await prepareDesign(await file.text(), controller.signal);
            if (controller.signal.aborted) return;
            if (current.current.scene !== snapshot.scene || current.current.grid !== snapshot.grid || current.current.revision !== snapshot.revision)
                throw new Error('Your design changed during import. Import the file again.');
            onImport(document);
            setMessage(`Imported ${document.scene.name}. Undo restores the previous design.`);
        } catch (failure) {
            if (controller.signal.aborted) return;
            setError(true);
            setMessage(failure instanceof Error ? failure.message : 'The design could not be imported.');
        } finally {
            if (request.current === controller) { request.current = undefined; setBusy(false); }
        }
    }

    function save() {
        try {
            const url = URL.createObjectURL(new Blob([serialiseDesign({ scene, grid })], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = designFilename(scene.name);
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setError(false);
            setMessage('Design file download started.');
        } catch {
            setError(true);
            setMessage('The design could not be saved. Try again.');
        }
    }

    return <section className="design-files" aria-label="Design files" aria-busy={busy}>
        <div className="design-file-actions">
            <button type="button" disabled={disabled || busy} onClick={save}>Save design</button>
            <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? 'Importing…' : 'Import design'}</button>
        </div>
        <input ref={input} type="file" accept=".json,.deets.json,application/json" aria-label="Import design file" hidden
            onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
            }} />
        <p className="design-file-hint">Design + grid · .deets.json · Custom fonts need the original local files.</p>
        {message && <p className="typography-status" role={error ? 'alert' : 'status'}>{message}</p>}
    </section>;
}
