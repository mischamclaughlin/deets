import { useState } from "react";
import { devices, type Scene } from "../../shared/scene.ts";
import { WatchCanvas } from "./WatchCanvas.tsx";

/** Keep scene constraints separate from browser-only guide visibility. */
export function WatchEditor({ initialScene }: { initialScene: Scene }) {
    const [scene, setScene] = useState(initialScene);
    const [showCircumference, setShowCircumference] = useState(true);
    const size = devices[scene.device];
    const inset = scene.edgeInset ?? 0;

    return (
        <div className="watch-editor">
            <aside className="watch-sidebar" aria-label="Watch face settings">
                <h1>deets</h1>
                <section aria-labelledby="circumference-heading">
                    <h2 id="circumference-heading">Circumference</h2>
                    <p>Keep content this far from the edge of the watch.</p>
                    <div className="control-heading">
                        <label htmlFor="edge-inset">Edge clearance</label>
                        <output htmlFor="edge-inset">{inset} px</output>
                    </div>
                    <input
                        id="edge-inset"
                        type="range"
                        min={0}
                        max={size / 2 - 1}
                        step={1}
                        value={inset}
                        onChange={(event) => setScene((current) => ({
                            ...current,
                            edgeInset: Number(event.target.value),
                        }))}
                        aria-describedby="circumference-description"
                    />
                    <p id="circumference-description" className="control-note">
                        Native watch pixels · {size - inset * 2} px usable diameter
                    </p>
                    <label className="guide-toggle">
                        <input
                            type="checkbox"
                            checked={showCircumference}
                            onChange={(event) => setShowCircumference(event.target.checked)}
                        />
                        Show circumference guide
                    </label>
                </section>
            </aside>
            <main className="watch-workspace" aria-label="Watch face canvas">
                <WatchCanvas scene={scene} showCircumference={showCircumference} />
            </main>
        </div>
    );
}
