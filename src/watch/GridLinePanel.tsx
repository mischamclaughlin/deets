import { useRef, useState } from "react";
import { editGridLine, gridLineGap, maxGridLineGap, setGridLineGaps, type GridSettings } from "./grid.ts";
import "./GridLinePanel.css";

interface Props {
    size: number;
    inset: number;
    grid: GridSettings;
    selectedIds: string[];
    onChange: (grid: GridSettings) => void;
    onDelete: () => void;
}

/** Mirrored edges stretch equally around each independent browser-only guide. */
export function GridLinePanel({ size, inset, grid, selectedIds, onChange, onDelete }: Props) {
    const [draft, setDraft] = useState<string>();
    const cancelled = useRef(false);
    const widths = selectedIds.map((id) => gridLineGap(size, inset, grid, id));
    const width = widths.every((value) => value === widths[0]) ? widths[0] : undefined;
    const maximum = maxGridLineGap(size, inset, grid, selectedIds);
    const change = (value: number) => onChange(setGridLineGaps(size, inset, grid, selectedIds, value));
    return <section className="element-box-panel" aria-labelledby="grid-line-heading">
        <h2 id="grid-line-heading">{selectedIds.length === 1 ? "Grid line" : `${selectedIds.length} grid lines`}</h2>
        <p className="control-hint">Mirror creates two lines around the selected line’s position. Stretch moves them equally apart. Drag to move them together.</p>
        <label className="guide-toggle">
            <input type="checkbox" checked={widths.every((value) => value > 0)}
                disabled={maximum === 0}
                onChange={(event) => { setDraft(undefined); change(event.target.checked ? Math.min(8, maximum) : 0); }} />
            Mirror
        </label>
        <div className="control-heading">
            <label htmlFor="grid-gap-width">Stretch</label>
            <label className="grid-gap-value" title="Edit stretch">
                <input type="text" inputMode="numeric" aria-label="Stretch in pixels"
                    size={Math.max(1, String(draft ?? width ?? "Mixed").length)}
                    value={draft ?? width ?? ""} placeholder="Mixed"
                    onFocus={(event) => { cancelled.current = false; event.currentTarget.select(); }}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => {
                        if (!cancelled.current && draft !== undefined && draft.trim() !== "") {
                            const value = Number(draft);
                            if (Number.isSafeInteger(value) && value >= 0) change(value);
                        }
                        cancelled.current = false;
                        setDraft(undefined);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") { cancelled.current = true; setDraft(undefined); event.currentTarget.blur(); }
                    }} />
                {(draft !== undefined || width !== undefined) && <span aria-hidden="true">px</span>}
            </label>
        </div>
        <input id="grid-gap-width" type="range" min={0} max={maximum} step={1} value={width ?? 0}
            onChange={(event) => { setDraft(undefined); change(Number(event.target.value)); }} />
        <button type="button" className="snap-button" onClick={() => {
            onChange(selectedIds.reduce((next, id) => editGridLine(size, inset, next, id, null), grid));
            onDelete();
        }}>Delete {selectedIds.length === 1 ? "line" : "lines"}</button>
    </section>;
}
