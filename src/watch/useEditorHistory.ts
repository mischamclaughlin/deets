import { useCallback, useRef, useState, type SetStateAction } from "react";
import type { Scene } from "../../shared/scene.ts";
import type { GridSettings } from "./grid.ts";
import type { DesignDocument } from "./design-file.ts";
import { createEditorState, editorHasChanges, reduceEditor } from "./editor-document.ts";

const resolveUpdate = <T,>(previous: T, value: SetStateAction<T>): T =>
    typeof value === "function" ? (value as (previous: T) => T)(previous) : value;

export function useEditorHistory(initialScene: Scene) {
    const [state, setState] = useState(() => createEditorState(initialScene));
    const current = useRef(state);
    const revision = state.generation;
    const apply = useCallback((action: Parameters<typeof reduceEditor>[1], expectedGeneration?: number) => {
        const next = reduceEditor(current.current, action, expectedGeneration);
        current.current = next;
        setState(next);
    }, []);
    const setScene = useCallback((value: SetStateAction<Scene>) => apply({ type: "edit",
        change: (document) => ({ ...document, scene: resolveUpdate(document.scene, value) }) }, revision), [apply, revision]);
    const setGrid = useCallback((value: SetStateAction<GridSettings>) => apply({ type: "edit",
        change: (document) => ({ ...document, grid: resolveUpdate(document.grid, value) }) }, revision), [apply, revision]);
    const markSaved = useCallback((id: string, name: string) => apply({ type: "save", id, name }, revision), [apply, revision]);
    const replaceInitialScene = useCallback((scene: Scene) => apply({ type: "prepare", scene }), [apply]);
    const importDocument = useCallback((document: DesignDocument & { savedDesignId?: string }) => apply({ type: "import", document }), [apply]);
    const newDocument = useCallback(() => apply({ type: "new" }), [apply]);
    const navigate = useCallback((direction: "undo" | "redo") => apply({ type: direction }), [apply]);
    return { ...state.history.present, setScene, setGrid, markSaved, replaceInitialScene, importDocument, revision, newDocument,
        hasUnsavedChanges: editorHasChanges(state), canUndo: state.history.past.length > 0, canRedo: state.history.future.length > 0, navigate };
}
