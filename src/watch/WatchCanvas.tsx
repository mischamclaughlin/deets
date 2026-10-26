import { useEffect, useRef, useState } from "react";
import { devices, type Scene, type WatchMapping } from "../../shared/scene.ts";
import { mapWatch } from "./api.ts";
import { gridPaths, gridRadii, type GridSettings } from "./grid.ts";
import { paintWatch } from "./raster.ts";
import "./watch.css";

interface Props {
    scene: Scene;
    night?: boolean;
    showCircumference?: boolean;
    grid?: GridSettings;
}
interface Result {
    scene: Scene;
    night: boolean;
    layout?: WatchMapping;
    error?: string;
}

/** Native watch pixels with browser-only area and circumference annotations. */
export function WatchCanvas({ scene, night = false, showCircumference = false, grid }: Props) {
    const size = devices[scene.device];
    const canvas = useRef<HTMLCanvasElement>(null);
    const [result, setResult] = useState<Result>();
    const [painted, setPainted] = useState<string>();
    const [active, setActive] = useState<string>("time");
    const current =
        result?.scene === scene && result.night === night ? result : undefined;
    const mapping = current?.layout;
    const signature = mapping ? `${mapping.mapping}:${night}` : undefined;
    const ready = !!signature && painted === signature;

    useEffect(() => {
        const controller = new AbortController();
        void mapWatch(scene, night, controller.signal)
            .then((layout) => {
                if (!controller.signal.aborted)
                    setResult({ scene, night, layout });
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    setResult({
                        scene,
                        night,
                        error:
                            error instanceof Error
                                ? error.message
                                : "The watch mapping could not load.",
                    });
            });
        return () => controller.abort();
    }, [scene, night]);

    useEffect(() => {
        if (!mapping || !canvas.current || !signature) return;
        const controller = new AbortController();
        void paintWatch(canvas.current, mapping, controller.signal)
            .then(() => {
                if (!controller.signal.aborted) setPainted(signature);
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    setResult({
                        scene,
                        night,
                        error:
                            error instanceof Error
                                ? error.message
                                : "The watch pixels could not render.",
                    });
            });
        return () => controller.abort();
    }, [mapping, signature, scene, night]);

    return (
        <div className="watch" aria-label={`${scene.device} watch canvas`}>
            <canvas
                ref={canvas}
                aria-label="Native-pixel Garmin watch face"
                style={{ visibility: ready ? "visible" : "hidden" }}
            />
            {!ready && (
                <span className="watch-status" role="status">
                    {current?.error ?? "Mapping watch pixels…"}
                </span>
            )}
            {grid?.visible && (
                <svg className="watch-grid" viewBox={`0 0 ${size} ${size}`}
                    role="img" aria-label={`${grid.rows} rows and ${grid.columns} columns, ${grid.circumferences} extra circumferences; ${grid.curvedRows ? "curved" : "straight"} rows, ${grid.curvedColumns ? "curved" : "straight"} columns`}>
                    {gridRadii(size, scene.edgeInset ?? 0, grid).map((radius, index) => (
                        <circle key={`ring-${index}`} cx={size / 2} cy={size / 2} r={radius} />
                    ))}
                    {gridPaths(size, scene.edgeInset ?? 0, grid).map((path, index) => (
                        <path key={index} d={path} />
                    ))}
                </svg>
            )}
            {showCircumference && (
                <svg
                    className="watch-circumference"
                    viewBox={`0 0 ${size} ${size}`}
                    aria-label={`Content boundary, ${scene.edgeInset ?? 0} native pixels from the edge`}
                    role="img"
                >
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={size / 2 - (scene.edgeInset ?? 0)}
                    />
                </svg>
            )}
            {mapping && ready && (
                <svg
                    className="watch-areas"
                    viewBox={`0 0 ${mapping.size} ${mapping.size}`}
                    aria-label="Translated watch areas"
                >
                    {mapping.areas.map((area) => {
                        const selected = area.id === active;
                        const label = `${area.label} · ${area.x},${area.y} · ${area.width}×${area.height} px`;
                        const labelX = Math.max(
                            8,
                            Math.min(area.x, mapping.size - 235),
                        );
                        const labelY = Math.max(16, area.y - 8);
                        return (
                            <g
                                key={area.id}
                                tabIndex={0}
                                role="button"
                                aria-label={label}
                                className={selected ? "area selected" : "area"}
                                onPointerEnter={() => setActive(area.id)}
                                onFocus={() => setActive(area.id)}
                                onClick={() => setActive(area.id)}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                    ) {
                                        event.preventDefault();
                                        setActive(area.id);
                                    }
                                }}
                            >
                                <rect
                                    x={area.x}
                                    y={area.y}
                                    width={area.width}
                                    height={area.height}
                                />
                                {selected && (
                                    <g
                                        className="area-label"
                                        aria-hidden="true"
                                    >
                                        <rect
                                            x={labelX - 3}
                                            y={labelY - 11}
                                            width={235}
                                            height={16}
                                        />
                                        <text x={labelX} y={labelY}>
                                            {label}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>
            )}
        </div>
    );
}
