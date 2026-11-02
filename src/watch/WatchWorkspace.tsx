import { useState, type ComponentProps } from "react";
import { devices } from "../../shared/scene.ts";
import { elementLabel } from "./element-label.ts";
import { WatchCanvas } from "./WatchCanvas.tsx";
import { WorkspaceIcon } from "./WorkspaceIcon.tsx";
import { WatchDeviceFrame } from "./WatchDeviceFrame.tsx";
import { GarminExportButton } from "./GarminExportButton.tsx";
import { CanvasSettingsMenu } from "./CanvasSettingsMenu.tsx";
import "./workspace.css";

type Props = ComponentProps<typeof WatchCanvas> & {
    onToggleSnapping: () => void;
    gridSelectionEnabled: boolean;
    onToggleGridSelection: () => void;
    canvasSettings: Omit<ComponentProps<typeof CanvasSettingsMenu>, "disabled">;
    exportDisabled?: boolean;
    editRevision?: number;
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
};

/** Viewing options stay outside the typed scene and Garmin export protocol. */
export function WatchWorkspace({ scene, onToggleSnapping, gridSelectionEnabled, onToggleGridSelection, canvasSettings, exportDisabled, editRevision, canUndo, canRedo, onUndo, onRedo, ...canvasProps }: Props) {
    const [preview, setPreview] = useState(false);
    const [night, setNight] = useState(false);
    const size = devices[scene.device];
    const selected = scene.elements.find((element) => element.id === canvasProps.selectedElementId);
    const usable = size - (scene.edgeInset ?? 0) * 2;

    return <main className="watch-workspace" aria-label="Watch face canvas" data-preview={preview}>
        <header className="workspace-header">
            <div className="workspace-title">
                <span className="workspace-eyebrow">DESIGN STUDIO</span>
                <h2>Watch face <span className="workspace-title-dot" aria-hidden="true" /></h2>
            </div>
            <div className="workspace-header-actions">
                <div className="workspace-segment" role="group" aria-label="Edit history">
                    <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (⌘/Ctrl+Z)" aria-keyshortcuts="Meta+Z Control+Z">Undo</button>
                    <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (⌘/Ctrl+Shift+Z)" aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y">Redo</button>
                </div>
                <span className="canvas-badge">{size} × {size}<span>px</span></span>
                <GarminExportButton scene={scene} disabled={exportDisabled} />
            </div>
        </header>
        <div className="workspace-toolbar" role="group" aria-label="Canvas view">
            <div className="workspace-segment" role="group" aria-label="Canvas mode">
                <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
                    <WorkspaceIcon kind="edit" />Edit
                </button>
                <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
                    <WorkspaceIcon kind="preview" />Preview
                </button>
            </div>
            <div className="workspace-segment appearance-switch" role="group" aria-label="Preview appearance">
                <button type="button" aria-pressed={!night} onClick={() => setNight(false)}>
                    <WorkspaceIcon kind="sun" />Day
                </button>
                <button type="button" aria-pressed={night} onClick={() => setNight(true)}>
                    <WorkspaceIcon kind="moon" />Night
                </button>
            </div>
        </div>
        <div className="watch-stage">
            <WatchDeviceFrame device={scene.device} active={preview}>
            <WatchCanvas key={editRevision} {...canvasProps} scene={scene} night={night}
                showAreas={!preview}
                showCircumference={!preview && canvasProps.showCircumference}
                showGuideLines={!preview && canvasProps.showGuideLines}
                grid={preview && canvasProps.grid ? { ...canvasProps.grid, visible: false } : canvasProps.grid} />
            </WatchDeviceFrame>
        </div>
        <footer className="workspace-footer">
            <div className="canvas-context">
                <div className="canvas-selection">
                    <span className="context-dot" aria-hidden="true" />
                    {preview ? `${night ? "Night" : "Day"} preview` : (canvasProps.selectedElementIds?.length ?? 0) > 1 ? `${canvasProps.selectedElementIds!.length} elements selected` : selected ? elementLabel(scene, selected.id) : "Select an element"}
                    {!preview && selected && <span className="selection-position">X {selected.x} · Y {selected.y}</span>}
                </div>
                <div className="canvas-edit-controls" role="group" aria-label="Canvas editing">
                    <button type="button" className="workspace-snap" aria-pressed={canvasProps.snapEnabled ?? false}
                        disabled={preview} onClick={onToggleSnapping} title="Toggle snapping while editing">
                        <WorkspaceIcon kind="snap" />Snap <span>{canvasProps.snapEnabled ? "on" : "off"}</span>
                    </button>
                    <button type="button" className="workspace-snap" aria-label="Select grid lines" aria-pressed={gridSelectionEnabled}
                        disabled={preview} onClick={onToggleGridSelection}
                        title="Select grid lines. Turn off to select elements through them; guides remain visible and available for snapping.">
                        <WorkspaceIcon kind="grid-select" />Grid selection <span>{gridSelectionEnabled ? "on" : "off"}</span>
                    </button>
                    <CanvasSettingsMenu {...canvasSettings} disabled={preview} />
                </div>
            </div>
            <div className="canvas-info" id="canvas-dimensions">
                <span>{usable} px usable diameter</span>
                <span className="canvas-view-note">{preview ? "Guides hidden · Preview only" : "Native-pixel canvas"}</span>
            </div>
            <p className="canvas-shortcuts">{preview ? "Return to Edit to select and move elements" : <><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> Move <span>·</span> <kbd>Shift</kbd> 10 px <span>·</span> <kbd>Alt</kbd> Bypass snapping</>}</p>
        </footer>
    </main>;
}
