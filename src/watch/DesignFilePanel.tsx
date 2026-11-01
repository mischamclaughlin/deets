import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { designFilename, maxDesignBytes, prepareDesign, serialiseDesign, type DesignDocument } from './design-file.ts';
import { saveDesign } from './saved-designs.ts';
import './DesignFilePanel.css';

export function DesignFilePanel({ scene, grid, revision, disabled, savedDesignId, onImport, onSaved, onBrowse }: DesignDocument & {
    revision: number;
    disabled: boolean;
    savedDesignId?: string;
    onImport: (document: DesignDocument) => void;
    onSaved: (id: string, name: string) => void;
    onBrowse: () => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const request = useRef<AbortController | undefined>(undefined);
    const current = useRef({ scene, grid, revision });
    useLayoutEffect(() => { current.current = { scene, grid, revision }; }, [scene, grid, revision]);
    useEffect(() => () => request.current?.abort(), []);
    const [busy, setBusy] = useState(false);
    const [naming, setNaming] = useState(false);
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

    return <section className="design-files" aria-label="Design library" aria-busy={busy}>
        <div className="design-file-actions">
            <button type="button" disabled={disabled || busy} onClick={() => setNaming(true)}>Save design</button>
            <button data-browse-designs type="button" disabled={disabled || busy} onClick={onBrowse}>Saved designs</button>
        </div>
        <div className="design-file-actions design-file-secondary">
            <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? 'Importing…' : 'Import file'}</button>
            <button type="button" disabled={disabled || busy} onClick={download}>Download file</button>
        </div>
        <input ref={input} type="file" accept=".json,.deets.json,application/json" aria-label="Import design file" hidden
            onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importFile(file);
            }} />
        <p className="design-file-hint">Saved in this browser.</p>
        {message && <p className="typography-status" role={error ? 'alert' : 'status'}>{message}</p>}
        {naming && <SaveDesignDialog document={{ scene, grid }} savedDesignId={savedDesignId} onDismiss={() => setNaming(false)}
            onSaved={(id, name) => {
                onSaved(id, name);
                setNaming(false);
                setError(false);
                setMessage(`Saved ${name} to your designs.`);
            }} />}
    </section>;
}

function SaveDesignDialog({ document, savedDesignId, onSaved, onDismiss }: {
    document: DesignDocument;
    savedDesignId?: string;
    onSaved: (id: string, name: string) => void;
    onDismiss: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(document.scene.name);
    const [error, setError] = useState<string>();
    useLayoutEffect(() => {
        const target = dialog.current!;
        target.showModal();
        input.current?.focus();
        input.current?.select();
        return () => target.close();
    }, []);
    function save(copy = false) {
        try {
            const saved = saveDesign({ ...document, scene: { ...document.scene, name } }, copy ? undefined : savedDesignId);
            onSaved(saved.id, saved.name);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'The design could not be saved.');
        }
    }
    return <dialog className="design-name-dialog" ref={dialog} aria-labelledby="save-design-heading" aria-describedby="save-design-description"
        onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}
        onCancel={(event) => { event.preventDefault(); onDismiss(); }}>
        <form onSubmit={(event) => { event.preventDefault(); save(); }}>
            <h2 id="save-design-heading">Save design</h2>
            <p id="save-design-description">Keep your watch face and grid together in Saved designs.</p>
            <label htmlFor="saved-design-name">Design name</label>
            <input id="saved-design-name" ref={input} type="text" maxLength={60} required value={name}
                aria-invalid={error ? true : undefined} aria-describedby={error ? 'save-design-error' : undefined}
                onChange={(event) => { setName(event.target.value); setError(undefined); }} />
            <p className="design-file-hint">Saved on this browser and device. Custom fonts need their original local files.</p>
            {error && <p id="save-design-error" className="typography-status" role="alert">{error}</p>}
            <div className="design-name-actions">
                <button type="button" onClick={onDismiss}>Cancel</button>
                {savedDesignId && <button type="button" disabled={!name.trim()} onClick={() => save(true)}>Save a copy</button>}
                <button className="design-primary" type="submit" disabled={!name.trim()}>{savedDesignId ? 'Save changes' : 'Save design'}</button>
            </div>
        </form>
    </dialog>;
}
