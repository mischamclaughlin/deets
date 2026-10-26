export const devices = {
    epix2pro42mm: 390,
    epix2pro47mm: 416,
    epix2pro51mm: 454,
} as const;
export type Device = keyof typeof devices;
export type FontKey = "widget" | "date" | "time" | "numeric" | "tall" | `generated:${string}`;
export type ClockSource = "time" | "hours" | "minutes";
export const isClockSource = (source: string): source is ClockSource =>
    source === "time" || source === "hours" || source === "minutes";
export interface Typography {
    family: string;
    size: number;
    thickness: number;
    width: number;
    letterSpacing: number;
}
export interface SceneElement {
    id: string;
    source: string;
    font: FontKey;
    x: number;
    y: number;
    width: number;
    height: number;
    align: "left" | "centre" | "right";
    colour: number;
    nightColour: number;
    visible: "both" | "day" | "night";
    text?: string;
    typography?: Typography;
}
export interface Scene {
    version: 2;
    name: string;
    device: Device;
    background: number;
    /** Minimum radial clearance in native pixels; omitted for legacy scenes. */
    edgeInset?: number;
    elements: SceneElement[];
}
export interface MappedArea {
    id: string;
    source: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface RectOp {
    kind: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
    colour: number;
}
export interface BitmapOp {
    kind: "bitmap";
    x: number;
    y: number;
    width: number;
    height: number;
    sx: number;
    sy: number;
    colour: number;
    font: FontKey;
    elementId: string;
}
export interface WatchMapping {
    scene: Scene;
    size: number;
    background: number;
    ops: Array<RectOp | BitmapOp>;
    areas: MappedArea[];
    assets: Partial<Record<FontKey, string>>;
    mapping: string;
}
