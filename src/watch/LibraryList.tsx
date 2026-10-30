import { useState } from "react";
import type { ActivityAddOptions } from "../../shared/scene.ts";
import { activityParts, libraryItems, type LibrarySource } from "./library-catalogue.ts";
import { ActivityOptions } from "./ActivityOptions.tsx";
import { LibrarySymbol } from "./LibrarySymbol.tsx";

export function LibraryList({ onAdd, adding, remaining }: {
    onAdd: (source: LibrarySource, options?: ActivityAddOptions) => void;
    adding?: LibrarySource;
    remaining: number;
}) {
    const [expanded, setExpanded] = useState<LibrarySource>();
    const [options, setOptions] = useState<ActivityAddOptions>({});
    return <div className="compact-library">
        {([['clock', 'Clock & date'], ['activity', 'Activity']] as const).map(([category, title]) =>
            <div className="compact-library-group" key={category}>
                <h3>{title}</h3>
                <ul>{libraryItems.filter((entry) => entry.category === category).map((entry) => {
                    const expandable = !!activityParts[entry.source];
                    const active = expanded === entry.source;
                    return <li key={entry.source} className={active ? "compact-library-item is-expanded" : "compact-library-item"}>
                        <button type="button" className="compact-library-row" disabled={adding !== undefined || remaining === 0}
                            aria-label={expandable ? `${entry.label} options` : `Add ${entry.label.toLowerCase()}`}
                            aria-expanded={expandable ? active : undefined}
                            onClick={() => {
                                if (!expandable) { onAdd(entry.source); return; }
                                setExpanded(active ? undefined : entry.source);
                                setOptions({});
                            }}>
                            <LibrarySymbol source={entry.source} /><span>{entry.label}</span><span className="compact-library-action" aria-hidden="true">{expandable ? active ? "−" : "+" : "+"}</span>
                        </button>
                        {active && <ActivityOptions entry={entry} options={options} onChange={setOptions} busy={adding !== undefined} remaining={remaining}
                            onAdd={() => onAdd(entry.source, options)} />}
                    </li>;
                })}</ul>
            </div>)}
    </div>;
}
