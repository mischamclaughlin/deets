import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Device } from "../../shared/scene.ts";
import type { DevicePreview } from "../../shared/device-preview.ts";
import { DeviceArtwork } from "./DeviceArtwork.tsx";

export function WatchDeviceFrame({ device, active, children }: { device: Device; active: boolean; children: ReactNode }) {
    const [result, setResult] = useState<{ device: Device; preview?: DevicePreview; error?: string }>();
    const [readyImage, setReadyImage] = useState<string>();
    const onReady = useCallback((image: string) => setReadyImage(image), []);
    useEffect(() => {
        const controller = new AbortController();
        void fetch(`/api/garmin/device-preview/${device}`, { signal: controller.signal })
            .then(async (response) => {
                const body = await response.json();
                if (!response.ok) throw new Error(body.error ?? "Watch casing unavailable.");
                return body as DevicePreview;
            })
            .then((preview) => { if (!controller.signal.aborted) setResult({ device, preview }); })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) setResult({ device, error: error instanceof Error ? error.message : "Watch casing unavailable." });
            });
        return () => controller.abort();
    }, [device]);

    const current = result?.device === device ? result : undefined;
    const frame = current?.preview;
    const ready = Boolean(frame && readyImage === frame.image);
    const style = frame ? {
        "--device-ratio": frame.width / frame.height,
        "--screen-offset-x": (frame.screen.x + frame.screen.width / 2 - frame.width / 2) / frame.width,
        "--screen-offset-y": (frame.screen.y + frame.screen.height / 2 - frame.height / 2) / frame.width,
        "--screen-ratio": frame.screen.width / frame.width,
    } as CSSProperties : undefined;

    return <div className="watch-device-frame" data-active={active && ready} style={style}>
        {frame && <DeviceArtwork key={frame.image} device={device} image={frame.image} onReady={onReady} />}
        {children}
        {active && !ready && <span className="watch-device-message" role="status">
            {current?.error ?? "Loading watch casing…"}
        </span>}
    </div>;
}
