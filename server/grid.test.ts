import test from "node:test";
import assert from "node:assert/strict";
import { defaultGrid, gridPaths } from "../src/watch/grid.ts";

test("grid counts describe cells rather than dividers and visibility preserves settings", () => {
    const grid = { ...defaultGrid, rows: 3, columns: 5 };
    assert.deepEqual(gridPaths(416, 16, grid), []);
    assert.equal(gridPaths(416, 16, { ...grid, visible: true }).length, 6);
    assert.deepEqual(gridPaths(416, 16, { ...grid, visible: true, rows: 1, columns: 1 }), []);
    assert.equal(gridPaths(416, 16, { ...grid, visible: true, rows: 24, columns: 24 }).length, 46);
});

test("straight chords terminate precisely on the content circle at every supported count", () => {
    for (const size of [390, 416, 454]) {
        for (const inset of [0, 16, size / 2 - 1]) {
            for (let count = 1; count <= 24; count++) {
                const paths = gridPaths(size, inset, { ...defaultGrid, visible: true, rows: count, columns: count });
                for (const path of paths) {
                    const [, x1, y1, command, x2, y2] = path.split(" ");
                    assert.equal(command, "L");
                    for (const [x, y] of [[Number(x1), Number(y1)], [Number(x2), Number(y2)]]) {
                        const distance = Math.hypot(x - size / 2, y - size / 2);
                        assert.ok(Math.abs(distance - (size / 2 - inset)) < 1e-9);
                    }
                }
            }
        }
    }
});

test("curved axes are independent, symmetric and retain a straight central divider", () => {
    const grid = { ...defaultGrid, visible: true };
    const rows = gridPaths(416, 16, { ...grid, curvedRows: true });
    assert.deepEqual(rows.slice(0, 3), [
        "M 16 208 A 192 96 0 0 1 400 208",
        "M 16 208 L 400 208",
        "M 16 208 A 192 96 0 0 0 400 208",
    ]);
    assert.ok(rows.slice(3).every((path) => path.includes(" L ")));
    const columns = gridPaths(416, 16, { ...grid, curvedColumns: true });
    assert.ok(columns.slice(0, 3).every((path) => path.includes(" L ")));
    assert.deepEqual(columns.slice(3), [
        "M 208 16 A 96 192 0 0 0 208 400",
        "M 208 16 L 208 400",
        "M 208 16 A 96 192 0 0 1 208 400",
    ]);
    assert.equal(gridPaths(416, 16, { ...grid, curvedRows: true, curvedColumns: true })
        .filter((path) => path.includes(" A ")).length, 4);
});

test("invalid grid counts cannot create unbounded geometry", () => {
    for (const count of [0, -1, 25, 2.5, NaN, Infinity]) {
        assert.throws(() => gridPaths(416, 16, { ...defaultGrid, visible: true, rows: count }), RangeError);
        assert.throws(() => gridPaths(416, 16, { ...defaultGrid, visible: true, columns: count }), RangeError);
    }
});
