import type { Scene, WatchMapping } from "../../shared/scene.ts";

async function post<T>(
    path: string,
    payload: unknown,
    signal?: AbortSignal,
): Promise<T> {
    const response = await fetch(`/api/garmin/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
    });
    if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(
            error.error ?? "The Garmin operation could not complete.",
        );
    }
    return (await response.json()) as T;
}

export const mapWatch = (scene: Scene, night = false, signal?: AbortSignal) =>
    post<WatchMapping>("layout", { scene, night }, signal);

/** Export the exact scene snapshot that supplied the validated mapping token. */
export async function exportGarmin(
    scene: Scene,
    signal?: AbortSignal,
): Promise<Blob> {
    const snapshot = structuredClone(scene);
    const mapped = await mapWatch(snapshot, false, signal);
    const response = await fetch("/api/garmin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: mapped.scene, mapping: mapped.mapping }),
        signal,
    });
    if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "The Garmin export could not complete.");
    }
    return response.blob();
}
