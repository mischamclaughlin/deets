import { activityParts, libraryItems, type LibrarySource } from "./library-catalogue.ts";
import { LibrarySymbol } from "./LibrarySymbol.tsx";

export function LibraryList({ onAdd, adding, remaining }: {
    onAdd: (source: LibrarySource) => void;
    adding?: LibrarySource;
    remaining: number;
}) {
    return <div className="compact-library">
        {([['clock', 'Clock & date'], ['activity', 'Activity'], ['weather', 'Weather & sun'], ['device', 'Device & text']] as const).map(([category, title]) =>
            <div className="compact-library-group" key={category}>
                <h3>{title}</h3>
                <ul>{libraryItems.filter((entry) => entry.category === category).map((entry) => {
                    const slots = activityParts[entry.source] ? 2 : 1;
                    return <li key={entry.source} className="compact-library-item">
                        <button type="button" className="compact-library-row" disabled={adding !== undefined || remaining < slots}
                            aria-label={`Add ${entry.label.toLowerCase()}`}
                            title={slots === 2 ? `Add ${entry.label.toLowerCase()} with its icon` : `Add ${entry.label.toLowerCase()}`}
                            onClick={() => onAdd(entry.source)}>
                            <LibrarySymbol source={entry.source} /><span>{entry.label}</span><span className="compact-library-action" aria-hidden="true">+</span>
                        </button>
                    </li>;
                })}</ul>
            </div>)}
    </div>;
}
