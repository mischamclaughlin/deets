export const devices = {
    epix2pro42mm: 390,
    epix2pro47mm: 416,
    epix2pro51mm: 454,
} as const;
export type Device = keyof typeof devices;
export type FontKey = "widget" | "date" | "time" | "numeric" | "tall" | `generated:${string}`;
/** Coverage resources used only by mapped drawing operations. */
export type MaskKey = FontKey | `ring:${string}`;
export type ClockSource = "time" | "timeSeconds" | "hours" | "minutes" | "seconds" | "secondsRing";
export const isClockSource = (source: string): source is ClockSource =>
    source === "time" || source === "timeSeconds" || source === "hours" || source === "minutes" ||
    source === "seconds" || source === "secondsRing";
export type DateSource = "numericDate" | "date" | "weekday" | "day" | "month" | "year";
export const isDateSource = (source: string): source is DateSource =>
    source === "numericDate" || source === "date" || source === "weekday" ||
    source === "day" || source === "month" || source === "year";
export const isEditableTextSource = (source: string): boolean =>
    isClockSource(source) || isDateSource(source) || source === "divider";
export type ActivitySource = "floors" | "floorsIcon" | "floorsWeek" | "steps" | "weeklyWalk" | "weeklyRun" | "stepsIcon" | "walkIcon" | "runIcon" | "stepsWeek" | "walkWeek" | "runWeek";
export type DividerSymbol = ":" | "." | "-" | "/" | "|";
export interface Typography {
    family: string;
    size: number;
    thickness: number;
    width: number;
    letterSpacing: number;
}
export type TextDefaults = Omit<Typography, "family">;
export interface TextPreset extends TextDefaults {
    id: string;
    name: string;
}
export interface ColourPreset {
    id: string;
    name: string;
    colour: number;
}
export interface SceneElement {
    id: string;
    source: string;
    font: FontKey;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Use explicit clipping dimensions or hug the live visible text ink. */
    boxSizing?: "fixed" | "hug";
    align: "left" | "centre" | "right";
    colour: number;
    nightColour: number;
    colourPresetId?: string;
    nightColourPresetId?: string;
    visible: "both" | "day" | "night";
    text?: string;
    /** Live link to a named numeric typography preset. */
    textPresetId?: string;
    typography?: Typography;
    /** Size of the trailing :SS in HH:MM:SS; defaults to full. */
    secondsSize?: "full" | "half";
    /** When omitted, legacy dates and text with typography stay custom; other text inherits. */
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
/** Preserve legacy date fonts unless inheritance is explicitly selected. */
export const inheritsFont = (element: Pick<SceneElement, "source" | "inheritFont" | "typography">): boolean =>
    element.inheritFont ?? (!isDateSource(element.source) && !element.typography);

export interface Scene {
    version: 2;
    name: string;
    device: Device;
    background: number;
    /** Font family inherited by editable text elements; defaults to time. */
    fontFamily?: string;
    /** Numeric typography used by new text elements and explicit default application. */
    textDefaults?: TextDefaults;
    /** Named numeric typography snapshots and the default for newly added text. */
    textPresets?: TextPreset[];
    colourPresets?: ColourPreset[];
    defaultTextPresetId?: string | null;
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
    font: MaskKey;
    elementId: string;
}
export interface WatchMapping {
    scene: Scene;
    size: number;
    background: number;
    ops: Array<RectOp | BitmapOp>;
    areas: MappedArea[];
    assets: Partial<Record<MaskKey, string>>;
    mapping: string;
}
