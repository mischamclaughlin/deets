import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ActivityAddOptions, Scene } from "../../shared/scene.ts";
import { ActivityOptions } from "./ActivityOptions.tsx";
import { ElementPreview } from "./ElementPreview.tsx";
import { activityParts, matchingEntries, type LibraryEntry, type LibraryCategory, type LibrarySource } from "./library-catalogue.ts";

export function ElementPicker({ scene, adding, error, onAdd, onDismiss }: {
    scene: Scene;
    adding?: LibrarySource;
    error?: string;
    onAdd: (source: LibrarySource, options?: ActivityAddOptions) => void;
    onDismiss: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const [category, setCategory] = useState<LibraryCategory>("all");
    const [query, setQuery] = useState("");
    const entries = matchingEntries(category, query);
    const remaining = Math.max(0, 40 - scene.elements.length);
    useLayoutEffect(() => {
        const target = dialog.current!;
        target.showModal();
        search.current?.focus();
        return () => target.close();
    }, []);
    function dismiss() {
        dialog.current?.close();
        onDismiss();
    }
    return createPortal(<dialog ref={dialog} className="element-picker" aria-labelledby="element-picker-title"
        aria-describedby="element-picker-description"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") { event.preventDefault(); dismiss(); }
        }} onCancel={(event) => { event.preventDefault(); dismiss(); }}
        onClick={(event) => {
            if (event.target !== dialog.current) return;
            const bounds = dialog.current.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
        }}>
        <header className="picker-header">
            <div><p className="picker-eyebrow">ELEMENT LIBRARY</p><h2 id="element-picker-title">Add to your watch</h2></div>
            <button className="picker-close" type="button" aria-label="Close element library" onClick={dismiss}>×</button>
        </header>
        <p id="element-picker-description" className="picker-description">Choose your data, then include its icon or weekly graph if you need them.</p>
        <div className="picker-controls">
            <label className="picker-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
                <input ref={search} type="search" aria-label="Search elements" placeholder="Search elements…" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="picker-filters" role="group" aria-label="Filter elements">
                {([['all', 'All'], ['clock', 'Clock & date'], ['activity', 'Activity']] as const).map(([value, label]) =>
                    <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</button>)}
            </div>
        </div>
        <div className="picker-results">
            {entries.length > 0 ? <div className="picker-grid">
                {entries.map((entry) => activityParts[entry.source] ? <ActivityCard key={entry.source} scene={scene} entry={entry} adding={adding} remaining={remaining} onAdd={onAdd} /> : <button key={entry.source} type="button" className="picker-card"
                    disabled={adding !== undefined || remaining === 0} onClick={() => onAdd(entry.source)}
                    aria-label={`Add ${entry.label.toLowerCase()}`} aria-describedby={`library-detail-${entry.source}`}>
                    <ElementPreview scene={scene} source={entry.source} />
                    <span className="picker-card-caption"><span><span className="picker-card-title">{adding === entry.source ? "Adding…" : entry.label}</span>
                        <span id={`library-detail-${entry.source}`} className="picker-card-detail">{entry.detail}</span></span><span className="picker-card-plus" aria-hidden="true">+</span></span>
                </button>)}
            </div> : <div className="picker-empty"><h3>No matching elements</h3><p>Try a name such as “steps” or “graph”.</p>
                <button type="button" onClick={() => { setQuery(""); setCategory("all"); }}>Show all elements</button></div>}
        </div>
        <footer className="picker-footer">
            <p className="picker-note">Previews use sample data. Activity values update on your watch.</p>
            <span className="picker-capacity">{remaining === 0 ? "All 40 slots are in use" : `${remaining} of 40 slots available`}</span>
        </footer>
        <div className="picker-feedback" role={error ? "alert" : "status"} aria-live="polite">
            {error ?? (adding ? "Adding your element…" : remaining === 0 ? "Close the library and delete an element to make room." : "")}
        </div>
    </dialog>, document.body);
}

function ActivityCard({ scene, entry, adding, remaining, onAdd }: {
    scene: Scene;
    entry: LibraryEntry;
    adding?: LibrarySource;
    remaining: number;
    onAdd: (source: LibrarySource, options?: ActivityAddOptions) => void;
}) {
    const [options, setOptions] = useState<ActivityAddOptions>({});
    return <article className="picker-card picker-activity-card" aria-label={entry.label}>
        <ElementPreview scene={scene} source={entry.source} options={options} />
        <div className="picker-card-caption"><span><span className="picker-card-title">{entry.label}</span>
            <span className="picker-card-detail">{entry.detail}</span></span></div>
        <ActivityOptions entry={entry} options={options} onChange={setOptions} busy={adding !== undefined} remaining={remaining}
            onAdd={() => onAdd(entry.source, options)} />
    </article>;
}
