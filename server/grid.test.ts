import test from "node:test";
import assert from "node:assert/strict";
import { defaultGrid, gridPaths, gridRadii, gridLines, editGridLine, gridLineValues, gridLineGap, maxGridLineGap, setGridLineGaps, moveGridLines } from "../src/watch/grid.ts";

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


test("extra circumferences remain evenly spaced within the boundary from either end", () => {
    for (const size of [390, 416, 454]) {
        for (const inset of [0, 16, size / 2 - 1]) {
            for (let count = 0; count <= 24; count++) {
                const grid = { ...defaultGrid, visible: true, circumferences: count, circumferenceStart: "inside" as const };
                const radii = gridRadii(size, inset, grid);
                assert.equal(radii.length, count);
                const boundary = size / 2 - inset;
                const spacing = Math.min(grid.circumferenceSpacing, boundary / (count + 1));
                radii.forEach((radius, index) => {
                    assert.ok(radius > 0 && radius < boundary);
                    assert.ok(Math.abs(radius - (radii[index - 1] ?? 0) - spacing) < 1e-9);
                });
                assert.deepEqual(gridRadii(size, inset, { ...grid, circumferenceStart: "outside" }),
                    radii.map((radius) => boundary - radius));
                assert.deepEqual(gridRadii(size, inset, { ...grid, visible: false }), []);
            }
        }
    }
    assert.deepEqual(gridRadii(416, 16, { ...defaultGrid, visible: true, circumferences: 3 }), [168, 144, 120]);
});

test("invalid circumference counts cannot create unbounded geometry", () => {
    for (const count of [-1, 25, 2.5, NaN, Infinity]) {
        assert.throws(() => gridRadii(416, 16, { ...defaultGrid, visible: true, circumferences: count }), RangeError);
    }
});


test("ring direction and spacing position rings relative to the chosen starting point", () => {
    const grid = { ...defaultGrid, visible: true, circumferences: 2, circumferenceSpacing: 30 };
    assert.deepEqual(gridRadii(416, 16, { ...grid, circumferenceStart: "inside" }), [30, 60]);
    assert.deepEqual(gridRadii(416, 16, { ...grid, circumferenceStart: "outside" }), [162, 132]);
    assert.deepEqual(gridRadii(416, 32, { ...grid, circumferenceStart: "inside" }), [30, 60]);
    assert.deepEqual(gridRadii(416, 32, { ...grid, circumferenceStart: "outside" }), [146, 116]);
    for (const spacing of [0, -1, 101, 2.5, NaN, Infinity]) {
        assert.throws(() => gridRadii(416, 16, { ...grid, circumferenceSpacing: spacing }), RangeError);
    }
});


test("individual grid edits share positions across paths and rings without changing generation", () => {
    const original = { ...defaultGrid, visible: true, circumferences: 2 };
    const moved = editGridLine(416, 16, original, "rows-1", -0.25);
    assert.equal(gridLines(416, 16, moved).find((line) => line.id === "rows-1")?.value, -0.25);
    const [, x1, y1, command, x2, y2] = gridPaths(416, 16, moved)[0].split(" ");
    assert.equal(command, "L");
    assert.equal(Number(y1), 160);
    assert.equal(Number(y2), 160);
    assert.ok(Math.abs(Math.hypot(Number(x1) - 208, 160 - 208) - 192) < 1e-9);
    assert.ok(Math.abs(Number(x1) + Number(x2) - 416) < 1e-9);
    assert.equal(original.edits, undefined);
    const removed = editGridLine(416, 16, moved, "columns-2", null);
    assert.equal(gridPaths(416, 16, removed).length, 5);
    assert.equal(gridLines(416, 16, removed).some((line) => line.id === "columns-2"), false);
    const ring = editGridLine(416, 16, removed, "rings-1", 0.5);
    assert.deepEqual(gridRadii(416, 16, ring), [96, 144]);
    assert.deepEqual(gridRadii(416, 16, editGridLine(416, 16, ring, "rings-2", null)), [96]);
    assert.deepEqual(gridPaths(416, 16, { ...removed, edits: undefined }), gridPaths(416, 16, original));
});

test("mirror mode moves and deletes a reflected pair and keeps centre lines single", () => {
    const grid = { ...defaultGrid, visible: true };
    const moved = editGridLine(416, 16, grid, "rows-1", -0.3, true);
    assert.deepEqual(gridLines(416, 16, moved).filter((line) => line.axis === "rows").map((line) => line.value), [-0.3, 0, 0.3]);
    const removed = editGridLine(416, 16, moved, "rows-3", null, true);
    assert.deepEqual(gridLines(416, 16, removed).filter((line) => line.axis === "rows").map((line) => line.value), [0]);
    const centred = editGridLine(416, 16, moved, "rows-1", 0, true);
    assert.equal(gridLines(416, 16, centred).some((line) => line.id === "rows-3"), false);
    const centreDeleted = editGridLine(416, 16, grid, "columns-2", null, true);
    assert.equal(gridLines(416, 16, centreDeleted).filter((line) => line.axis === "columns").length, 2);
});

test("mirror mode creates a stable missing reflection including when moving a centre line", () => {
    let grid = { ...defaultGrid, visible: true };
    grid = editGridLine(416, 16, grid, "rows-3", null);
    grid = editGridLine(416, 16, grid, "rows-1", -0.4, true);
    assert.equal(gridLines(416, 16, grid).find((line) => line.id === "rows-1-mirror")?.value, 0.4);
    grid = editGridLine(416, 16, grid, "rows-1", -0.2, true);
    assert.equal(gridLines(416, 16, grid).filter((line) => line.axis === "rows").length, 3);
    assert.equal(gridLines(416, 16, grid).find((line) => line.id === "rows-1-mirror")?.value, 0.2);
    grid = editGridLine(416, 16, grid, "rows-1-mirror", null, true);
    assert.deepEqual(gridLines(416, 16, grid).filter((line) => line.axis === "rows").map((line) => line.value), [0]);
    const centreMoved = editGridLine(416, 16, { ...defaultGrid, visible: true, rows: 2 }, "rows-1", 0.25, true);
    assert.deepEqual(gridLines(416, 16, centreMoved).filter((line) => line.axis === "rows").map((line) => line.value), [0.25, -0.25]);
});

test("edits stay bounded across device sizes, curved paths, tiny circles and invalid inputs", () => {
    for (const size of [390, 416, 454]) {
        for (const inset of [0, 16, size / 2 - 1]) {
            const grid = { ...defaultGrid, visible: true, curvedRows: true, curvedColumns: true, circumferences: 1 };
            for (const id of ["rows-1", "columns-1", "rings-1"]) {
                for (const value of [-100, 0, 100]) {
                    const changed = editGridLine(size, inset, grid, id, value, true);
                    for (const line of gridLines(size, inset, changed)) {
                        assert.ok(Number.isFinite(line.value) && line.value > -1 && line.value < 1);
                        assert.ok(!line.path.includes("NaN"));
                        if (line.axis === "rings") assert.ok(line.value > 0);
                    }
                }
            }
            for (const value of [NaN, Infinity, -Infinity])
                assert.throws(() => editGridLine(size, inset, grid, "rows-1", value), RangeError);
        }
    }
    const grid = { ...defaultGrid, visible: true };
    assert.equal(editGridLine(416, 16, grid, "missing", 0.5), grid);
    assert.throws(() => gridLines(416, 16, { ...grid, edits: { "rows-1": NaN } }), RangeError);
    assert.throws(() => gridLines(416, 16, { ...grid, edits: { "rings-1": 0 } }), RangeError);
});


const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("grid gaps split logical lines symmetrically without adding selectable identities", () => {
    for (const size of [390, 416, 454]) {
        for (const curved of [false, true]) {
            const original = { ...defaultGrid, visible: true, curvedRows: curved, curvedColumns: curved, circumferences: 1 };
            const changed = setGridLineGaps(size, 16, original, ["rows-1", "columns-2", "rings-1"], 13);
            const radius = size / 2 - 16;
            assert.equal(gridLines(size, 16, changed).length, gridLines(size, 16, original).length);
            for (const id of ["rows-1", "columns-2", "rings-1"]) {
                const line = gridLines(size, 16, changed).find((item) => item.id === id)!;
                const values = gridLineValues(size, 16, changed, line);
                assert.equal(values.length, 2);
                close((values[1] - values[0]) * radius, 13);
                close((values[1] + values[0]) / 2, line.value);
                assert.equal(line.path.split("M ").length - 1, 2);
                assert.equal(gridLineGap(size, 16, changed, id), 13);
                assert.ok(!line.path.includes("NaN"));
            }
            const radii = gridRadii(size, 16, changed);
            close(radii[1] - radii[0], 13);
            assert.equal("gaps" in original, false);
            const restored = setGridLineGaps(size, 16, changed, ["rows-1", "columns-2", "rings-1"], 0);
            assert.deepEqual(gridPaths(size, 16, restored), gridPaths(size, 16, original));
            assert.deepEqual(gridRadii(size, 16, restored), gridRadii(size, 16, original));
        }
    }
});

test("one gap width applies atomically to a selection and respects the tightest boundary", () => {
    const original = { ...defaultGrid, visible: true, circumferences: 1 };
    const maximum = maxGridLineGap(416, 16, original, ["rows-1", "rings-1"]);
    const changed = setGridLineGaps(416, 16, original, ["rows-1", "rings-1"], 1000);
    assert.equal(gridLineGap(416, 16, changed, "rows-1"), maximum);
    assert.equal(gridLineGap(416, 16, changed, "rings-1"), maximum);
    for (const line of gridLines(416, 16, changed)) {
        const values = gridLineValues(416, 16, changed, line);
        assert.ok(values.every((value) => value > (line.axis === "rings" ? 0 : -1) && value < 1));
    }
    assert.equal(setGridLineGaps(416, 16, original, ["missing"], 20), original);
    for (const width of [-1, 0.5, NaN, Infinity])
        assert.throws(() => setGridLineGaps(416, 16, original, ["rows-1"], width), RangeError);
    assert.throws(() => gridLines(416, 16, { ...original, gaps: { "wrong": 1 } }), RangeError);
    assert.throws(() => gridLines(416, 16, { ...original, gaps: { "rows-1": -1 } }), RangeError);
    assert.throws(() => gridLines(416, 16, { ...original,
        gaps: Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`rows-${index + 1}`, 1])) }), RangeError);
});

test("moving split lines preserves width and clamping never moves one edge independently", () => {
    for (const size of [390, 416, 454]) {
        const original = setGridLineGaps(size, 16, { ...defaultGrid, visible: true, circumferences: 1 },
            ["rows-1", "columns-1", "rings-1"], 20);
        for (const id of ["rows-1", "columns-1", "rings-1"]) {
            for (const desired of [-100, 100]) {
                const moved = editGridLine(size, 16, original, id, desired);
                const line = gridLines(size, 16, moved).find((item) => item.id === id)!;
                const edges = gridLineValues(size, 16, moved, line);
                close((edges[1] - edges[0]) * (size / 2 - 16), 20);
                assert.ok(edges.every((value) => value > (line.axis === "rings" ? 0 : -1) && value < 1));
            }
        }
    }
});

test("mirrored gap edits copy widths, create missing reflections and remove metadata on delete", () => {
    const original = { ...defaultGrid, visible: true };
    const changed = setGridLineGaps(416, 16, original, ["rows-1"], 17, true);
    assert.equal(gridLineGap(416, 16, changed, "rows-1"), 17);
    assert.equal(gridLineGap(416, 16, changed, "rows-3"), 17);
    const moved = editGridLine(416, 16, changed, "rows-1", -0.3, true);
    assert.equal(gridLineGap(416, 16, moved, "rows-3"), 17);
    const removed = editGridLine(416, 16, moved, "rows-1", null, true);
    assert.equal(removed.gaps, undefined);
    const missing = editGridLine(416, 16, original, "rows-3", null);
    const restored = setGridLineGaps(416, 16, missing, ["rows-1"], 12, true);
    assert.equal(gridLineGap(416, 16, restored, "rows-1-mirror"), 12);
    assert.deepEqual(gridPaths(416, 16, { ...changed, gaps: undefined }), gridPaths(416, 16, original));
});

test("group movement preserves distances and mirrored pairs are processed once", () => {
    const original = setGridLineGaps(416, 16, { ...defaultGrid, visible: true }, ["rows-1", "rows-2"], 20);
    const moved = moveGridLines(416, 16, original, ["rows-1", "rows-2"], 0.1);
    const lines = gridLines(416, 16, moved);
    close(lines.find((line) => line.id === "rows-1")!.value, -0.4);
    close(lines.find((line) => line.id === "rows-2")!.value, 0.1);
    const clamped = moveGridLines(416, 16, original, ["rows-1", "rows-2"], 100);
    const clampedLines = gridLines(416, 16, clamped);
    close(clampedLines.find((line) => line.id === "rows-2")!.value - clampedLines.find((line) => line.id === "rows-1")!.value, 0.5);
    assert.equal(gridLineGap(416, 16, clamped, "rows-2"), 20);
    const reflected = moveGridLines(416, 16, original, ["rows-1", "rows-3"], 0.1, true);
    const reflectedLines = gridLines(416, 16, reflected);
    close(reflectedLines.find((line) => line.id === "rows-1")!.value, -0.4);
    close(reflectedLines.find((line) => line.id === "rows-3")!.value, 0.4);
    assert.equal(gridLineGap(416, 16, reflected, "rows-3"), 20);
    assert.equal(moveGridLines(416, 16, original, ["missing"], 1), original);
    assert.equal(moveGridLines(416, 16, original, ["rows-1"], 0), original);
    assert.throws(() => moveGridLines(416, 16, original, ["rows-1"], NaN), RangeError);
});
