import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Scene } from "../../shared/scene.ts";
import { previewWatch, setActivityGraph } from "./api.ts";
import { activityParts, libraryEntries } from "./library-catalogue.ts";
import { activityLayout, arrangeActivity, type IconPosition } from "./activity-layout.ts";

function GapInput({ gap, disabled, invalid, onCommit }: {
    gap: number; disabled: boolean; invalid: boolean; onCommit: (gap: number) => void;
}) {
    const [draft, setDraft] = useState(String(gap));
    return <label className="font-choice">Icon–data gap (px)
        <input type="text" inputMode="numeric" value={draft} disabled={disabled}
            aria-invalid={invalid || undefined} onChange={(event) => setDraft(event.target.value)}
            onBlur={() => { if (draft !== String(gap)) onCommit(draft.trim() === "" ? NaN : Number(draft)); }}
            onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setDraft(String(gap));
            }} />
    </label>;
}

type Change = { kind: "graph" | "movement"; enabled: boolean }
    | { kind: "layout"; position: IconPosition; gap: number };

export function ActivitySettingsPanel({ scene, elementId, onSceneChange, onSelect }: {
    scene: Scene;
    elementId: string;
    onSceneChange: Dispatch<SetStateAction<Scene>>;
    onSelect: (id: string) => void;
}) {
    const selected = scene.elements.find((item) => item.id === elementId);
    const activity = selected?.activityId ? scene.elements.find((item) => item.id === selected.activityId)
        : selected && activityParts[selected.source as keyof typeof activityParts] ? selected : undefined;
    const parts = activity ? activityParts[activity.source as keyof typeof activityParts] : undefined;
    const companions = scene.elements.filter((item) => item.activityId === activity?.id);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const request = useRef<AbortController | undefined>(undefined);
    const latest = useRef(scene);
    const latestSelection = useRef(elementId);
    useLayoutEffect(() => { latest.current = scene; latestSelection.current = elementId; }, [scene, elementId]);
    useEffect(() => () => request.current?.abort(), []);
    if (!activity || !parts) return null;
    const hasGraph = companions.some((item) => item.source === parts.graph);
    const layout = activityLayout(scene, activity.id);
    async function change(change: Change) {
        if (request.current || !activity) return;
        const snapshot = scene;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true);
        setError(undefined);
        try {
            const mapping = await (change.kind === "graph" ? setActivityGraph(snapshot, activity.id, change.enabled, controller.signal)
                : previewWatch(change.kind === "layout" ? arrangeActivity(snapshot, activity.id, change.position, change.gap)
                    : { ...snapshot, elements: snapshot.elements.map((item) => item.id === activity.id ? { ...item, moveTogether: change.enabled } : item) }, false, controller.signal));
            if (controller.signal.aborted) return;
            if (latest.current !== snapshot) throw new Error("The canvas changed. Try that setting again.");
            onSceneChange((current) => current === snapshot ? mapping.scene : current);
            if (latestSelection.current === elementId && !mapping.scene.elements.some((item) => item.id === elementId)) onSelect(activity.id);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The activity could not be updated.");
        } finally {
            if (request.current === controller) { request.current = undefined; setBusy(false); }
        }
    }
    return <section className="activity-settings" aria-labelledby="activity-settings-heading">
        <h2 id="activity-settings-heading">{libraryEntries.find((entry) => entry.source === activity.source)?.label} activity</h2>
        <label className="guide-toggle"><input type="checkbox" checked={activity.moveTogether !== false} disabled={busy || companions.length === 0}
            onChange={(event) => void change({ kind: "movement", enabled: event.target.checked })} />Move together</label>
        <p className="activity-setting-help">{activity.moveTogether === false ? "Move the icon, value and graph independently." : "Keep the icon, value and graph together when moving."}</p>
        {layout && <>
            <label className="font-choice">Icon position
                <select value={layout.position} disabled={busy} onChange={(event) => void change({
                    kind: "layout", position: event.target.value as IconPosition, gap: layout.gap,
                })}>
                    <option value="above">Above data</option>
                    <option value="below">Below data</option>
                </select>
            </label>
            <GapInput key={`${activity.id}-${layout.position}-${layout.gap}`} gap={layout.gap}
                disabled={busy} invalid={error !== undefined}
                onCommit={(gap) => void change({ kind: "layout", position: layout.position, gap })} />
        </>}
        <label className="guide-toggle"><input type="checkbox" checked={hasGraph} disabled={busy}
            onChange={(event) => void change({ kind: "graph", enabled: event.target.checked })} />Weekly graph</label>
        {busy && <p className="typography-status" role="status">Updating activity…</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </section>;
}
