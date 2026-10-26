import { useState } from "react";
import { devices, type Scene } from "../../shared/scene.ts";
import { defaultGrid } from "./grid.ts";
import { moveElement } from "./snapping.ts";
import { TypographyPanel } from "./TypographyPanel.tsx";
import { WatchCanvas } from "./WatchCanvas.tsx";

/** Keep scene constraints separate from browser-only guide visibility. */
export function WatchEditor({ initialScene }: { initialScene: Scene }) {
    const [scene, setScene] = useState(initialScene);
    const [showCircumference, setShowCircumference] = useState(true);
    const [showGuideLines, setShowGuideLines] = useState(false);
    const [selectedId, setSelectedId] = useState(initialScene.elements[0]?.id);
    const [snapEnabled, setSnapEnabled] = useState(false);
    const [grid, setGrid] = useState(defaultGrid);
    const size = devices[scene.device];
    const inset = scene.edgeInset ?? 0;

    return (
        <div className="watch-editor">
            <aside className="watch-sidebar" aria-label="Watch face settings" tabIndex={0}>
                <h1>deets</h1>
                <section aria-labelledby="circumference-heading">
                    <h2 id="circumference-heading">Circumference</h2>
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
                        aria-describedby="canvas-dimensions"
                    />
                    <label className="guide-toggle">
                        <input
                            type="checkbox"
                            checked={showCircumference}
                            onChange={(event) => setShowCircumference(event.target.checked)}
                        />
                        Show circumference guide
                    </label>
                </section>
                <section aria-labelledby="guides-heading">
                    <h2 id="guides-heading">Guides</h2>
                    <label className="guide-toggle">
                        <input
                            type="checkbox"
                            checked={showGuideLines}
                            onChange={(event) => setShowGuideLines(event.target.checked)}
                        />
                        Show guide lines
                    </label>
                </section>
                <section aria-labelledby="grid-heading">
                    <h2 id="grid-heading">Grid</h2>
                    <label className="guide-toggle">
                        <input type="checkbox" checked={grid.visible}
                            onChange={(event) => setGrid((current) => ({ ...current, visible: event.target.checked }))} />
                        Show grid
                    </label>
                    <button
                        type="button"
                        className="snap-button"
                        aria-pressed={snapEnabled}
                        onClick={() => setSnapEnabled((enabled) => !enabled)}
                        title="Drag or use arrow keys. Shift: 10 px. Alt: bypass snapping."
                    >
                        Snap {snapEnabled ? "on" : "off"}
                    </button>
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
                    <div className="grid-counts circumference-controls">
                        <label htmlFor="extra-circumferences">Extra circumferences</label>
                        <div className="circumference-inputs">
                            <select
                                id="extra-circumferences"
                                value={grid.circumferences}
                                onChange={(event) => setGrid((current) => ({ ...current, circumferences: Number(event.target.value) }))}
                                title="Spacing reduces automatically to fit all rings."
                            >
                                {Array.from({ length: 25 }, (_, count) => (
                                    <option key={count} value={count}>{count}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="circumference-direction"
                                aria-label="Start circumferences from inside"
                                aria-pressed={grid.circumferenceStart === "inside"}
                                onClick={() => setGrid((current) => ({
                                    ...current,
                                    circumferenceStart: current.circumferenceStart === "inside" ? "outside" : "inside",
                                }))}
                            >
                                {grid.circumferenceStart === "inside" ? "in" : "out"}
                            </button>
                        </div>
                    </div>
                    <div className="control-heading">
                        <label htmlFor="circumference-spacing">Ring spacing</label>
                        <output htmlFor="circumference-spacing">{grid.circumferenceSpacing} px</output>
                    </div>
                    <input id="circumference-spacing" type="range" min={1} max={100} step={1}
                        value={grid.circumferenceSpacing}
                        onChange={(event) => setGrid((current) => ({ ...current, circumferenceSpacing: Number(event.target.value) }))}
                        title="Spacing reduces automatically to fit all rings." />
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
                </section>
            </aside>
            <main className="watch-workspace" aria-label="Watch face canvas">
                <div className="watch-stage">
                    <WatchCanvas
                        scene={scene}
                        showCircumference={showCircumference}
                        showGuideLines={showGuideLines}
                        grid={grid}
                        snapEnabled={snapEnabled}
                        onSelectElement={setSelectedId}
                        onMoveElement={(id, desired) => setScene((current) => ({
                            ...current,
                            elements: current.elements.map((element) => element.id === id
                                ? { ...element, ...moveElement(current, element, desired, { enabled: false, showGuideLines, showCircumference, grid }) }
                                : element),
                        }))}
                    />
                </div>
                <p className="canvas-info" id="canvas-dimensions">
                    Native watch pixels · {size - inset * 2} px usable diameter
                </p>
            </main>
            <aside className="watch-sidebar element-sidebar" aria-label="Element settings" tabIndex={0}>
                {scene.elements.some((element) => element.id === selectedId && element.source === "time") && (
                    <TypographyPanel key={selectedId} scene={scene} elementId={selectedId!} onSceneChange={setScene} />
                )}
            </aside>
        </div>
    );
}
