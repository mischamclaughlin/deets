import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ActivityAddOptions, Scene } from "../../shared/scene.ts";
import { addElement, previewWatch } from "./api.ts";
import type { GridArea } from "./grid-area.ts";
import { placeElementsInArea } from "./grid-area-placement.ts";
import { elementName } from "./element-name.ts";
import { ElementPicker } from "./ElementPicker.tsx";
import type { LibrarySource } from "./library-catalogue.ts";
import "./ElementPicker.css";
import "./GridAreaPanel.css";

export function GridAreaPanel({ scene, area, onSceneChange, onSelect }: {
    scene: Scene;
    area: GridArea;
    onSceneChange: (scene: Scene) => void;
    onSelect: (id: string) => void;
}) {
    const heading = useId();
    const [existing, setExisting] = useState("");
    const [open, setOpen] = useState(false);
    const [adding, setAdding] = useState<LibrarySource>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const request = useRef<AbortController | undefined>(undefined);
    const latest = useRef({ scene, area });
    useLayoutEffect(() => { latest.current = { scene, area }; }, [scene, area]);
    useEffect(() => () => request.current?.abort(), []);

    function dismiss() {
        request.current?.abort();
        request.current = undefined;
        setOpen(false);
        setAdding(undefined);
        setBusy(false);
    }
    async function place(source?: LibrarySource, options?: ActivityAddOptions) {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setAdding(source);
        setError(undefined);
        try {
            const next = source ? (await addElement(scene, source, controller.signal, options)).scene : scene;
            const ids = source ? next.elements.filter((element) => !scene.elements.some((item) => item.id === element.id)).map((item) => item.id) : [existing];
            const placed = await previewWatch(placeElementsInArea(next, ids, area.box), false, controller.signal);
            if (controller.signal.aborted) return;
            if (latest.current.scene !== scene || latest.current.area !== area)
                throw new Error("The canvas or grid area changed. Select the area and try again.");
            onSceneChange(placed.scene);
            onSelect(ids[0]);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The element could not be placed.");
        } finally {
            if (request.current === controller) {
                request.current = undefined;
                setBusy(false);
                setAdding(undefined);
            }
        }
    }
    return <section className="grid-area-panel" aria-labelledby={heading} aria-busy={busy}>
        <h2 id={heading}>Selected grid area <span className="section-unit">{area.box.width} × {area.box.height} px</span></h2>
        <p className="control-hint">Use this area as the element’s box. Text size stays unchanged.</p>
        <label className="font-choice">Existing element
            <select value={existing} disabled={busy} onChange={(event) => setExisting(event.target.value)}>
                <option value="">Choose an element…</option>
                {scene.elements.filter((element) => element.source !== "secondsRing").map((element) =>
                    <option key={element.id} value={element.id}>{elementName(scene, element.id)}</option>)}
            </select>
        </label>
        <div className="grid-area-actions">
            <button type="button" disabled={busy || !existing} onClick={() => void place()}>{busy && !adding ? "Placing…" : "Place element"}</button>
            <button type="button" disabled={busy || scene.elements.length >= 40} aria-haspopup="dialog" aria-expanded={open}
                onClick={() => { setError(undefined); setOpen(true); }}>Add from library</button>
        </div>
        {!open && error && <p className="typography-status" role="alert">{error}</p>}
        {open && <ElementPicker scene={scene} adding={adding} error={error} onAdd={(source, options) => void place(source, options)} onDismiss={dismiss} />}
    </section>;
}
