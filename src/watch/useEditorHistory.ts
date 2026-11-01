import { useCallback, useRef, useState, type SetStateAction } from "react";
import type { Scene } from "../../shared/scene.ts";
import { defaultGrid, type GridSettings } from "./grid.ts";
import { createHistory, recordHistory, redoHistory, undoHistory } from "./history.ts";

interface EditorDocument { scene: Scene; grid: GridSettings }
const resolveUpdate = <T,>(previous: T, value: SetStateAction<T>): T =>
    typeof value === "function" ? (value as (previous: T) => T)(previous) : value;

export function useEditorHistory(initialScene: Scene) {
    const [history, setHistory] = useState(() => createHistory({ scene: initialScene, grid: defaultGrid }));
    const current = useRef(history);
    const [revision, setRevision] = useState(0);
    const generation = useRef(0);
    const update = useCallback((change: (document: EditorDocument) => EditorDocument, expectedGeneration: number) => {
        if (expectedGeneration !== generation.current) return;
        const before = current.current;
        const after = recordHistory(before, change(before.present));
        current.current = after;
        setHistory(after);
    }, []);
    const setScene = useCallback((value: SetStateAction<Scene>) => update((document) => ({ ...document, scene: resolveUpdate(document.scene, value) }), revision), [update, revision]);
    const setGrid = useCallback((value: SetStateAction<GridSettings>) => update((document) => ({ ...document, grid: resolveUpdate(document.grid, value) }), revision), [update, revision]);
    const replaceInitialScene = useCallback((scene: Scene) => {
        const next = createHistory({ ...current.current.present, scene });
        current.current = next;
        setHistory(next);
    }, []);
    const navigate = useCallback((direction: "undo" | "redo") => {
        const next = (direction === "undo" ? undoHistory : redoHistory)(current.current);
        if (next === current.current) return;
        current.current = next;
        generation.current += 1;
        setRevision(generation.current);
        setHistory(next);
    }, []);
    return { ...history.present, setScene, setGrid, replaceInitialScene, revision,
        canUndo: history.past.length > 0, canRedo: history.future.length > 0, navigate };
}
