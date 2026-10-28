import { useEffect, useState } from "react";
import type { Scene, TextDefaults } from "../../shared/scene.ts";
import { setTextDefaults } from "./api.ts";
import { typographyControls } from "./typography.ts";

export function TextDefaultsPanel({ scene, onSceneChange }: { scene: Scene; onSceneChange: (scene: Scene) => void }) {
    const [draft, setDraft] = useState<TextDefaults>(scene.textDefaults ?? {
        size: 88, thickness: 0, width: 100, letterSpacing: 1,
    });
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (!dirty) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setBusy(true);
            void setTextDefaults(scene, draft, controller.signal).then((layout) => {
                if (controller.signal.aborted) return;
                onSceneChange(layout.scene);
                setDirty(false);
                setBusy(false);
                setError(undefined);
            }).catch((failure) => {
                if (controller.signal.aborted) return;
                setDirty(false);
                setBusy(false);
                setError(failure instanceof Error ? failure.message : "The text defaults could not be saved.");
            });
        }, 200);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [draft, dirty, scene, onSceneChange]);
    return <section className="typography-panel" aria-labelledby="text-defaults-heading">
        <h2 id="text-defaults-heading">Text defaults</h2>
        {typographyControls.map(({ key, label, min, max, unit }) => <div className="typography-control" key={key}>
            <div className="control-heading">
                <label htmlFor={`default-type-${key}`}>{label}</label>
                <output htmlFor={`default-type-${key}`}>{draft[key]}{unit === "%" ? "%" : ` ${unit}`}</output>
            </div>
            <input id={`default-type-${key}`} type="range" min={min} max={max} step={1} value={draft[key]}
                onChange={(event) => {
                    setDraft({ ...draft, [key]: Number(event.target.value) });
                    setDirty(true);
                    setError(undefined);
                }} />
        </div>)}
        {(busy || error) && <p className="typography-status" role={error ? "alert" : "status"}>
            {error ?? "Saving text defaults…"}
        </p>}
    </section>;
}
