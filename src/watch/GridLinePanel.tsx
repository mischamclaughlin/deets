import { SliderValue } from "./SliderValue.tsx";
import { editGridLine, gridLineGap, maxGridLineGap, setGridLineGaps, setGridLineMirrors, type GridSettings } from "./grid.ts";
import { copyGridLines, gridLineDetails } from "./grid-details.ts";
import "./GridLinePanel.css";

interface Props {
    size: number;
    inset: number;
    grid: GridSettings;
    selectedIds: string[];
    onChange: (grid: GridSettings) => void;
    onDelete: () => void;
    onSelect?: (ids: string[]) => void;
}

/** Stretch stays independent of the selected guide's shaded or mirrored presentation. */
export function GridLinePanel({ size, inset, grid, selectedIds, onChange, onDelete, onSelect }: Props) {
    const widths = selectedIds.map((id) => gridLineGap(size, inset, grid, id));
    const width = widths.every((value) => value === widths[0]) ? widths[0] : undefined;
    const maximum = maxGridLineGap(size, inset, grid, selectedIds);
    const change = (value: number) => onChange(setGridLineGaps(size, inset, grid, selectedIds, value));
    const details = gridLineDetails(size, inset, grid, selectedIds);
    const hasCopyCapacity = (lines: typeof details) => Object.keys(grid.edits ?? {}).length + lines.length <= 256 &&
        Object.keys(grid.gaps ?? {}).length + lines.filter((line) => line.width > 0).length <= 256 &&
        Object.keys(grid.gapMirrors ?? {}).length + lines.filter((line) => grid.gapMirrors?.[line.id]).length <= 256;
    const copyDisabled = !hasCopyCapacity(details);
    const mirrorLines = details.filter((line) => line.axis !== 'rings');
    const mirrorCopyDisabled = !mirrorLines.length || !hasCopyCapacity(mirrorLines);
    const pixels = (value: number) => `${Number(value.toFixed(2))} px`;
    return <section className="element-box-panel grid-line-panel" aria-labelledby="grid-line-heading">
        <div className="section-heading">
            <h2 id="grid-line-heading">{selectedIds.length === 1 ? "Grid line" : `${selectedIds.length} grid lines`}</h2>
            <label className="guide-toggle">
                <input type="checkbox" checked={selectedIds.every((id) => grid.gapMirrors?.[id] === true)}
                    onChange={(event) => onChange(setGridLineMirrors(grid, selectedIds, event.target.checked))} />
                Mirror
            </label>
        </div>
        <div className="grid-line-details">
            {details.map((line) => <div key={line.id} className="grid-line-detail" data-grid-id={line.id}>
                <h3>{line.label} <span>{line.id}</span></h3>
                <dl>
                    <div><dt>{line.axis === 'rings' ? 'Radius' : `${line.axis === 'rows' ? 'Y' : 'X'}${line.curved ? ' at centre' : ''}`}</dt><dd>{pixels(line.coordinate)}</dd></div>
                    {line.axis === 'rings'
                        ? <><div><dt>Centre X / Y</dt><dd>{pixels(size / 2)} / {pixels(size / 2)}</dd></div>
                            <div><dt>Diameter</dt><dd>{pixels(line.coordinate * 2)}</dd></div></>
                        : <div><dt>Offset from centre</dt><dd>{line.offset > 0 ? '+' : ''}{pixels(line.offset)}</dd></div>}
                    {line.edges.length === 2 && <div><dt>{line.axis === 'rings' ? 'Inner / outer radius' : 'Band edges'}</dt><dd>{line.edges.map(pixels).join(' / ')}</dd></div>}
                </dl>
            </div>)}
        </div>
        <p className="control-hint">Native pixels, measured from the top-left. Ring radii are measured from the watch centre.</p>
        <p className="control-hint">Stretch a shaded band, or enable Mirror for two clear edges. Drag to move them together.</p>
        <div className="control-heading">
            <label htmlFor="grid-gap-width">Stretch</label>
            <SliderValue label="Stretch" value={width} min={0} max={maximum} onChange={change} />
        </div>
        <input id="grid-gap-width" type="range" min={0} max={maximum} step={1} value={width ?? 0}
            onChange={(event) => change(Number(event.target.value))} />
        <div className="element-box-actions">
        <button type="button" disabled={copyDisabled} title={copyDisabled ? 'Delete unused grid lines before copying more.' : 'Copy at the same position, then drag the selected copy.'}
            onClick={() => {
                const copied = copyGridLines(size, inset, grid, selectedIds);
                onChange(copied.grid);
                onSelect?.(copied.ids);
            }}>Copy {selectedIds.length === 1 ? 'line' : 'lines'}</button>
        <button type="button" disabled={mirrorCopyDisabled}
            title={!mirrorLines.length ? 'Rings are already symmetric about the watch centre.'
                : mirrorCopyDisabled ? 'Delete unused grid lines before copying more.'
                    : 'Copy horizontal and vertical guides to the opposite side of the watch centre.'}
            onClick={() => {
                const copied = copyGridLines(size, inset, grid, selectedIds, true);
                onChange(copied.grid);
                onSelect?.(copied.ids);
            }}>Mirror copy</button>
        <button type="button" className="snap-button" onClick={() => {
            onChange(selectedIds.reduce((next, id) => editGridLine(size, inset, next, id, null), grid));
            onDelete();
        }}>Delete {selectedIds.length === 1 ? "line" : "lines"}</button>
        </div>
    </section>;
}
