import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { isEditableTextSource, type Scene } from "../../shared/scene.ts";
import { mapWatch, fitElementBox } from "./api.ts";
import { evaluatePixelExpression } from "./arithmetic.ts";
import "./ElementBoxPanel.css";

const fields = ["x", "y", "width", "height"] as const;
type Field = typeof fields[number];

/** Native box dimensions are independent of font rasterisation. */
export function ElementBoxPanel({ scene, elementId, onSceneChange }: {
    scene: Scene;
    elementId: string;
    onSceneChange: Dispatch<SetStateAction<Scene>>;
}) {
    const element = scene.elements.find((item) => item.id === elementId)!;
    const text = !["stepsWeek", "floorsWeek", "runWeek", "heartZones", "temperatureZones", "solarTimeline", "secondsRing"].includes(element.source);
    const canFit = isEditableTextSource(element.source) && element.source !== "secondsRing";
    const [draft, setDraft] = useState(() => Object.fromEntries(fields.map((field) => [field, String(element[field])])) as Record<Field, string>);
    const [request, setRequest] = useState<{ base: Scene; next: Scene; fit: boolean }>();
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (!request) return;
        const controller = new AbortController();
        void (request.fit ? fitElementBox(request.next, elementId, controller.signal) : mapWatch(request.next, false, controller.signal)).then((mapped) => {
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
    }, [request, elementId, onSceneChange]);

    return <section className="element-box-panel" aria-labelledby="element-box-heading">
        <h2 id="element-box-heading">Element box</h2>
        <form onSubmit={(event) => {
            event.preventDefault();
            try {
                const dimensions = Object.fromEntries(fields.map((field) => [field, evaluatePixelExpression(draft[field])])) as Record<Field, number>;
                setDraft(Object.fromEntries(fields.map((field) => [field, String(dimensions[field])])) as Record<Field, string>);
                setError(undefined);
                setRequest({ base: scene, fit: false, next: { ...scene, elements: scene.elements.map((item) => item.id === elementId
                    ? { ...item, ...dimensions, ...(text ? { boxSizing: "fixed" as const } : {}) }
                    : item) } });
            } catch (failure) {
                setError(failure instanceof Error ? failure.message : "Enter a valid number or calculation.");
            }
        }}>
            <fieldset disabled={request !== undefined}>
                <legend className="element-box-legend">Position and size in native pixels</legend>
                <div className="element-box-fields">
                    {fields.map((field) => <label key={field}>
                        {field === "x" || field === "y" ? field.toUpperCase() : field === "width" ? "Width" : "Height"}
                        <input type="text" value={draft[field]} spellCheck={false} autoComplete="off"
                            aria-invalid={error ? true : undefined}
                            onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} />
                    </label>)}
                </div>
                <div className="element-box-actions">
                    <button type="submit">{request ? "Applying…" : "Apply box"}</button>
                    {canFit && <button type="button" onClick={() => {
                        setError(undefined);
                        setRequest({ base: scene, next: scene, fit: true });
                    }}>Fit automatically</button>}
                </div>
            </fieldset>
        </form>
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
