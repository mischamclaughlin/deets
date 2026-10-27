import { useEffect, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import { setWatchFont } from "./api.ts";
import { FontPicker, type UploadedFont } from "./FontPicker.tsx";

export function WatchFontPanel({ scene, onSceneChange, uploads, onUpload }: {
    scene: Scene;
    onSceneChange: (scene: Scene) => void;
    uploads: UploadedFont[];
    onUpload: (font: UploadedFont) => void;
}) {
    const [pending, setPending] = useState<string>();
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (pending === undefined) return;
        const controller = new AbortController();
        void setWatchFont(scene, pending, controller.signal).then((layout) => {
            if (controller.signal.aborted) return;
            onSceneChange(layout.scene);
            setPending(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setPending(undefined);
            setError(failure instanceof Error ? failure.message : "The watch font could not be changed.");
        });
        return () => controller.abort();
    }, [pending, scene, onSceneChange]);
    return <section className="typography-panel" aria-labelledby="watch-font-heading">
        <h2 id="watch-font-heading">Watch font</h2>
        <FontPicker family={pending ?? scene.fontFamily ?? "time"} uploads={uploads} onUpload={onUpload}
            disabled={pending !== undefined} onChange={(family) => { setError(undefined); setPending(family); }} />
        <p className="typography-status">Inherited by elements unless they use a custom font. Size and spacing stay independent.</p>
        {(pending !== undefined || error) && <p className="typography-status" role={error ? "alert" : "status"}>
            {error ?? "Updating inherited fonts…"}
        </p>}
    </section>;
}
