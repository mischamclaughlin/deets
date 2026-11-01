import { useId } from "react";
import type { ActivityAddOptions } from "../../shared/scene.ts";
import { activityParts, type LibraryEntry } from "./library-catalogue.ts";

export function ActivityOptions({ entry, options, onChange, onAdd, busy, remaining }: {
    entry: LibraryEntry;
    options: ActivityAddOptions;
    onChange: (options: ActivityAddOptions) => void;
    onAdd: () => void;
    busy: boolean;
    remaining: number;
}) {
    const help = useId();
    const value = options.value !== false;
    const icon = options.icon !== false;
    const hasGraph = !!activityParts[entry.source]?.graph;
    const graph = hasGraph && !!options.graph;
    const count = Number(value) + Number(icon) + Number(graph);
    const label = value || count === 0 ? `Add ${entry.label.toLowerCase()}` : icon && graph ? `Add ${entry.label.toLowerCase()} extras`
        : `Add ${entry.label.toLowerCase()} ${icon ? "icon" : "graph"}`;
    return <div className="activity-add-options">
        <fieldset disabled={busy}>
            <legend>Include with {entry.label.toLowerCase()}</legend>
            <label><input type="checkbox" checked={value} aria-label={`Include ${entry.label.toLowerCase()} value`}
                onChange={(event) => onChange({ ...options, value: event.target.checked })} />Value</label>
            <label><input type="checkbox" checked={icon} aria-label={`Include ${entry.label.toLowerCase()} icon`}
                onChange={(event) => onChange({ ...options, icon: event.target.checked })} />Icon</label>
            {hasGraph && <label><input type="checkbox" checked={graph} aria-label={`Include ${entry.label.toLowerCase()} weekly graph`}
                onChange={(event) => onChange({ ...options, graph: event.target.checked })} />Weekly graph</label>}
        </fieldset>
        <button type="button" className="activity-add-button" disabled={busy || count === 0 || remaining < count} onClick={onAdd} aria-describedby={help}>
            {busy ? "Adding…" : label}<span aria-hidden="true">+</span>
        </button>
        <p id={help} className="activity-options-hint">{count === 0 ? "Choose at least one part." : remaining < count ? `Needs ${count} free slots; ${remaining} available.`
            : value && icon ? "Icon above value · 16 px gap · move together" : !value ? "Add this part without duplicating the data" : "Change appearance and movement in the right sidebar"}</p>
    </div>;
}
