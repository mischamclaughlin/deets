import type { Scene, Typography, WatchMapping } from "../../shared/scene.ts";

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


export const setTypography = (scene: Scene, elementId: string, typography: Typography, signal?: AbortSignal) =>
    post<WatchMapping>("typography", { scene, elementId, typography }, signal);

export async function uploadFont(file: File): Promise<{ id: string; name: string }> {
    if (!/\.(ttf|otf)$/i.test(file.name) || file.size > 5 * 1024 * 1024)
        throw new Error("Choose a TTF or OTF font up to 5 MB.");
    const response = await fetch("/api/garmin/font", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Font-Name": encodeURIComponent(file.name) },
        body: file,
    });
    if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "The font could not be uploaded.");
    }
    return response.json() as Promise<{ id: string; name: string }>;
}
