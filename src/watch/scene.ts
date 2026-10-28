import type { Scene } from "../../shared/scene.ts";

/** Native-pixel time face shared by the editor and Garmin export. */
export const scene: Scene = {
    version: 2,
    name: "Deets",
    device: "epix2pro47mm",
    background: 0,
    edgeInset: 16,
    textPresets: [],
    defaultTextPresetId: null,
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
