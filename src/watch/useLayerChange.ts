import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import { previewWatch } from "./api.ts";

/** Apply layer edits atomically through native validation, preserving newer edits. */
export function useLayerChange(scene: Scene, onSceneChange: (scene: Scene) => void) {
    const latest = useRef(scene);
    const request = useRef<AbortController | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState(false);
    useLayoutEffect(() => { latest.current = scene; }, [scene]);
    useEffect(() => () => request.current?.abort(), []);

    async function apply(next: Scene) {
        if (request.current || next === scene) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setError(false);
        setMessage("Updating layer…");
        try {
            const mapping = await previewWatch(next, false, controller.signal);
            if (controller.signal.aborted) return;
            if (latest.current !== scene) throw new Error("The canvas changed. Try moving the layer again.");
            onSceneChange(mapping.scene);
            setMessage("Layer order updated.");
        } catch (failure) {
            if (!controller.signal.aborted) {
                setError(true);
                setMessage(failure instanceof Error ? failure.message : "The layer could not be moved.");
            }
        } finally {
            if (request.current === controller) { request.current = undefined; setBusy(false); }
        }
    }
    return { apply, busy, message, error };
}
