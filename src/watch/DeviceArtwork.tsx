import { useEffect, useRef } from "react";
import type { Device } from "../../shared/scene.ts";
import { applyForerunnerWhitestone } from "./forerunner-whitestone.ts";
import { removePreviewBackground } from "./preview-background.ts";

export function DeviceArtwork({ device, image, onReady }: { device: Device; image: string; onReady: (image: string) => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        let cancelled = false;
        const source = new Image();
        source.onload = () => {
            const canvas = canvasRef.current;
            if (cancelled || !canvas) return;
            canvas.width = source.naturalWidth;
            canvas.height = source.naturalHeight;
            const context = canvas.getContext("2d");
            if (!context) return;
            context.drawImage(source, 0, 0);
            const artwork = context.getImageData(0, 0, canvas.width, canvas.height);
            removePreviewBackground(artwork.data, canvas.width, canvas.height);
            if (device === "fr165m") applyForerunnerWhitestone(artwork.data, canvas.width, canvas.height);
            context.putImageData(artwork, 0, 0);
            onReady(image);
        };
        source.src = image;
        return () => { cancelled = true; };
    }, [device, image, onReady]);
    return <canvas ref={canvasRef} className="watch-device-artwork" aria-hidden="true" />;
}
