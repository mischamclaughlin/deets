export const devices = {
    epix2pro42mm: 390,
    epix2pro47mm: 416,
    epix2pro51mm: 454,
} as const;
export type Device = keyof typeof devices;
export type FontKey = "widget" | "date" | "time" | "numeric" | "tall" | `generated:${string}`;
export type ClockSource = "time" | "timeSeconds" | "hours" | "minutes" | "seconds" | "secondsRing";
export const isClockSource = (source: string): source is ClockSource =>
    source === "time" || source === "timeSeconds" || source === "hours" || source === "minutes" ||
    source === "seconds" || source === "secondsRing";
export type DividerSymbol = ":" | "." | "-" | "/" | "|";
export interface Typography {
    family: string;
    size: number;
    thickness: number;
    width: number;
    letterSpacing: number;
}
export type TextDefaults = Omit<Typography, "family">;
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
    /** Size of the trailing :SS in HH:MM:SS; defaults to full. */
    secondsSize?: "full" | "half";
    /** When omitted, clocks with legacy typography stay custom; others inherit. */
    inheritFont?: boolean;
    /** Character drawn by an independent divider element. Defaults to colon. */
    dividerSymbol?: DividerSymbol;
    /** Vertical placement of divider ink within its native text box. Defaults to middle. */
    dividerPosition?: "top" | "middle" | "bottom";
    /** Align all seconds-ring outer tick tips to the edge-clearance circumference. */
    ringTicksToCircumference?: boolean;
    /** Keep outer tips fixed and stretch all tick inner ends to edge clearance. */
    ringTicksStretchToCircumference?: boolean;
}
export interface Scene {
    version: 2;
    name: string;
    device: Device;
    background: number;
    /** Font family inherited by clock elements; defaults to time. */
    fontFamily?: string;
    /** Numeric typography used by new text elements and explicit default application. */
    textDefaults?: TextDefaults;
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
