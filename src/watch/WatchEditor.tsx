import { useCallback, useEffect, useState } from "react";
import { devices, isClockSource, type Scene } from "../../shared/scene.ts";
import { refreshFonts } from "./api.ts";
import { addGridLine, configureGridRings, defaultGrid, gridLines } from "./grid.ts";
import { moveSceneElement } from "./snapping.ts";
import { DividerPanel } from "./DividerPanel.tsx";
import { ClockDisplayPanel } from "./ClockDisplayPanel.tsx";
import { LibraryPanel } from "./LibraryPanel.tsx";
import { ActivitySettingsPanel } from "./ActivitySettingsPanel.tsx";
import { ElementBoxPanel } from "./ElementBoxPanel.tsx";
import { ElementsPanel } from "./ElementsPanel.tsx";
import { ColourPresetsPanel } from "./ColourPresetsPanel.tsx";
import { ElementColourPanel } from "./ElementColourPanel.tsx";
import { ElementActionsPanel } from "./ElementActionsPanel.tsx";
import { TextPresetsPanel } from "./TextPresetsPanel.tsx";
import { WatchFontPanel } from "./WatchFontPanel.tsx";
import type { UploadedFont } from "./FontPicker.tsx";
import { TypographyPanel } from "./TypographyPanel.tsx";
import { GridLinePanel } from "./GridLinePanel.tsx";
import { WatchCanvas } from "./WatchCanvas.tsx";

/** Keep scene constraints separate from browser-only guide visibility. */
export function WatchEditor({ initialScene }: { initialScene: Scene }) {
    const [scene, setScene] = useState(initialScene);
    const [fontsReady, setFontsReady] = useState(false);
    const [fontError, setFontError] = useState<string>();
    useEffect(() => {
        if (fontsReady) return;
        const controller = new AbortController();
        void refreshFonts(scene, controller.signal).then((mapped) => {
            if (controller.signal.aborted) return;
            setScene(mapped.scene);
            setFontsReady(true);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setFontError(failure instanceof Error ? failure.message : "The fonts could not be prepared.");
            setFontsReady(true);
        });
        return () => controller.abort();
    }, [scene, fontsReady]);
    const [showCircumference, setShowCircumference] = useState(true);
    const [showGuideLines, setShowGuideLines] = useState(false);
    const [outlineMode, setOutlineMode] = useState<"all" | "selected" | "off">("selected");
    const [selectedId, setSelectedElement] = useState<string | undefined>(initialScene.elements[0]?.id);
    const [snapEnabled, setSnapEnabled] = useState(false);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [snapToGuides, setSnapToGuides] = useState(true);
    const [snapToElements, setSnapToElements] = useState(true);
    const [snapGridToElements, setSnapGridToElements] = useState(true);
    const [grid, setGrid] = useState(defaultGrid);
    const [selectedGridLineIds, setSelectedGridLines] = useState<string[]>([]);
    const setSelectedId = useCallback((id: string | undefined) => {
        setSelectedElement(id);
        setSelectedGridLines([]);
    }, []);
    const setSelectedGridLineId = useCallback((id: string | undefined, additive = false) => {
        setSelectedGridLines((current) => id === undefined ? [] : additive
            ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
            : current.includes(id) ? current : [id]);
        setSelectedElement(undefined);
    }, []);
    function clearSelection() {
        setSelectedElement(undefined);
        setSelectedGridLines([]);
    }
    const [uploads, setUploads] = useState<UploadedFont[]>([]);
    const rememberFont = (font: UploadedFont) => setUploads((current) => [...current.filter((item) => item.id !== font.id), font]);
    const selected = scene.elements.find((element) => element.id === selectedId);
    const size = devices[scene.device];
    const inset = scene.edgeInset ?? 0;
    const gridIds = new Set(gridLines(size, inset, grid).map((line) => line.id));
    const selectedGridLines = selectedGridLineIds.filter((id) => gridIds.has(id));

    return (
        <div className="watch-editor" tabIndex={-1}
            onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                clearSelection();
                event.currentTarget.focus({ preventScroll: true });
            }}
            onPointerDown={(event) => {
                if (event.button !== 0 || !(event.target instanceof Element)) return;
                if (event.target.closest("[data-element-id], [data-grid-id], button, input, select, textarea, label, a, summary, [contenteditable], [role='button']")) return;
                clearSelection();
                event.currentTarget.focus({ preventScroll: true });
            }}>
            <aside className="watch-sidebar" aria-label="Watch face settings" tabIndex={0}>
                <h1>deets</h1>
                {!fontsReady && <p className="typography-status" role="status">Preparing fonts…</p>}
                {fontError && <>
                    <p className="typography-status" role="alert">{fontError}</p>
                    <button type="button" className="font-upload" onClick={() => {
                        setFontError(undefined);
                        setFontsReady(false);
                    }}>Retry fonts</button>
                </>}
                <ElementsPanel scene={scene} selectedId={selectedId} onSelect={setSelectedId} />
                <LibraryPanel scene={scene} onSelect={setSelectedId} onSceneChange={setScene} />
                <WatchFontPanel scene={scene} onSceneChange={setScene} uploads={uploads} onUpload={rememberFont} />
                <TextPresetsPanel scene={scene} onSceneChange={setScene} />
                <ColourPresetsPanel scene={scene} onSceneChange={setScene} />
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
                    {[
                        { label: "Grid", checked: snapToGrid, change: setSnapToGrid },
                        { label: "Guide", checked: snapToGuides, change: setSnapToGuides },
                        { label: "Elements", checked: snapToElements, change: setSnapToElements },
                    ].map(({ label, checked, change }) => (
                        <label key={label} className="guide-toggle">
                            <input type="checkbox" checked={checked}
                                onChange={(event) => change(event.target.checked)} />
                            {label}
                        </label>
                    ))}
                    <label className="guide-toggle">
                        <input type="checkbox" checked={snapGridToElements}
                            onChange={(event) => setSnapGridToElements(event.target.checked)} />
                        Snap grid lines to elements
                    </label>
                    <p className="control-hint">Hold Alt to move freely while snapping is on.</p>
                    <label className="font-choice">
                        Element outlines
                        <select value={outlineMode} onChange={(event) => setOutlineMode(event.target.value as typeof outlineMode)}>
                            <option value="all">Always show all</option>
                            <option value="selected">Selected element only</option>
                            <option value="off">Off</option>
                        </select>
                    </label>
                    <div className="element-box-actions">
                        {(["rows", "columns"] as const).map((axis) => (
                            <button key={axis} type="button" disabled={Object.keys(grid.edits ?? {}).length >= 256}
                                onClick={() => {
                                    const added = addGridLine(grid, axis);
                                    setGrid(added.grid);
                                    setSelectedGridLineId(added.id);
                                }}>+ {axis === "rows" ? "Horizontal" : "Vertical"}</button>
                        ))}
                    </div>
                    <div className="grid-counts circumference-controls">
                        <label htmlFor="extra-circumferences">Extra circumferences</label>
                        <div className="circumference-inputs">
                            <select
                                id="extra-circumferences"
                                value={grid.circumferences}
                                onChange={(event) => setGrid((current) => configureGridRings(current, { circumferences: Number(event.target.value) }))}
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
                                onClick={() => setGrid((current) => configureGridRings(current, {
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
                        onChange={(event) => setGrid((current) => configureGridRings(current, { circumferenceSpacing: Number(event.target.value) }))}
                        title="Spacing reduces automatically to fit all rings." />
                    <label className="guide-toggle">
                        <input type="checkbox" checked={grid.curvedRows}
                            onChange={(event) => setGrid((current) => ({ ...current, curvedRows: event.target.checked }))} />
                        Horizontal lines follow radius
                    </label>
                    <label className="guide-toggle">
                        <input type="checkbox" checked={grid.curvedColumns}
                            onChange={(event) => setGrid((current) => ({ ...current, curvedColumns: event.target.checked }))} />
                        Vertical lines follow radius
                    </label>
                </section>
            </aside>
            <main className="watch-workspace" aria-label="Watch face canvas">
                <div className="watch-stage">
                    <WatchCanvas
                        scene={scene}
                        showCircumference={showCircumference}
                        showGuideLines={showGuideLines}
                        outlineMode={outlineMode}
                        grid={grid}
                        selectedGridLineIds={selectedGridLines}
                        onSelectGridLine={setSelectedGridLineId}
                        onChangeGrid={setGrid}
                        snapEnabled={snapEnabled}
                        snapToGrid={snapToGrid}
                        snapToGuides={snapToGuides}
                        snapToElements={snapToElements}
                        snapGridToElements={snapGridToElements}
                        selectedElementId={selectedId}
                        onSelectElement={setSelectedId}
                        onMoveElement={(id, desired) => setScene((current) => moveSceneElement(current, id, desired, { enabled: false, showGuideLines, grid }))}
                    />
                </div>
                <p className="canvas-info" id="canvas-dimensions">
                    Native watch pixels · {size - inset * 2} px usable diameter
                </p>
            </main>
            <aside className="watch-sidebar element-sidebar" aria-label="Element settings" tabIndex={0}>
                {selectedGridLines.length > 0 && <GridLinePanel key={selectedGridLines.join("|")} size={size} inset={inset} grid={grid}
                    selectedIds={selectedGridLines} onChange={setGrid} onDelete={() => setSelectedGridLineId(undefined)} />}
                {selected && <ElementActionsPanel key={`actions-${selected.id}`} scene={scene} elementId={selected.id}
                    onSceneChange={setScene} onSelect={setSelectedId} />}
                {selected && <ActivitySettingsPanel scene={scene} elementId={selected.id} onSceneChange={setScene} onSelect={setSelectedId} />}
                {selected && <ElementBoxPanel key={selected.id}
                    scene={scene} elementId={selected.id} onSceneChange={setScene} />}
                {selected && <ElementColourPanel key={`colours-${selected.id}`} scene={scene} elementId={selected.id} onSceneChange={setScene} />}
                {scene.elements.some((element) => element.id === selectedId && (isClockSource(element.source) || element.source === "divider")) && (
                    <>
                        {selected?.source === "divider"
                            ? <DividerPanel key={`divider-${selectedId}`} scene={scene} elementId={selectedId!} onSceneChange={setScene} />
                            : <ClockDisplayPanel key={`display-${selectedId}`} scene={scene} elementId={selectedId!} onSceneChange={setScene} />}
                        {selected?.source !== "secondsRing" && <TypographyPanel key={`typography-${selectedId}-${selected?.inheritFont ?? !selected?.typography}-${selected?.typography?.family ?? scene.fontFamily}-${selected?.textPresetId ?? "custom"}`} scene={scene} elementId={selectedId!} onSceneChange={setScene} uploads={uploads} onUpload={rememberFont} />}
                    </>
                )}
            </aside>
        </div>
    );
}
