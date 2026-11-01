/** Immutable, bounded snapshots. Browser viewing preferences stay outside history. */
export interface History<T> {
    past: T[];
    present: T;
    future: T[];
}
export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });
export function recordHistory<T>(history: History<T>, present: T): History<T> {
    if (JSON.stringify(history.present) === JSON.stringify(present)) return history;
    return { past: [...history.past.slice(-99), history.present], present, future: [] };
}
export function undoHistory<T>(history: History<T>): History<T> {
    if (!history.past.length) return history;
    return { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] };
}
export function redoHistory<T>(history: History<T>): History<T> {
    if (!history.future.length) return history;
    return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}

export function selectElement(current: readonly string[], id: string | undefined, additive = false): string[] {
    if (id === undefined) return [];
    return additive ? current.includes(id) ? current.filter((item) => item !== id) : [...current, id] : [id];
}
