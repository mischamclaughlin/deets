import type { FontKey, WatchMapping } from "../../shared/scene.ts";

const hex = (colour: number) => `#${colour.toString(16).padStart(6, "0")}`;

/** Only canonical integer draw operations touch exported ink; browser text is never measured. */
export async function paintWatch(
    canvas: HTMLCanvasElement,
    mapping: WatchMapping,
    signal: AbortSignal,
): Promise<void> {
    const masks = new Map<FontKey, HTMLImageElement>();
    await Promise.all(
        Object.entries(mapping.assets).map(async ([font, url]) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            masks.set(font as FontKey, image);
        }),
    );
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
