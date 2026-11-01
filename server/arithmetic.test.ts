import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSliderExpression } from "../src/watch/slider-expression.ts";
import { evaluatePixelExpression } from "../src/watch/arithmetic.ts";

test("pixel calculations follow precedence, parentheses and unary signs", () => {
    for (const [input, expected] of [
        ["416 - 32", 384], ["416 − 32", 384], ["2 + 3 * 4", 14], ["(416 - 32) / 2", 192],
        ["-3 + +8", 5], ["2 * -(3 + 4)", -14], ["12 ÷ 3 × 2", 8],
        [".5 * 10", 5], ["1. + 2", 3], ["8 / 2 / 2", 2], ["8 - 2 - 2", 4],
    ] as const) assert.equal(evaluatePixelExpression(input), expected, input);
});

test("pixel calculations round only the final result and normalise negative zero", () => {
    assert.equal(evaluatePixelExpression("1.4 + 1.4"), 3);
    assert.equal(evaluatePixelExpression("416 / 3"), 139);
    assert.equal(evaluatePixelExpression("-1.5"), -1);
    assert.equal(evaluatePixelExpression("-.2"), 0);
    assert.equal(Object.is(evaluatePixelExpression("-0"), -0), false);
});

test("pixel calculations reject invalid syntax and executable expressions", () => {
    for (const input of ["", " ", "2 +", "(2+3", "2 3", "2(3)", "2**3", "1,000",
        "Math.round(3.4)", "globalThis.process.exit()", "alert(1)", "1;2", "1e3", "NaN",
        "Infinity", "0xff", "2 % 1", "1_000", "()", "1..2", "2)"])
        assert.throws(() => evaluatePixelExpression(input), Error, input);
});

test("pixel calculations reject division by zero and bounded resource abuse", () => {
    for (const input of ["1 / 0", "1 / -0", "1/(2-2)"])
        assert.throws(() => evaluatePixelExpression(input), /divide by zero/, input);
    assert.throws(() => evaluatePixelExpression("1".repeat(129)), /128 characters/);
    assert.throws(() => evaluatePixelExpression("(".repeat(17) + "1" + ")".repeat(17)), /16 nested/);
    assert.throws(() => evaluatePixelExpression("-".repeat(17) + "1"), /16 nested/);
    assert.throws(() => evaluatePixelExpression("1000000001"), /one billion/);
    assert.throws(() => evaluatePixelExpression("1000000000 * 1000000000"), /one billion/);
    assert.equal(evaluatePixelExpression("1000000000 / 1000000000"), 1);
});

test("slider calculations enforce the same bounds for pixels and percentages", () => {
    assert.equal(evaluateSliderExpression("260 / 2", 12, 160), 130);
    assert.equal(evaluateSliderExpression("88 + 12", 12, 160), 100);
    assert.equal(evaluateSliderExpression("(50 + 25) * 2", 50, 200), 150);
    assert.equal(evaluateSliderExpression("-8 / 2", -4, 24), -4);
    assert.equal(evaluateSliderExpression("3 / 2", 0, 10), 2);
    assert.equal(evaluateSliderExpression("100 - 100", 0, 0), 0);
    for (const expression of ["260", "160 + 1", "12 - 1"])
        assert.throws(() => evaluateSliderExpression(expression, 12, 160), /from 12 to 160/);
    for (const expression of ["1 / 0", "2 +", "alert(1)"])
        assert.throws(() => evaluateSliderExpression(expression, 0, 100));
});
