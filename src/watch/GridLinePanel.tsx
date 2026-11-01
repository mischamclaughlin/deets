import { SliderValue } from "./SliderValue.tsx";
import { editGridLine, gridLineGap, maxGridLineGap, setGridLineGaps, setGridLineMirrors, type GridSettings } from "./grid.ts";
import "./GridLinePanel.css";

interface Props {
    size: number;
    inset: number;
    grid: GridSettings;
    selectedIds: string[];
    onChange: (grid: GridSettings) => void;
    onDelete: () => void;
}

/** Stretch stays independent of the selected guide's shaded or mirrored presentation. */
export function GridLinePanel({ size, inset, grid, selectedIds, onChange, onDelete }: Props) {
    const widths = selectedIds.map((id) => gridLineGap(size, inset, grid, id));
    const width = widths.every((value) => value === widths[0]) ? widths[0] : undefined;
    const maximum = maxGridLineGap(size, inset, grid, selectedIds);
    const change = (value: number) => onChange(setGridLineGaps(size, inset, grid, selectedIds, value));
    return <section className="element-box-panel grid-line-panel" aria-labelledby="grid-line-heading">
        <div className="section-heading">
            <h2 id="grid-line-heading">{selectedIds.length === 1 ? "Grid line" : `${selectedIds.length} grid lines`}</h2>
            <label className="guide-toggle">
                <input type="checkbox" checked={selectedIds.every((id) => grid.gapMirrors?.[id] === true)}
                    onChange={(event) => onChange(setGridLineMirrors(grid, selectedIds, event.target.checked))} />
                Mirror
            </label>
        </div>
        <p className="control-hint">Stretch a shaded band, or enable Mirror for two clear edges. Drag to move them together.</p>
        <div className="control-heading">
            <label htmlFor="grid-gap-width">Stretch</label>
            <SliderValue label="Stretch" value={width} min={0} max={maximum} onChange={change} />
        </div>
        <input id="grid-gap-width" type="range" min={0} max={maximum} step={1} value={width ?? 0}
            onChange={(event) => change(Number(event.target.value))} />
        <button type="button" className="snap-button" onClick={() => {
            onChange(selectedIds.reduce((next, id) => editGridLine(size, inset, next, id, null), grid));
            onDelete();
        }}>Delete {selectedIds.length === 1 ? "line" : "lines"}</button>
    </section>;
}
