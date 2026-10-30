import { useId } from "react";
import type { ActivityAddOptions } from "../../shared/scene.ts";
import type { LibraryEntry } from "./library-catalogue.ts";

export function ActivityOptions({ entry, options, onChange, onAdd, busy, remaining }: {
    entry: LibraryEntry;
    options: ActivityAddOptions;
    onChange: (options: ActivityAddOptions) => void;
    onAdd: () => void;
    busy: boolean;
    remaining: number;
}) {
    const help = useId();
    const count = 1 + Number(!!options.icon) + Number(!!options.graph);
    return <div className="activity-add-options">
        <fieldset disabled={busy}>
            <legend>Include with {entry.label.toLowerCase()}</legend>
            <label><input type="checkbox" checked={!!options.icon} aria-label={`Include ${entry.label.toLowerCase()} icon`}
                onChange={(event) => onChange({ ...options, icon: event.target.checked })} />Icon</label>
            <label><input type="checkbox" checked={!!options.graph} aria-label={`Include ${entry.label.toLowerCase()} weekly graph`}
                onChange={(event) => onChange({ ...options, graph: event.target.checked })} />Weekly graph</label>
        </fieldset>
        <button type="button" className="activity-add-button" disabled={busy || remaining < count} onClick={onAdd} aria-describedby={help}>
            {busy ? "Adding…" : `Add ${entry.label.toLowerCase()}`}<span aria-hidden="true">+</span>
        </button>
        <p id={help} className="activity-options-hint">{remaining < count ? `Needs ${count} free slots; ${remaining} available.`
            : count > 1 ? `${count} elements · move each part independently` : "Value only · add extras if you need them"}</p>
    </div>;
}
