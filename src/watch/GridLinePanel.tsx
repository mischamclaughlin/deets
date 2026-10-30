import { useState } from "react";
import { gridLineGap, maxGridLineGap, setGridLineGaps, type GridSettings } from "./grid.ts";

interface Props {
    size: number;
    inset: number;
    grid: GridSettings;
    selectedIds: string[];
    mirror: boolean;
    onChange: (grid: GridSettings) => void;
}

/** Gap widths belong to browser-only guides, independently of the watch scene. */
export function GridLinePanel({ size, inset, grid, selectedIds, mirror, onChange }: Props) {
    const [draft, setDraft] = useState<string>();
    const widths = selectedIds.map((id) => gridLineGap(size, inset, grid, id));
    const width = widths.every((value) => value === widths[0]) ? widths[0] : undefined;
    const maximum = maxGridLineGap(size, inset, grid, selectedIds, mirror);
    const change = (value: number) => onChange(setGridLineGaps(size, inset, grid, selectedIds, value, mirror));
    return <section className="element-box-panel" aria-labelledby="grid-line-heading">
        <h2 id="grid-line-heading">{selectedIds.length === 1 ? "Grid line" : `${selectedIds.length} grid lines`}</h2>
        <p className="control-hint">Shift-click grid lines to select several. A gap splits each line equally around its centre.</p>
        <div className="control-heading">
            <label htmlFor="grid-gap-width">Gap width</label>
            <output htmlFor="grid-gap-width">{width === undefined ? "Mixed" : `${width} px`}</output>
        </div>
        <input id="grid-gap-width" type="range" min={0} max={maximum} step={1} value={width ?? 0}
            onChange={(event) => { setDraft(undefined); change(Number(event.target.value)); }} />
        <label className="font-choice">
            Gap in native pixels
            <input type="number" min={0} max={maximum} step={1} value={draft ?? width ?? ""} placeholder="Mixed"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                    if (draft !== undefined && draft.trim() !== "") {
                        const value = Number(draft);
                        if (Number.isSafeInteger(value) && value >= 0) change(value);
                    }
                    setDraft(undefined);
                }}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        </label>
        <div className="element-box-actions">
            <button type="button" disabled={maximum === 0 || widths.every((value) => value > 0)}
                onClick={() => { setDraft(undefined); change(Math.min(8, maximum)); }}>Add gap</button>
            <button type="button" disabled={widths.every((value) => value === 0)}
                onClick={() => { setDraft(undefined); change(0); }}>Remove gap</button>
        </div>
        {mirror && <p className="control-hint">Mirrored partners receive the same gap.</p>}
    </section>;
}
