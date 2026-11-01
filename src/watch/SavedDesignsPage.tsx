import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { devices } from '../../shared/scene.ts';
import { prepareDesign, serialiseDesign, type DesignDocument } from './design-file.ts';
import { deleteSavedDesign, listSavedDesigns, type SavedDesign } from './saved-designs.ts';
import { gridLines } from './grid.ts';
import './SavedDesignsPage.css';

function readLibrary(): { designs: SavedDesign[]; error?: string } {
    try { return { designs: listSavedDesigns() }; }
    catch (failure) { return { designs: [], error: failure instanceof Error ? failure.message : 'Saved designs could not be read.' }; }
}

export function SavedDesignsPage({ themeControl, onBack, onOpen }: {
    themeControl: ReactNode;
    onBack: () => void;
    onOpen: (document: DesignDocument, id: string) => void;
}) {
    const [library, setLibrary] = useState(readLibrary);
    const [query, setQuery] = useState('');
    const [opening, setOpening] = useState<string>();
    const [confirmDelete, setConfirmDelete] = useState<string>();
    const [message, setMessage] = useState('');
    const request = useRef<AbortController | undefined>(undefined);
    const heading = useRef<HTMLHeadingElement>(null);
    useLayoutEffect(() => { heading.current?.focus(); }, []);
    useEffect(() => {
        const refresh = () => setLibrary(readLibrary());
        window.addEventListener('storage', refresh);
        return () => { window.removeEventListener('storage', refresh); request.current?.abort(); };
    }, []);
    const matches = library.designs.filter((design) => design.name.toLocaleLowerCase('en-GB').includes(query.trim().toLocaleLowerCase('en-GB')));

    async function open(design: SavedDesign) {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setOpening(design.id);
        setMessage('');
        try {
            const document = await prepareDesign(serialiseDesign(design.document), controller.signal);
            if (!controller.signal.aborted) onOpen(document, design.id);
        } catch (failure) {
            if (!controller.signal.aborted) setLibrary((current) => ({ ...current,
                error: failure instanceof Error ? failure.message : 'The design could not be opened.' }));
        } finally {
            if (request.current === controller) { request.current = undefined; setOpening(undefined); }
        }
    }

    function remove(design: SavedDesign) {
        try {
            deleteSavedDesign(design.id);
            setLibrary(readLibrary());
            setConfirmDelete(undefined);
            setMessage(`Deleted ${design.name}.`);
        } catch (failure) {
            setLibrary((current) => ({ ...current, error: failure instanceof Error ? failure.message : 'The design could not be deleted.' }));
        }
    }

    return <main className="saved-designs-page" data-design-library aria-labelledby="saved-designs-heading"
        onKeyDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <header className="saved-designs-header">
            <div className="brand"><span className="brand-mark" aria-hidden="true">d.</span><div><h1>deets</h1><p>Watch face studio</p></div>
                {themeControl}</div>
            <button type="button" onClick={() => { request.current?.abort(); onBack(); }}>Back to editor</button>
        </header>
        <div className="saved-designs-content">
            <div className="saved-designs-intro"><div><p className="saved-designs-eyebrow">YOUR LIBRARY</p>
                <h2 id="saved-designs-heading" ref={heading} tabIndex={-1}>Saved designs</h2>
                <p>Saved in this browser. Pick a design to keep working.</p></div>
                <span className="saved-designs-count">{library.designs.length} {library.designs.length === 1 ? 'design' : 'designs'}</span>
            </div>
            <label className="saved-designs-search"><span>Search designs</span><input type="search" placeholder="Find a design…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            {library.error && <div className="saved-designs-feedback" role="alert"><p>{library.error}</p><button type="button" onClick={() => setLibrary(readLibrary())}>Retry</button></div>}
            {message && <p className="saved-designs-feedback" role="status">{message}</p>}
            {matches.length > 0 ? <ul className="saved-designs-grid" aria-label="Saved designs">
                {matches.map((design) => {
                    const scene = design.document.scene;
                    const guideCount = gridLines(devices[scene.device], scene.edgeInset ?? 0, { ...design.document.grid, visible: true }).length;
                    return <li key={design.id} className="saved-design-card" aria-busy={opening === design.id}>
                        <div className="saved-design-card-top"><span className="saved-design-device">{devices[scene.device]} × {devices[scene.device]} px</span><span className="saved-design-card-mark" aria-hidden="true">d.</span></div>
                        <h3>{design.name}</h3>
                        <p>{scene.elements.length} {scene.elements.length === 1 ? 'element' : 'elements'} · {guideCount} {guideCount === 1 ? 'guide' : 'guides'}</p>
                        <time dateTime={design.updatedAt}>Saved {new Date(design.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                        {confirmDelete === design.id ? <div className="saved-design-delete-confirm"><p>Delete this saved design?</p><div className="saved-design-card-actions">
                            <button type="button" className="design-danger" disabled={!!opening} onClick={() => remove(design)}>Delete</button>
                            <button type="button" onClick={() => setConfirmDelete(undefined)}>Keep design</button></div></div>
                            : <div className="saved-design-card-actions"><button type="button" className="design-primary" disabled={!!opening} onClick={() => void open(design)} aria-label={`Open ${design.name}`}>{opening === design.id ? 'Opening…' : 'Open design'}</button>
                                <button type="button" disabled={!!opening} onClick={() => setConfirmDelete(design.id)} aria-label={`Delete ${design.name}`}>Delete</button></div>}
                    </li>;
                })}
            </ul> : !library.error && <div className="saved-designs-empty"><span className="saved-design-empty-mark" aria-hidden="true">d.</span>
                <h3>{query.trim() ? 'No matching designs' : 'Your designs belong here'}</h3>
                <p>{query.trim() ? 'Try another name.' : 'Return to the editor and choose Save design to start your collection.'}</p>
                <button type="button" onClick={query.trim() ? () => setQuery('') : onBack}>{query.trim() ? 'Clear search' : 'Back to editor'}</button></div>}
            <p className="saved-designs-note">Designs stay on this browser and device. Clearing browser data removes them. Download a file from the editor to keep a backup.</p>
        </div>
    </main>;
}
