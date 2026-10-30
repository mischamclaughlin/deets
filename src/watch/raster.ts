import type { MaskKey, WatchMapping } from "../../shared/scene.ts";

const hex = (colour: number) => `#${colour.toString(16).padStart(6, "0")}`;
const decodedMasks = new Map<string, { image: HTMLImageElement; ready: boolean; loading: Promise<void> }>();

function maskAsset(url: string) {
    const cached = decodedMasks.get(url);
    if (cached) return cached;
    const image = new Image();
    image.src = url;
    const asset = { image, ready: false, loading: Promise.resolve() };
    asset.loading = image.decode().then(() => { asset.ready = true; }).catch((error: unknown) => {
        if (decodedMasks.get(url) === asset) decodedMasks.delete(url);
        throw error;
    });
    decodedMasks.set(url, asset);
    if (decodedMasks.size > 64) decodedMasks.delete(decodedMasks.keys().next().value!);
    return asset;
}

/** Only canonical integer draw operations touch exported ink; browser text is never measured. */
export async function paintWatch(
    canvas: HTMLCanvasElement,
    mapping: WatchMapping,
    signal: AbortSignal,
): Promise<void> {
    const masks = new Map<MaskKey, HTMLImageElement>();
    const loading: Promise<void>[] = [];
    for (const [font, url] of Object.entries(mapping.assets)) {
        if (!url) throw new Error("A mapped Garmin font asset is missing.");
        const asset = maskAsset(url);
        masks.set(font as MaskKey, asset.image);
        if (!asset.ready) loading.push(asset.loading);
    }
    // Once prepared, moving existing pixels paints synchronously without decoding again.
    if (loading.length) await Promise.all(loading);
    if (signal.aborted) return;
    const frame = document.createElement("canvas");
    frame.width = frame.height = mapping.size;
    const context = frame.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    context.fillStyle = hex(mapping.background);
    context.fillRect(0, 0, frame.width, frame.height);
    const coloured = new Map<string, HTMLCanvasElement>();
    for (const operation of mapping.ops) {
        if (operation.kind === "rect") {
            context.fillStyle = hex(operation.colour);
            context.fillRect(
                operation.x,
                operation.y,
                operation.width,
                operation.height,
            );
        } else {
            const key = `${operation.font}:${operation.colour}`;
            let atlas = coloured.get(key);
            if (!atlas) {
                const mask = masks.get(operation.font);
                if (!mask)
                    throw new Error("A mapped Garmin glyph mask is missing.");
                atlas = document.createElement("canvas");
                atlas.width = mask.naturalWidth;
                atlas.height = mask.naturalHeight;
                const ink = atlas.getContext("2d")!;
                ink.drawImage(mask, 0, 0);
                ink.globalCompositeOperation = "source-in";
                ink.fillStyle = hex(operation.colour);
                ink.fillRect(0, 0, atlas.width, atlas.height);
                coloured.set(key, atlas);
            }
            context.drawImage(
                atlas,
                operation.sx,
                operation.sy,
                operation.width,
                operation.height,
                operation.x,
                operation.y,
                operation.width,
                operation.height,
            );
        }
    }
    if (signal.aborted) return;
    canvas.width = canvas.height = mapping.size;
    const output = canvas.getContext("2d")!;
    output.imageSmoothingEnabled = false;
    output.drawImage(frame, 0, 0);
}
