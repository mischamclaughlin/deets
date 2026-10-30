import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ActivityAddOptions, Scene } from "../../shared/scene.ts";
import { addElement } from "./api.ts";
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
    return <section className="element-library-launcher" aria-label="Element library">
        <div className="compact-library-header"><h2>Library</h2>
            <button type="button" className="library-browse-button" disabled={adding !== undefined} onClick={() => { setError(undefined); setAnnouncement(""); setOpen(true); }}
                aria-haspopup="dialog" aria-expanded={open} aria-label="Browse element library">Browse <span aria-hidden="true">↗</span></button>
        </div>
        <LibraryList key={scene.elements.length} onAdd={(source) => void add(source)} adding={adding} remaining={Math.max(0, 40-scene.elements.length)} />
        <p className="library-announcement" role="status">{announcement}</p>
        {!open && error && <p className="typography-status" role="alert">{error}</p>}
        {scene.elements.length >= 40 && <p className="library-announcement">All 40 slots are in use. Delete an element to add another.</p>}
        {open && <ElementPicker scene={scene} adding={adding} error={error} onAdd={(source, options) => void add(source, options)} onDismiss={dismiss} />}
    </section>;
}
