import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { designFilename, maxDesignBytes, prepareDesign, serialiseDesign, type DesignDocument } from './design-file.ts';
import './GarminExportButton.css';

export function DesignFileActions({ scene, grid, revision, disabled, onImport }: DesignDocument & {
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
            setMessage(`Imported ${document.scene.name}. Choose Save design to add it to your library.`);
        } catch (failure) {
            if (controller.signal.aborted) return;
            setError(true);
            setMessage(failure instanceof Error ? failure.message : 'The design could not be imported.');
        } finally {
            if (request.current === controller) { request.current = undefined; setBusy(false); }
        }
    }

    function download() {
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
            setMessage('The design could not be downloaded. Try again.');
        }
    }

    return <div className="design-transfer" aria-label="Design files" aria-busy={busy}>
        <div className="design-transfer-actions" role="group" aria-label="Import or export editable design">
            <button type="button" className="workspace-file-button" disabled={disabled || busy}
                title="Open an editable .deets.json design; Garmin .prg files cannot be imported"
                onClick={() => input.current?.click()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5" />
                </svg>
                {busy ? 'Importing…' : 'Import design'}
            </button>
            <button type="button" className="workspace-file-button" disabled={disabled || busy}
                title="Download an editable .deets.json design to back up or import later" onClick={download}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
                </svg>
                Export design
            </button>
        </div>
        <input ref={input} type="file" accept=".json,application/json" aria-label="Import editable .deets.json design" hidden
            onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
            }} />
        {message && <div className="garmin-export-feedback"><p role={error ? 'alert' : 'status'}>{message}</p></div>}
    </div>;
}
