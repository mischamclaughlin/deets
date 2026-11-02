import { SliderValue } from "./SliderValue.tsx";
import { DesignFilePanel } from "./DesignFilePanel.tsx";
import { SavedDesignsPage } from "./SavedDesignsPage.tsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { devices, inheritsFont, isClockSource, isDateSource, isEditableTextSource, type Scene } from "../../shared/scene.ts";
import { refreshFonts } from "./api.ts";
import { gridLines } from "./grid.ts";
import { moveSceneElement } from "./snapping.ts";
import { DividerPanel } from "./DividerPanel.tsx";
import { DateDisplayPanel } from "./DateDisplayPanel.tsx";
import { ClockDisplayPanel } from "./ClockDisplayPanel.tsx";
import { LibraryPanel } from "./LibraryPanel.tsx";
import { elementLabel } from "./element-label.ts";
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
import { GridAreaPanel } from "./GridAreaPanel.tsx";
import type { GridArea } from "./grid-area.ts";
import { mergeGridAreas, toggleGridArea } from "./grid-area-selection.ts";
import { GridLinePanel } from "./GridLinePanel.tsx";
import { GridSettingsPanel } from "./GridSettingsPanel.tsx";
import { WatchWorkspace } from "./WatchWorkspace.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { WatchBackgroundPanel } from "./WatchBackgroundPanel.tsx";

import { useEditorHistory } from "./useEditorHistory.ts";
import { selectElement } from "./history.ts";
import { BatchPresetsPanel } from "./BatchPresetsPanel.tsx";
import { BatchBoxPanel } from "./BatchBoxPanel.tsx";

/** Keep scene constraints separate from browser-only guide visibility. */
export function WatchEditor({ initialScene }: { initialScene: Scene }) {
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [page, setPage] = useState<"editor" | "designs">("editor");
    const editor = useRef<HTMLDivElement>(null);
    const { scene, setScene, grid, setGrid, savedDesignId, markSaved, replaceInitialScene, importDocument, revision, canUndo, canRedo, navigate } = useEditorHistory(initialScene);
    const [fontsReady, setFontsReady] = useState(false);
    const [fontError, setFontError] = useState<string>();
    useEffect(() => {
        if (fontsReady) return;
        const controller = new AbortController();
        void refreshFonts(scene, controller.signal).then((mapped) => {
            if (controller.signal.aborted) return;
            replaceInitialScene(mapped.scene);
            setFontsReady(true);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setFontError(failure instanceof Error ? failure.message : "The fonts could not be prepared.");
            setFontsReady(true);
        });
        return () => controller.abort();
    }, [scene, fontsReady, replaceInitialScene]);
    const [sidebarView, setSidebarView] = useState<"elements" | "styles" | "canvas">("elements");
    const [layersOpen, setLayersOpen] = useState(true);
    const [selectionOpen, setSelectionOpen] = useState(true);
    const [showCircumference, setShowCircumference] = useState(true);
    const [showGuideLines, setShowGuideLines] = useState(false);
    const [outlineMode, setOutlineMode] = useState<"all" | "selected" | "off">("selected");
    const [selection, setSelection] = useState<string[]>(initialScene.elements[0] ? [initialScene.elements[0].id] : []);
    const selectedIds = useMemo(() => selection.filter((id) => scene.elements.some((element) => element.id === id)), [selection, scene.elements]);
    const selectedId = selectedIds.length === 1 ? selectedIds[0] : undefined;
    const [snapEnabled, setSnapEnabled] = useState(false);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [snapToGuides, setSnapToGuides] = useState(true);
    const [snapToElements, setSnapToElements] = useState(true);
    const [snapGridToElements, setSnapGridToElements] = useState(true);
    const [gridSelectionEnabled, setGridSelectionEnabled] = useState(true);
    const [selectedGridLineIds, setSelectedGridLines] = useState<string[]>([]);
    const [gridAreaSelection, setGridAreaSelection] = useState<{ areas: GridArea[]; grid: typeof grid; device: string; inset: number }>();
    const setSelectedId = useCallback((id: string | undefined, additive = false) => {
        setSelection((current) => selectElement(current, id, additive));
        setSelectedGridLines([]);
        setGridAreaSelection(undefined);
    }, []);
    const setSelectedGridLineId = useCallback((id: string | undefined, additive = false) => {
        if (!gridSelectionEnabled) return;
        setGridAreaSelection(undefined);
        setSelectedGridLines((current) => id === undefined ? [] : additive
            ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
            : current.includes(id) ? current : [id]);
        setSelection([]);
    }, [gridSelectionEnabled]);
    function clearSelection() {
        setGridAreaSelection(undefined);
        setSelection([]);
        setSelectedGridLines([]);
    }
    const [uploads, setUploads] = useState<UploadedFont[]>([]);
    const rememberFont = (font: UploadedFont) => setUploads((current) => [...current.filter((item) => item.id !== font.id), font]);
    const selected = scene.elements.find((element) => element.id === selectedId);
    const size = devices[scene.device];
    const inset = scene.edgeInset ?? 0;
    const gridIds = new Set(gridLines(size, inset, grid).map((line) => line.id));
    const selectedGridAreas = grid.visible && gridAreaSelection?.grid === grid && gridAreaSelection.device === scene.device
        && gridAreaSelection.inset === inset ? gridAreaSelection.areas : undefined;
    const areaCollection = useMemo(() => mergeGridAreas(size, inset, selectedGridAreas ?? []), [size, inset, selectedGridAreas]);
    function selectGridArea(area: GridArea, additive = false) {
        const areas = toggleGridArea(selectedGridAreas ?? [], area, additive);
        setSelectedId(undefined);
        setGridAreaSelection(areas.length ? { areas, grid, device: scene.device, inset } : undefined);
    }
    const selectedGridLines = gridSelectionEnabled ? selectedGridLineIds.filter((id) => gridIds.has(id)) : [];

    return (
        <div ref={editor} className="watch-editor" data-theme={theme} data-page={page} tabIndex={-1}
            onKeyDown={(event) => {
                const editing = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]");
                if (!editing && (event.metaKey || event.ctrlKey) && !event.altKey &&
                    (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
                    event.preventDefault();
                    if (fontsReady) navigate(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
                    return;
                }
                if (event.key !== "Escape") return;
                if (event.currentTarget.querySelector(":popover-open")) return;
                event.preventDefault();
                clearSelection();
                event.currentTarget.focus({ preventScroll: true });
            }}
            onPointerDown={(event) => {
                if (event.button !== 0 || !(event.target instanceof Element)) return;
                if (event.target.closest("[data-element-id], [data-grid-id], [popover], button, input, select, textarea, label, a, summary, [contenteditable], [role='button']")) return;
                clearSelection();
                event.currentTarget.focus({ preventScroll: true });
            }}>
            <aside className="watch-sidebar" aria-label="Watch face settings">
                <header className="sidebar-header">
                    <div className="brand">
                        <span className="brand-mark" aria-hidden="true">d.</span>
                        <div><h1>deets</h1><p>Watch face studio</p></div>
                        <ThemeToggle theme={theme} onToggle={() => setTheme((current) => current === "light" ? "dark" : "light")} />
                    </div>
                    <DesignFilePanel scene={scene} grid={grid} revision={revision} disabled={!fontsReady || !!fontError}
                        savedDesignId={savedDesignId} onBrowse={() => setPage("designs")}
                        onSaved={markSaved}
                        onImport={(document) => { importDocument(document); clearSelection(); }} />
                    <div className="sidebar-switcher" role="group" aria-label="Sidebar view">
                        {(["elements", "styles", "canvas"] as const).map((view) => (
                            <button key={view} type="button" aria-pressed={sidebarView === view}
                                aria-controls={`sidebar-${view}`} onClick={() => setSidebarView(view)}>
                                {view === "elements" ? "Elements" : view === "styles" ? "Styles" : "Canvas"}
                            </button>
                        ))}
                    </div>
                </header>
                <div className="sidebar-scroll" key={revision} inert={!fontsReady}>
                    {!fontsReady && <p className="typography-status" role="status">Preparing fonts…</p>}
                    {fontError && <>
                        <p className="typography-status" role="alert">{fontError}</p>
                        <button type="button" className="font-upload" onClick={() => {
                            setFontError(undefined);
                            setFontsReady(false);
                        }}>Retry fonts</button>
                    </>}
                    <div id="sidebar-elements" hidden={sidebarView !== "elements"}>
                        <LibraryPanel scene={scene} onSelect={setSelectedId} onSceneChange={setScene} />
                    </div>
                    <div id="sidebar-styles" hidden={sidebarView !== "styles"}>
                        <p className="panel-intro">Set a shared look with fonts and reusable presets.</p>
                        <div className="styles-content">
                            <WatchFontPanel scene={scene} onSceneChange={setScene} uploads={uploads} onUpload={rememberFont} />
                            <TextPresetsPanel scene={scene} onSceneChange={setScene} />
                            <ColourPresetsPanel scene={scene} onSceneChange={setScene} />
                        </div>
                    </div>
                    <div id="sidebar-canvas" className="document-panel" hidden={sidebarView !== "canvas"}>
                        <h2>Canvas settings</h2>
                        <p className="panel-intro">Fine-tune your working area and alignment guides.</p>
                        <WatchBackgroundPanel scene={scene} onSceneChange={setScene} />
                        <div className="canvas-settings-content">
                            <details className="document-group" open>
                                <summary>Circumference</summary>
                                <div className="document-group-content">
                                    <div className="control-heading">
                                        <label htmlFor="edge-inset">Edge clearance</label>
                                        <SliderValue label="Edge clearance" value={inset} min={0} max={size / 2 - 1}
                                            onChange={(value) => setScene((current) => ({ ...current, edgeInset: value }))} />
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
                                </div>
                            </details>
                            <details className="document-group">
                                <summary>Grid</summary>
                                <div className="document-group-content">
                                    <GridSettingsPanel grid={grid} onChange={setGrid} onSelect={setSelectedGridLineId} />
                                </div>
                            </details>
                        </div>
                    </div>
                </div>
                <footer className="sidebar-footer">{size} × {size} px <span>Native canvas</span></footer>
            </aside>
            <WatchWorkspace
                scene={scene}
                editRevision={revision}
                exportDisabled={!fontsReady || !!fontError}
                onToggleSnapping={() => setSnapEnabled((enabled) => !enabled)}
                canvasSettings={{
                    showGrid: grid.visible, onShowGridChange: (visible) => setGrid({ ...grid, visible }),
                    showGuideLines, onShowGuideLinesChange: setShowGuideLines,
                    snapToGrid, onSnapToGridChange: setSnapToGrid,
                    snapToGuides, onSnapToGuidesChange: setSnapToGuides,
                    snapToElements, onSnapToElementsChange: setSnapToElements,
                    snapGridToElements, onSnapGridToElementsChange: setSnapGridToElements,
                    outlineMode, onOutlineModeChange: setOutlineMode,
                }}
                gridSelectionEnabled={gridSelectionEnabled}
                onToggleGridSelection={() => {
                    setGridSelectionEnabled((enabled) => !enabled);
                    setSelectedGridLines([]);
                }}
                showCircumference={showCircumference}
                showGuideLines={showGuideLines}
                outlineMode={outlineMode}
                grid={grid}
                selectedGridLineIds={selectedGridLines}
                selectedGridArea={areaCollection.area}
                selectedGridAreas={selectedGridAreas}
                onSelectGridArea={selectGridArea}
                onSelectGridLine={gridSelectionEnabled ? setSelectedGridLineId : undefined}
                onChangeGrid={gridSelectionEnabled ? setGrid : undefined}
                snapEnabled={snapEnabled}
                snapToGrid={snapToGrid}
                snapToGuides={snapToGuides}
                snapToElements={snapToElements}
                snapGridToElements={snapGridToElements}
                selectedElementId={selectedId}
                selectedElementIds={selectedIds}
                canUndo={canUndo && fontsReady}
                canRedo={canRedo && fontsReady}
                onUndo={() => navigate("undo")}
                onRedo={() => navigate("redo")}
                onSelectElement={setSelectedId}
                onMoveElement={fontsReady ? (id, desired) => setScene((current) => moveSceneElement(current, id, desired, { enabled: false, showGuideLines, grid })) : undefined}
            />
            <aside className="watch-sidebar element-sidebar" aria-label="Element settings">
                <header className="inspector-header"><span className="inspector-dot" aria-hidden="true" />Inspector<span className="inspector-tag">Element</span></header>
                <div className="sidebar-scroll" key={revision} inert={!fontsReady}>
                    <details className="inspector-group" open={layersOpen} onToggle={(event) => setLayersOpen(event.currentTarget.open)}>
                        <summary>Layers<span className="element-count">{scene.elements.length}</span></summary>
                        <div className="inspector-group-content">
                            <ElementsPanel scene={scene} selectedId={selectedId} selectedIds={selectedIds} onSelect={setSelectedId} onSceneChange={setScene} />
                        </div>
                    </details>
                    <details className="inspector-group" open={selectionOpen} onToggle={(event) => setSelectionOpen(event.currentTarget.open)}>
                        <summary>{selectedIds.length > 1 ? "Selected elements" : selectedGridLines.length ? "Selected grid lines" : selectedGridAreas?.length ? "Selected area" : "Selected element"}</summary>
                        <div className="inspector-group-content">
                            {selectedIds.length > 1 && <BatchPresetsPanel key={selectedIds.join("|")} scene={scene} ids={selectedIds} onSceneChange={setScene} />}
                            {selectedIds.length > 1 && <BatchBoxPanel key={`box-${selectedIds.join("|")}`} scene={scene} ids={selectedIds} onSceneChange={setScene} />}
                            {!!selectedGridAreas?.length && <GridAreaPanel scene={scene} area={areaCollection.area} areaCount={selectedGridAreas.length}
                                selectionError={areaCollection.error} onClear={() => setGridAreaSelection(undefined)} onSceneChange={setScene} onSelect={setSelectedId} />}
                            {selectedGridLines.length > 0 && <GridLinePanel key={selectedGridLines.join("|")} size={size} inset={inset} grid={grid}
                                selectedIds={selectedGridLines} onChange={setGrid} onSelect={setSelectedGridLines} onDelete={() => setSelectedGridLineId(undefined)} />}
                            {selected && <ElementActionsPanel key={`actions-${selected.id}`} scene={scene} elementId={selected.id}
                                onSceneChange={setScene} onSelect={setSelectedId} label={elementLabel(scene, selected.id)} />}
                            {selected && <ActivitySettingsPanel scene={scene} elementId={selected.id} onSceneChange={setScene} onSelect={setSelectedId} />}
                            {selected && <ElementBoxPanel key={selected.id}
                                scene={scene} elementId={selected.id} onSceneChange={setScene} />}
                            {selected && isEditableTextSource(selected.source) && (
                                <>
                                    {selected?.source === "divider"
                                        ? <DividerPanel key={`divider-${selectedId}`} scene={scene} elementId={selectedId!} onSceneChange={setScene} />
                                        : isDateSource(selected.source)
                                            ? <DateDisplayPanel key={`date-${selectedId}`} scene={scene} elementId={selectedId!} onSceneChange={setScene} />
                                            : isClockSource(selected.source)
                                                ? <ClockDisplayPanel key={`display-${selectedId}`} scene={scene} elementId={selectedId!} onSceneChange={setScene} />
                                                : null}
                                    {selected?.source !== "secondsRing" && <TypographyPanel key={`typography-${selectedId}-${inheritsFont(selected)}-${selected?.typography?.family ?? scene.fontFamily}-${selected?.textPresetId ?? "custom"}`} scene={scene} elementId={selectedId!} onSceneChange={setScene} uploads={uploads} onUpload={rememberFont} />}
                                </>
                            )}
                            {selected && <ElementColourPanel key={`colours-${selected.id}`} scene={scene} elementId={selected.id} onSceneChange={setScene} />}
                            {selectedIds.length === 0 && selectedGridLines.length === 0 && !selectedGridAreas?.length && <div className="selection-empty"><h2>Make it yours</h2><p>Select an element on the canvas or in the Layers list to adjust its appearance and position.</p></div>}
                        </div>
                    </details>
                </div>
            </aside>
            {page === "designs" && <SavedDesignsPage themeControl={<ThemeToggle theme={theme} onToggle={() => setTheme((current) => current === "light" ? "dark" : "light")} />}
                onBack={() => { setPage("editor"); requestAnimationFrame(() => editor.current?.querySelector<HTMLButtonElement>("[data-browse-designs]")?.focus()); }}
                onOpen={(document, id) => {
                    importDocument({ ...document, savedDesignId: id }); clearSelection(); setPage("editor");
                    requestAnimationFrame(() => editor.current?.focus({ preventScroll: true }));
                }} />}
        </div>
    );
}
