import { SliderValue } from "./SliderValue.tsx";
import { addGridLine, configureGridRings, type GridSettings } from './grid.ts';
import './GridSettingsPanel.css';

export function GridSettingsPanel({ grid, onChange, onSelect }: {
    grid: GridSettings;
    onChange: (grid: GridSettings) => void;
    onSelect: (id: string) => void;
}) {
    return <div className="grid-settings">
        <div className="grid-axis-controls">
            {(['rows', 'columns'] as const).map((axis) => <div className="grid-axis" key={axis}>
                <button type="button" disabled={Object.keys(grid.edits ?? {}).length >= 256}
                    onClick={() => {
                        const added = addGridLine(grid, axis);
                        onChange(added.grid);
                        onSelect(added.id);
                    }}>+ {axis === 'rows' ? 'Horizontal' : 'Vertical'}</button>
                <label className="guide-toggle">
                    <input type="checkbox" checked={axis === 'rows' ? grid.curvedRows : grid.curvedColumns}
                        aria-label={`Curve ${axis === 'rows' ? 'horizontal' : 'vertical'} lines`}
                        onChange={(event) => onChange({ ...grid, [axis === 'rows' ? 'curvedRows' : 'curvedColumns']: event.target.checked })} />
                    Curved
                </label>
            </div>)}
        </div>
        <div className="grid-ring-controls">
            <label className="font-choice">Rings
                <select aria-label="Extra circumferences" value={grid.circumferences}
                    onChange={(event) => onChange(configureGridRings(grid, { circumferences: Number(event.target.value) }))}>
                    {Array.from({ length: 25 }, (_, count) => <option key={count} value={count}>{count}</option>)}
                </select>
            </label>
            <label className="font-choice">Start from
                <select aria-label="Ring starting edge" value={grid.circumferenceStart}
                    onChange={(event) => onChange(configureGridRings(grid, { circumferenceStart: event.target.value as 'inside' | 'outside' }))}>
                    <option value="outside">Outside</option><option value="inside">Inside</option>
                </select>
            </label>
        </div>
        <div className="control-heading">
            <label htmlFor="circumference-spacing">Spacing</label>
            <SliderValue label="Spacing" value={grid.circumferenceSpacing} min={1} max={100}
                disabled={grid.circumferences === 0}
                onChange={(value) => onChange(configureGridRings(grid, { circumferenceSpacing: value }))} />
        </div>
        <input id="circumference-spacing" type="range" min={1} max={100} step={1}
            disabled={grid.circumferences === 0} value={grid.circumferenceSpacing}
            onChange={(event) => onChange(configureGridRings(grid, { circumferenceSpacing: Number(event.target.value) }))}
            title="Spacing reduces automatically to fit all rings." />
    </div>;
}
