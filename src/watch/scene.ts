import type { Scene } from "../../shared/scene.ts";

/** A blank native-pixel canvas shared by the editor and Garmin export. */
export const scene: Scene = {
    version: 2,
    name: "Deets",
    device: "epix2pro47mm",
    background: 0,
    edgeInset: 16,
    elements: [],
};
