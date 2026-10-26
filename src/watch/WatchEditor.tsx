import { useState } from "react";
import { devices, type Scene } from "../../shared/scene.ts";
import { defaultGrid } from "./grid.ts";
import { WatchCanvas } from "./WatchCanvas.tsx";

/** Keep scene constraints separate from browser-only guide visibility. */
export function WatchEditor({ initialScene }: { initialScene: Scene }) {
    const [scene, setScene] = useState(initialScene);
    const [showCircumference, setShowCircumference] = useState(true);
    const [grid, setGrid] = useState(defaultGrid);
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
                <section aria-labelledby="grid-heading">
                    <h2 id="grid-heading">Grid</h2>
                    <label className="guide-toggle">
                        <input type="checkbox" checked={grid.visible}
                            onChange={(event) => setGrid((current) => ({ ...current, visible: event.target.checked }))} />
                        Show grid
                    </label>
                    <div className="grid-counts">
                        {(["rows", "columns"] as const).map((axis) => (
                            <label key={axis}>
                                {axis === "rows" ? "Rows" : "Columns"}
                                <select value={grid[axis]}
                                    onChange={(event) => setGrid((current) => ({ ...current, [axis]: Number(event.target.value) }))}>
                                    {Array.from({ length: 24 }, (_, index) => (
                                        <option key={index + 1} value={index + 1}>{index + 1}</option>
                                    ))}
                                </select>
                            </label>
                        ))}
                    </div>
                    <div className="grid-counts">
                        <label>
                            Extra circumferences
                            <select value={grid.circumferences}
                                onChange={(event) => setGrid((current) => ({ ...current, circumferences: Number(event.target.value) }))}
                                aria-describedby="grid-circumferences-note">
                                {Array.from({ length: 25 }, (_, count) => (
                                    <option key={count} value={count}>{count}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div className="grid-counts">
                        <label>
                            Start from
                            <select value={grid.circumferenceStart}
                                onChange={(event) => setGrid((current) => ({
                                    ...current,
                                    circumferenceStart: event.target.value === "inside" ? "inside" : "outside",
                                }))}>
                                <option value="inside">Inside · centre</option>
                                <option value="outside">Outside · boundary</option>
                            </select>
                        </label>
                    </div>
                    <div className="control-heading">
                        <label htmlFor="circumference-spacing">Ring spacing</label>
                        <output htmlFor="circumference-spacing">{grid.circumferenceSpacing} px</output>
                    </div>
                    <input id="circumference-spacing" type="range" min={1} max={100} step={1}
                        value={grid.circumferenceSpacing}
                        onChange={(event) => setGrid((current) => ({ ...current, circumferenceSpacing: Number(event.target.value) }))}
                        aria-describedby="grid-circumferences-note" />
                    <p id="grid-circumferences-note" className="control-note">
                        {grid.circumferenceStart === "inside" ? "From the centre outwards." : "From the boundary inwards."} Spacing reduces automatically if needed to fit every ring.
                    </p>
                    <label className="guide-toggle">
                        <input type="checkbox" checked={grid.curvedRows}
                            onChange={(event) => setGrid((current) => ({ ...current, curvedRows: event.target.checked }))} />
                        Rows follow radius
                    </label>
                    <label className="guide-toggle">
                        <input type="checkbox" checked={grid.curvedColumns}
                            onChange={(event) => setGrid((current) => ({ ...current, curvedColumns: event.target.checked }))} />
                        Columns follow radius
                    </label>
                    <p className="grid-note">Curve rows and columns towards the circumference, or keep them straight. Guides only.</p>
                </section>
            </aside>
            <main className="watch-workspace" aria-label="Watch face canvas">
                <WatchCanvas scene={scene} showCircumference={showCircumference} grid={grid} />
            </main>
        </div>
    );
}
