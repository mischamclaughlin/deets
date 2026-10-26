import type { Scene, SceneElement } from "../shared/scene.ts";

const appearance = {
    align: "centre",
    colour: 0x4d9de0,
    nightColour: 0x8d99ae,
    visible: "both",
} as const;

const ring: SceneElement = {
    ...appearance,
    id: "edge-ring",
    source: "secondsRing",
    font: "widget",
    x: 8, y: 8, width: 400, height: 400,
};
const clock: SceneElement = {
    ...appearance,
    id: "time",
    source: "time",
    font: "time",
    x: 32, y: 150, width: 352, height: 88,
};

/** Keep non-empty raster regressions independent of the blank editor scene. */
export const populatedScene: Scene = {
    version: 2,
    name: "Bridge regression face",
    device: "epix2pro47mm",
    background: 0,
    elements: [ring, clock],
};
