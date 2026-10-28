import type { Scene } from "../../shared/scene.ts";

/** Native-pixel time face shared by the editor and Garmin export. */
export const scene: Scene = {
    version: 2,
    name: "Deets",
    device: "epix2pro47mm",
    background: 0,
    edgeInset: 16,
    textPresets: [
        { id: "time", name: "Time", size: 88, thickness: 0, width: 100, letterSpacing: 1 },
        { id: "widgets", name: "Widgets", size: 26, thickness: 0, width: 100, letterSpacing: 1 },
    ],
    defaultTextPresetId: "time",
    elements: [
        {
            id: "time",
            source: "time",
            font: "time",
            x: 88,
            y: 164,
            width: 240,
            height: 88,
            align: "centre",
            colour: 0xdceccf,
            nightColour: 0x8d99ae,
            visible: "both",
        },
    ],
};
