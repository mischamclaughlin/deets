import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { isEditableTextSource, type Scene } from "../../shared/scene.ts";
import { previewWatch, fitElementBox } from "./api.ts";
import { moveSceneElement } from "./snapping.ts";
import { evaluatePixelExpression } from "./arithmetic.ts";
import "./ElementBoxPanel.css";
import { isSelectionLocked, type EditorLayout } from "./editor-layout.ts";

const fields = ["x", "y", "width", "height"] as const;
type Field = typeof fields[number];

function BoxInput({ field, value, onCommit, invalid }: {
    field: Field;
    value: number;
    onCommit: (field: Field, expression: string) => void;
    invalid: boolean;
}) {
    const [draft, setDraft] = useState(String(value));
    return <label>
        {field === "x" || field === "y" ? field.toUpperCase() : field === "width" ? "Width" : "Height"}
        <input type="text" value={draft} spellCheck={false} autoComplete="off"
            aria-invalid={invalid ? true : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
                if (draft === String(value)) return;
                try { setDraft(String(evaluatePixelExpression(draft))); } catch { /* The parent reports invalid input. */ }
                onCommit(field, draft);
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") { setDraft(String(value)); }
            }} />
    </label>;
}

/** Native box dimensions are independent of font rasterisation. */
export function ElementBoxPanel({ scene, layout, elementId, onSceneChange }: {
    scene: Scene;
    layout?: EditorLayout;
    elementId: string;
    onSceneChange: Dispatch<SetStateAction<Scene>>;
}) {
    const element = scene.elements.find((item) => item.id === elementId)!;
    const text = isEditableTextSource(element.source) && element.source !== "secondsRing";
    const canFit = isEditableTextSource(element.source) && element.source !== "secondsRing";
    const [request, setRequest] = useState<{ base: Scene; next: Scene; fit: boolean }>();
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (!request || isSelectionLocked([elementId], layout)) return;
        const controller = new AbortController();
        void (request.fit ? fitElementBox(request.next, elementId, controller.signal) : previewWatch(request.next, false, controller.signal)).then((mapped) => {
            if (controller.signal.aborted) return;
            onSceneChange((current) => current === request.base ? mapped.scene : current);
            setRequest(undefined);
            setError(undefined);
        }).catch((failure) => {
            if (controller.signal.aborted) return;
            setRequest(undefined);
            setError(failure instanceof Error ? failure.message : "The element box could not be changed.");
        });
        return () => controller.abort();
    }, [request, elementId, layout, onSceneChange]);

    return <section className="element-box-panel" aria-labelledby="element-box-heading">
        <h2 id="element-box-heading">Position and size <span className="section-unit">px</span></h2>
        <fieldset disabled={isSelectionLocked([elementId], layout)}>
            <legend className="element-box-legend">Position and size in native pixels</legend>
            <div className="element-box-fields">
                {fields.map((field) => <BoxInput key={`${field}-${element[field]}`} field={field} value={element[field]}
                    invalid={error !== undefined} onCommit={(changed, expression) => {
                        try {
                            const value = evaluatePixelExpression(expression);
                            setError(undefined);
                            setRequest((pending) => {
                                const base = pending?.base ?? scene;
                                const next = pending?.next ?? scene;
                                if (changed === "x" || changed === "y") {
                                    const target = next.elements.find((item) => item.id === elementId)!;
                                    return { base, fit: false, next: moveSceneElement(next, elementId,
                                        { x: changed === "x" ? value : target.x, y: changed === "y" ? value : target.y },
                                        { enabled: false, showGuideLines: false, layout }) };
                                }
                                return { base, fit: false, next: { ...next, elements: next.elements.map((item) => item.id === elementId
                                    ? { ...item, [changed]: value,
                                        ...(item.source === "secondsRing" && (changed === "width" || changed === "height") ? { width: value, height: value } : {}),
                                        ...(text && (changed === "width" || changed === "height") ? { boxSizing: "fixed" as const } : {}) }
                                    : item) } };
                            });
                        } catch (failure) {
                            setError(failure instanceof Error ? failure.message : "Enter a valid number or calculation.");
                        }
                    }} />)}
            </div>
            {canFit && <div className="element-box-actions">
                <button type="button" disabled={request !== undefined} onClick={() => {
                    setError(undefined);
                    setRequest({ base: scene, next: scene, fit: true });
                }}>Fit to content</button>
            </div>}
        </fieldset>
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
