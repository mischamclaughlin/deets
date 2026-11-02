import { useState } from 'react';
import { defaultPreviewScenario, parsePreviewScenario, type PreviewScenario } from './preview-scenario.ts';
import './PreviewScenarioPanel.css';

export function PreviewScenarioPanel({ value, onChange }: { value?: PreviewScenario; onChange: (value?: PreviewScenario) => void }) {
    const [draft, setDraft] = useState(value ?? defaultPreviewScenario);
    const [error, setError] = useState<string>();
    return <details className="preview-scenarios">
        <summary>Preview values{value ? ' · Custom' : ''}</summary>
        <form onSubmit={(event) => {
            event.preventDefault();
            try { onChange(parsePreviewScenario(draft)); setError(undefined); }
            catch (failure) { setError(failure instanceof Error ? failure.message : 'Choose valid preview values.'); }
        }}>
            <label>Time<input aria-label="Preview time" type="time" step="1" required value={draft.time}
                onChange={(event) => setDraft({ ...draft, time: event.target.value.length === 5 ? `${event.target.value}:00` : event.target.value })} /></label>
            <label>Date<input aria-label="Preview date" type="date" min="2000-01-01" max="2099-12-31" required value={draft.date}
                onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
            <label>Readings<select value={draft.readings} onChange={(event) => setDraft({ ...draft, readings: event.target.value as PreviewScenario['readings'] })}>
                <option value="sample">Sample</option><option value="large">Large values</option><option value="missing">Unavailable</option>
            </select></label>
            <label>Weather<select value={draft.weather} onChange={(event) => setDraft({ ...draft, weather: event.target.value as PreviewScenario['weather'] })}>
                <option value="sample">Sample</option><option value="sun">Clear</option><option value="cloud">Cloudy</option>
                <option value="cloud-rain">Rain</option><option value="cloud-storm">Storm</option><option value="snowflake">Snow</option>
                <option value="wind">Wind</option><option value="mist">Mist</option><option value="missing">Unavailable</option>
            </select></label>
            <div className="preview-scenario-actions"><button type="submit">Apply preview</button><button type="button" onClick={() => {
                onChange(undefined); setDraft(defaultPreviewScenario); setError(undefined);
            }}>Reset</button></div>
            <p>Preview only. Exports use live watch data.</p>
            {error && <p role="alert">{error}</p>}
        </form>
    </details>;
}
