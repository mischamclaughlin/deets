import { useLayoutEffect, useRef, useState } from 'react';
import type { DesignDocument } from './design-file.ts';
import { saveDesign } from './saved-designs.ts';
import './DesignFilePanel.css';

export function DesignFilePanel({ scene, grid, disabled, savedDesignId, hasUnsavedChanges, onNew, onSaved, onBrowse }: DesignDocument & {
    disabled: boolean;
    savedDesignId?: string;
    hasUnsavedChanges: boolean;
    onNew: () => void;
    onSaved: (id: string, name: string) => void;
    onBrowse: () => void;
}) {
    const [naming, setNaming] = useState(false);
    const [confirmingNew, setConfirmingNew] = useState(false);
    const [message, setMessage] = useState('');
    return <section className="design-files" aria-label="Design library">
        <button className="design-new-button" type="button" disabled={disabled} onClick={() => {
            if (hasUnsavedChanges) setConfirmingNew(true);
            else { setMessage(''); onNew(); }
        }}>New design</button>
        <div className="design-file-actions">
            <button type="button" disabled={disabled} onClick={() => setNaming(true)}>Save design</button>
            <button data-browse-designs type="button" disabled={disabled} onClick={onBrowse}>Saved designs</button>
        </div>
        <p className="design-file-hint">Saved in this browser.</p>
        {message && <p className="typography-status" role="status">{message}</p>}
        {confirmingNew && <NewDesignDialog onDismiss={() => setConfirmingNew(false)} onConfirm={() => {
            setConfirmingNew(false);
            setMessage('');
            onNew();
        }} />}
        {naming && <SaveDesignDialog document={{ scene, grid }} savedDesignId={savedDesignId} onDismiss={() => setNaming(false)}
            onSaved={(id, name) => {
                onSaved(id, name);
                setNaming(false);
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

function NewDesignDialog({ onDismiss, onConfirm }: { onDismiss: () => void; onConfirm: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const cancel = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => {
        const target = dialog.current!;
        target.showModal();
        cancel.current?.focus();
        return () => target.close();
    }, []);
    return <dialog className="design-name-dialog" ref={dialog} aria-labelledby="new-design-heading" aria-describedby="new-design-description"
        onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}
        onCancel={(event) => { event.preventDefault(); onDismiss(); }}>
        <h2 id="new-design-heading">Start a new design?</h2>
        <p id="new-design-description">You have unsaved changes. Starting a new design will discard them.</p>
        <div className="design-name-actions">
            <button ref={cancel} type="button" onClick={onDismiss}>Keep editing</button>
            <button className="element-action-danger" type="button" onClick={onConfirm}>Discard and create</button>
        </div>
    </dialog>;
}
