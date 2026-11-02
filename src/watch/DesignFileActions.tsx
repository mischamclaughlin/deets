import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { maxDesignBytes, prepareDesign, serialiseDesign, type DesignDocument } from './design-file.ts';
import { maxPrgBytes, readPrgDesign } from './prg-design.ts';
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
            const prg = /\.prg$/i.test(file.name);
            if (file.size > (prg ? maxPrgBytes : maxDesignBytes))
                throw new Error(prg ? 'Choose a Garmin file up to 16 MB.' : 'Choose a design file up to 1 MB.');
            const text = prg ? serialiseDesign(await readPrgDesign(new Uint8Array(await file.arrayBuffer()), controller.signal)) : await file.text();
            const document = await prepareDesign(text, controller.signal);
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

    return <div className="design-transfer" aria-label="Design files" aria-busy={busy}>
        <button type="button" className="workspace-file-button" disabled={disabled || busy}
            title="Open a Deets .prg export or an editable .deets.json design"
            onClick={() => input.current?.click()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5" />
            </svg>
            {busy ? 'Importing…' : 'Import design'}
        </button>
        <input ref={input} type="file" accept=".prg,.json,application/json,application/octet-stream" aria-label="Import Deets .prg or .deets.json design" hidden
            onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
            }} />
        {message && <div className="garmin-export-feedback"><p role={error ? 'alert' : 'status'}>{message}</p></div>}
    </div>;
}
