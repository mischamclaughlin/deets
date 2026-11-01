import { isEditableTextSource, type Scene } from "../../shared/scene.ts";

export const supportsTextBackground = (source: string) => source !== "secondsRing" && isEditableTextSource(source);

/** Background edits preserve glyph colours, geometry and the element's layer. */
export function setTextBackground(scene: Scene, id: string, night: boolean, colour: number | undefined): Scene {
    const element = scene.elements.find((item) => item.id === id);
    if (!element || !supportsTextBackground(element.source)) return scene;
    if (colour !== undefined && (!Number.isInteger(colour) || colour < 0 || colour > 0xffffff)) return scene;
    const key = night ? "nightBackgroundColour" : "backgroundColour";
    if (element[key] === colour) return scene;
    const changed = { ...element };
    if (colour === undefined) delete changed[key];
    else changed[key] = colour;
    return { ...scene, elements: scene.elements.map((item) => item === element ? changed : item) };
}
