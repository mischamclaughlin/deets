import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import { addElement } from "./api.ts";
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
    async function add(source: LibrarySource) {
        if (request.current || scene.elements.length >= 40) return;
        const controller = new AbortController();
        request.current = controller;
        const snapshot = scene;
        setAdding(source);
        setError(undefined);
        try {
            const mapped = await addElement(snapshot, source, controller.signal);
            if (controller.signal.aborted) return;
            if (currentScene.current !== snapshot) throw new Error("Your canvas changed while adding. Choose the element again.");
            onSceneChange(mapped.scene);
            onSelect(mapped.scene.elements[mapped.scene.elements.length - 1].id);
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
        <button type="button" className="library-launch-button" onClick={() => { setError(undefined); setAnnouncement(""); setOpen(true); }}
            aria-haspopup="dialog" aria-expanded={open}>
            <span aria-hidden="true">+</span> Add element <span className="library-launch-arrow" aria-hidden="true">↗</span>
        </button>
        <p className="library-announcement" role="status">{announcement || "Time, activity, icons & graphs"}</p>
        {open && <ElementPicker scene={scene} adding={adding} error={error} onAdd={(source) => void add(source)} onDismiss={dismiss} />}
    </section>;
}
