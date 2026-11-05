import { activityParts, sidebarEntries, sidebarKinds, sidebarKind, libraryCategories, type LibrarySource } from "./library-catalogue.ts";
import { LibrarySymbol } from "./LibrarySymbol.tsx";
import { LibrarySection } from "./LibrarySection.tsx";

export function LibraryList({ onAdd, adding, remaining }: {
    onAdd: (source: LibrarySource) => void;
    adding?: LibrarySource;
    remaining: number;
}) {
    return <div className="compact-library">
        {libraryCategories.map(({ id, label, initiallyOpen }) => {
            const entries = sidebarEntries.filter((entry) => entry.category === id);
            return <LibrarySection key={id} category={id} title={label} count={entries.length} context="sidebar" initiallyOpen={initiallyOpen}>
                {sidebarKinds.map((kind) => {
                    const choices = entries.filter((entry) => sidebarKind(entry.source) === kind);
                    if (!choices.length) return null;
                    return <div className="library-part-group" key={kind}>
                        <h3>{kind}</h3>
                        <ul>{choices.map((entry) => {
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
                    </div>;
                })}
            </LibrarySection>;
        })}
    </div>;
}
