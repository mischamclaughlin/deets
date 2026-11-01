import { evaluatePixelExpression } from "./arithmetic.ts";

/** All current sliders use whole steps, including percentage and spacing controls. */
export function evaluateSliderExpression(input: string, min: number, max: number): number {
    const value = evaluatePixelExpression(input);
    if (value < min || value > max) throw new Error(`Enter a value from ${min} to ${max}.`);
    return value;
}
