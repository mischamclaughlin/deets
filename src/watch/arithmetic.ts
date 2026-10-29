/** Evaluate bounded arithmetic, then round once to the nearest whole native pixel. */
export function evaluatePixelExpression(input: string): number {
    if (input.length > 128) throw new Error("Keep calculations within 128 characters.");
    const source = input.replaceAll("−", "-").replaceAll("×", "*").replaceAll("÷", "/").trim();
    if (!source) throw new Error("Enter a number or a calculation.");
    let position = 0;
    let operations = 0;
    const invalid = () => new Error("Use numbers, +, −, *, / and parentheses.");
    const skip = () => {
        while (/\s/.test(source[position] ?? "") && position < source.length) position += 1;
    };
    const checked = (value: number): number => {
        if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000)
            throw new Error("The calculation must stay within one billion pixels.");
        return value;
    };
    const count = () => {
        operations += 1;
        if (operations > 64) throw new Error("Use no more than 64 calculation operations.");
    };
    const primary = (depth: number): number => {
        if (depth > 16) throw new Error("Use no more than 16 nested calculation levels.");
        skip();
        const token = source[position];
        if (token === "+" || token === "-") {
            position += 1;
            count();
            return checked((token === "-" ? -1 : 1) * primary(depth + 1));
        }
        if (token === "(") {
            position += 1;
            const value = expression(depth + 1);
            skip();
            if (source[position] !== ")") throw invalid();
            position += 1;
            return value;
        }
        const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(position));
        if (!number) throw invalid();
        position += number[0].length;
        return checked(Number(number[0]));
    };
    const product = (depth: number): number => {
        let value = primary(depth);
        while (true) {
            skip();
            const operator = source[position];
            if (operator !== "*" && operator !== "/") return value;
            position += 1;
            count();
            const right = primary(depth);
            if (operator === "/" && right === 0) throw new Error("Cannot divide by zero.");
            value = checked(operator === "*" ? value * right : value / right);
        }
    };
    const expression = (depth: number): number => {
        let value = product(depth);
        while (true) {
            skip();
            const operator = source[position];
            if (operator !== "+" && operator !== "-") return value;
            position += 1;
            count();
            const right = product(depth);
            value = checked(operator === "+" ? value + right : value - right);
        }
    };
    const value = expression(0);
    skip();
    if (position !== source.length) throw invalid();
    // Math.round uses the nearest integer, with exact halves towards +infinity.
    return Math.round(value) || 0;
}
