import { useId } from "react";
import { WorkspaceIcon } from "./WorkspaceIcon.tsx";
import "./CanvasSettingsMenu.css";

type Props = {
    disabled: boolean;
    showGrid: boolean;
    onShowGridChange: (value: boolean) => void;
    showGuideLines: boolean;
    onShowGuideLinesChange: (value: boolean) => void;
    snapToGrid: boolean;
    onSnapToGridChange: (value: boolean) => void;
    snapToGuides: boolean;
    onSnapToGuidesChange: (value: boolean) => void;
    snapToElements: boolean;
    onSnapToElementsChange: (value: boolean) => void;
    snapGridToElements: boolean;
    onSnapGridToElementsChange: (value: boolean) => void;
    outlineMode: "all" | "selected" | "off";
    onOutlineModeChange: (value: "all" | "selected" | "off") => void;
};

/** Native popovers provide outside-click dismissal, Escape and focus restoration. */
export function CanvasSettingsMenu(props: Props) {
    const id = useId();
    const headingId = useId();
    return <>
        <button type="button" className="workspace-snap canvas-settings-trigger" disabled={props.disabled}
            popoverTarget={id} aria-haspopup="dialog" title="Guides and snapping settings">
            <WorkspaceIcon kind="settings" />Canvas options
        </button>
        {!props.disabled && <div id={id} popover="auto" role="dialog" aria-labelledby={headingId} className="canvas-settings-menu">
            <header className="canvas-settings-heading">
                <h3 id={headingId}>Guides and snapping</h3>
                <button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close canvas options">×</button>
            </header>
            <fieldset>
                <legend>Visibility</legend>
                <label><input type="checkbox" checked={props.showGrid}
                    onChange={(event) => props.onShowGridChange(event.target.checked)} />Show grid</label>
                <label><input type="checkbox" checked={props.showGuideLines}
                    onChange={(event) => props.onShowGuideLinesChange(event.target.checked)} />Show guide lines</label>
                <label className="canvas-outline-choice">Element outlines
                    <select value={props.outlineMode} onChange={(event) => props.onOutlineModeChange(event.target.value as Props["outlineMode"])}>
                        <option value="all">Always show all</option>
                        <option value="selected">Selected element only</option>
                        <option value="off">Off</option>
                    </select>
                </label>
            </fieldset>
            <fieldset>
                <legend>Snap to</legend>
                {[
                    { label: "Grid", checked: props.snapToGrid, change: props.onSnapToGridChange },
                    { label: "Guide lines", checked: props.snapToGuides, change: props.onSnapToGuidesChange },
                    { label: "Elements", checked: props.snapToElements, change: props.onSnapToElementsChange },
                ].map(({ label, checked, change }) => <label key={label}>
                    <input type="checkbox" checked={checked} onChange={(event) => change(event.target.checked)} />{label}
                </label>)}
            </fieldset>
            <div className="canvas-settings-extra">
                <label><input type="checkbox" checked={props.snapGridToElements}
                    onChange={(event) => props.onSnapGridToElementsChange(event.target.checked)} />Snap grid lines to elements</label>
                <p>Hold <kbd>Alt</kbd> to bypass snapping.</p>
            </div>
        </div>}
    </>;
}
