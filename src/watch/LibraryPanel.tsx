import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ActivityAddOptions, Scene } from "../../shared/scene.ts";
import { importIcon } from "./import-icon.ts";
import { sceneWithIcon } from "./icon-mask.ts";
import { addElement, mapWatch } from "./api.ts";
import { LibraryList } from "./LibraryList.tsx";
import { ElementPicker } from "./ElementPicker.tsx";
import { libraryEntries, type LibrarySource } from "./library-catalogue.ts";
import "./ElementPicker.css";

interface Props {
    scene: Scene;
    onSelect: (id: string) => void;
    onSceneChange: (scene: Scene) => void;
}

export function LibraryPanel({ scene, onSelect, onSceneChange }: Props) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [open, setOpen] = useState(false);
    const [adding, setAdding] = useState<LibrarySource>();
    const [error, setError] = useState<string>();
    const [announcement, setAnnouncement] = useState("");
    const currentScene = useRef(scene);
    const request = useRef<AbortController | undefined>(undefined);
    useLayoutEffect(() => { currentScene.current = scene; }, [scene]);
    useEffect(() => () => request.current?.abort(), []);

    function dismiss() {
        request.current?.abort();
        request.current = undefined;
        setAdding(undefined);
        setOpen(false);
    }
    async function add(source: LibrarySource, options?: ActivityAddOptions) {
        if (request.current || scene.elements.length >= 40) return;
        const controller = new AbortController();
        request.current = controller;
        const snapshot = scene;
        setAdding(source);
        setError(undefined);
        try {
            const mapped = await addElement(snapshot, source, controller.signal, options);
            if (controller.signal.aborted) return;
            if (currentScene.current !== snapshot) throw new Error("Your canvas changed while adding. Choose the element again.");
            onSceneChange(mapped.scene);
            onSelect(mapped.scene.elements[snapshot.elements.length].id);
            setAnnouncement(`${libraryEntries.find((entry) => entry.source === source)!.label} added`);
            dismiss();
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The element could not be added. Try again.");
        } finally {
            if (request.current === controller) {
                request.current = undefined;
                setAdding(undefined);
            }
        }
    }
    async function addIcon(file: File) {
        if (request.current || scene.elements.length >= 40) return;
        const controller = new AbortController();
        request.current = controller;
        const snapshot = scene;
        setImporting(true);
        setError(undefined);
        try {
            const icon = await importIcon(file, controller.signal);
            const id = `icon-${crypto.randomUUID()}`;
            const mapped = await mapWatch(sceneWithIcon(snapshot, icon, id), false, controller.signal);
            if (controller.signal.aborted) return;
            if (currentScene.current !== snapshot) throw new Error("Your canvas changed during import. Import the icon again.");
            onSceneChange(mapped.scene);
            onSelect(id);
            setAnnouncement(`${icon.name} added`);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The icon could not be imported.");
        } finally {
            if (request.current === controller) { request.current = undefined; setImporting(false); }
        }
    }
    return <section className="element-library-launcher" aria-label="Element library">
        <input ref={fileInput} type="file" accept=".png,.svg,image/png,image/svg+xml" hidden aria-label="Choose icon file"
            onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void addIcon(file); }} />
        <div className="compact-library-header"><h2>Library</h2>
            <div className="library-header-actions">
                <button type="button" className="library-browse-button" disabled={importing || adding !== undefined || scene.elements.length >= 40}
                    aria-describedby="icon-import-hint" onClick={() => fileInput.current?.click()}>{importing ? "Importing…" : "Import icon"}</button>
                <button type="button" className="library-browse-button" disabled={importing || adding !== undefined} onClick={() => { setError(undefined); setAnnouncement(""); setOpen(true); }}
                    aria-haspopup="dialog" aria-expanded={open} aria-label="Browse element library">Browse <span aria-hidden="true">↗</span></button>
            </div>
        </div>
        <p id="icon-import-hint" className="icon-import-hint">PNG or SVG · transparent background · single colour</p>
        <LibraryList key={scene.elements.length} onAdd={(source) => void add(source)} adding={adding} remaining={importing ? 0 : Math.max(0, 40-scene.elements.length)} />
        <p className="library-announcement" role="status">{announcement}</p>
        {!open && error && <p className="typography-status" role="alert">{error}</p>}
        {scene.elements.length >= 40 && <p className="library-announcement">All 40 slots are in use. Delete an element to add another.</p>}
        {open && <ElementPicker scene={scene} adding={adding} error={error} onAdd={(source, options) => void add(source, options)} onDismiss={dismiss} />}
    </section>;
}
