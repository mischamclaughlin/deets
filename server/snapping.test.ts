import test from "node:test";
import assert from "node:assert/strict";
import { moveElement, type SnapOptions } from "../src/watch/snapping.ts";
import { defaultGrid, editGridLine, gridLines, setGridLineGaps, type GridLine } from "../src/watch/grid.ts";
import { snapGridLineToElements } from "../src/watch/grid-snapping.ts";
import { devices, type Scene, type SceneElement } from "../shared/scene.ts";

const element: SceneElement = { id: "test", source: "label", font: "widget", text: "TEST",
    x: 180, y: 180, width: 20, height: 20, align: "centre", colour: 0xffffff, nightColour: 0xffffff, visible: "both" };
const scene: Scene = { version: 2, name: "Snap tests", device: "epix2pro47mm", background: 0, edgeInset: 16, elements: [element] };
const guides: SnapOptions = { enabled: true, showGuideLines: true };
const none: SnapOptions = { enabled: false, showGuideLines: false };

test("each rectangle edge and centre snaps independently to centre guides", () => {
    for (const offset of [0, 10, 20]) {
        const desiredX = { x: 208 - offset + 3, y: 130 };
        assert.deepEqual(moveElement(scene, element, desiredX, guides), { x: 208 - offset, y: 130 });
        const desiredY = { x: 130, y: 208 - offset + 3 };
        assert.deepEqual(moveElement(scene, element, desiredY, guides), { x: 130, y: 208 - offset });
    }
    assert.deepEqual(moveElement(scene, element, { x: 201, y: 201 }, guides), { x: 198, y: 198 });
});

test("disabled snap, hidden targets and tolerance preserve unconstrained movement", () => {
    const desired = { x: 201, y: 201 };
    assert.deepEqual(moveElement(scene, element, desired, { ...guides, enabled: false }), desired);
    assert.deepEqual(moveElement(scene, element, desired, { ...guides, showGuideLines: false }), desired);
    assert.deepEqual(moveElement(scene, element, desired, { ...guides, threshold: 2 }), desired);
    assert.deepEqual(moveElement(scene, element, desired, { ...none, enabled: true, grid: defaultGrid }), desired);
});

test("odd element dimensions round centre alignment to a native pixel", () => {
    const result = moveElement(scene, { ...element, width: 21 }, { x: 199, y: 130 }, guides);
    assert.ok(result.x === 197 || result.x === 198);
    assert.ok(Number.isInteger(result.x));
});

test("grid chords, curved dividers and rings supply visible snap targets", () => {
    const options = { ...none, enabled: true, grid: { ...defaultGrid, visible: true, rows: 4, columns: 1 } };
    assert.equal(moveElement(scene, element, { x: 190, y: 115 }, options).y, 112);
    const curved = { ...options, grid: { ...options.grid, curvedRows: true } };
    const x = 270;
    const target = 208 - 96 * Math.sqrt(1 - ((x + 10 - 208) / 192) ** 2);
    const result = moveElement(scene, element, { x, y: Math.round(target) + 2 }, curved);
    assert.ok(Math.abs(result.y - target) <= 1);
    const ringOptions = { ...options, grid: { ...options.grid, rows: 1, circumferences: 1, circumferenceStart: "inside" as const, circumferenceSpacing: 90 } };
    assert.equal(moveElement(scene, element, { x: 198, y: 120 }, ringOptions).y, 118);
});

test("dragging stays within the whole-box circular boundary on every device", () => {
    for (const [device, size] of Object.entries(devices)) {
        const local = { ...scene, device: device as Scene["device"] };
        for (const options of [none, guides]) {
            for (const x of [-100, 0, 40, size / 2, size - 10, size + 100]) {
                for (const y of [-100, 0, 40, size / 2, size - 10, size + 100]) {
                    const position = moveElement(local, element, { x, y }, options);
                    assert.ok(Number.isInteger(position.x) && Number.isInteger(position.y));
                    for (const cx of [position.x, position.x + element.width]) {
                        for (const cy of [position.y, position.y + element.height]) {
                            assert.ok((cx - size / 2) ** 2 + (cy - size / 2) ** 2 <= (size / 2 - 16) ** 2);
                        }
                    }
                }
            }
        }
    }
});

test("the circumference limits movement without attracting nearby elements", () => {
    const result = moveElement(scene, element, { x: 22, y: 198 }, { ...none, enabled: true });
    assert.deepEqual(result, { x: 22, y: 198 });
    assert.deepEqual(moveElement(scene, element, { x: 0, y: 198 }, none), { x: 17, y: 198 });
    assert.deepEqual(moveElement({ ...scene, edgeInset: 205 }, element, { x: 1, y: 1 }, guides), { x: element.x, y: element.y });
    assert.deepEqual(moveElement(scene, element, { x: NaN, y: 5 }, guides), { x: element.x, y: element.y });
});


test("legacy scenes retain screen bounds and unsnapped valid positions", () => {
    const legacy = { ...scene };
    delete legacy.edgeInset;
    assert.deepEqual(moveElement(legacy, element, { x: -5, y: -5 }, none), { x: 0, y: 0 });
    for (const position of [{ x: 80, y: 100 }, { x: 200, y: 250 }, { x: 123, y: 187 }]) {
        assert.deepEqual(moveElement(scene, element, position, none), position);
    }
    const halfPixel = moveElement(scene, { ...element, width: 21 }, { x: 197.5, y: 130 }, guides);
    assert.deepEqual(halfPixel, { x: 198, y: 130 });
});

test("the outer seconds ring stays anchored to the physical watch circumference", () => {
    const ring: SceneElement = { ...element, source: "secondsRing", x: 0, y: 0, width: 416, height: 416 };
    const design: Scene = { version: 2, name: "Ring", device: "epix2pro47mm", background: 0, edgeInset: 16, elements: [ring] };
    assert.deepEqual(moveElement(design, ring, { x: 20, y: -20 }, { enabled: false, showGuideLines: false }), { x: 0, y: 0 });
});

const neighbour: SceneElement = { ...element, id: "neighbour", x: 140, y: 150, width: 40, height: 30 };
const elementSnaps: SnapOptions = { ...none, enabled: true, snapToElements: true };
const neighbouringScene: Scene = { ...scene, elements: [element, neighbour] };

test("other element edges and centres supply independent horizontal and vertical axes", () => {
    for (const target of [140, 160, 180]) {
        for (const anchor of [0, 10, 20]) {
            const expected = target - anchor;
            assert.equal(moveElement(neighbouringScene, element, { x: expected + 1, y: 250 }, elementSnaps).x, expected);
        }
    }
    for (const target of [150, 165, 180]) {
        for (const anchor of [0, 10, 20]) {
            const expected = target - anchor;
            assert.equal(moveElement(neighbouringScene, element, { x: 250, y: expected + 1 }, elementSnaps).y, expected);
        }
    }
});

test("touching edges snap on either side and combine with shared axes", () => {
    assert.deepEqual(moveElement(neighbouringScene, element, { x: 123, y: 156 }, elementSnaps), { x: 120, y: 155 });
    assert.deepEqual(moveElement(neighbouringScene, element, { x: 183, y: 156 }, elementSnaps), { x: 180, y: 155 });
    assert.deepEqual(moveElement(neighbouringScene, element, { x: 151, y: 132 }, elementSnaps), { x: 150, y: 130 });
    assert.deepEqual(moveElement(neighbouringScene, element, { x: 151, y: 182 }, elementSnaps), { x: 150, y: 180 });
});

test("element snapping respects its toggle, the master switch, tolerance and self exclusion", () => {
    const desired = { x: 123, y: 250 };
    assert.deepEqual(moveElement(neighbouringScene, element, desired, { ...elementSnaps, snapToElements: false }), desired);
    assert.deepEqual(moveElement(neighbouringScene, element, desired, { ...elementSnaps, enabled: false }), desired);
    assert.deepEqual(moveElement(neighbouringScene, element, desired, { ...elementSnaps, threshold: 2 }), desired);
    assert.deepEqual(moveElement(scene, element, { x: 181, y: 181 }, elementSnaps), { x: 181, y: 181 });
    // Turning off element targets must leave guide snapping available.
    assert.deepEqual(moveElement(neighbouringScene, element, { x: 201, y: 201 }, { ...guides, snapToElements: false }), { x: 198, y: 198 });
});

test("hidden elements and seconds-ring bounds do not supply snap targets", () => {
    const desired = { x: 123, y: 250 };
    const nightScene = { ...scene, elements: [element, { ...neighbour, visible: "night" as const }] };
    assert.deepEqual(moveElement(nightScene, element, desired, elementSnaps), desired);
    assert.equal(moveElement(nightScene, element, desired, { ...elementSnaps, night: true }).x, 120);
    const dayScene = { ...scene, elements: [element, { ...neighbour, visible: "day" as const }] };
    assert.deepEqual(moveElement(dayScene, element, desired, { ...elementSnaps, night: true }), desired);
    const ringScene = { ...scene, elements: [element, { ...neighbour, source: "secondsRing", x: 0, y: 0, width: 416, height: 416 }] };
    assert.deepEqual(moveElement(ringScene, element, { x: 201, y: 201 }, elementSnaps), { x: 201, y: 201 });
});

test("element snapping keeps native integer bounds valid near the circumference", () => {
    for (const device of Object.keys(devices) as Scene["device"][]) {
        const local: Scene = { ...neighbouringScene, device };
        for (const desired of [{ x: 17, y: 140 }, { x: 120, y: 18 }, { x: 350, y: 160 }, { x: 160, y: 350 }]) {
            const result = moveElement(local, { ...element, width: 21 }, desired, elementSnaps);
            assert.ok(Number.isInteger(result.x) && Number.isInteger(result.y));
            const radius = devices[device] / 2 - 16;
            for (const x of [result.x, result.x + 21]) {
                for (const y of [result.y, result.y + element.height]) {
                    assert.ok((x - devices[device] / 2) ** 2 + (y - devices[device] / 2) ** 2 <= radius ** 2);
                }
            }
        }
    }
});

test("Grid, Guide and Elements categories work independently under the master switch", () => {
    const probes = [
        { category: "grid", desired: { x: 250, y: 115 }, snapped: { x: 250, y: 112 } },
        { category: "guide", desired: { x: 201, y: 250 }, snapped: { x: 198, y: 250 } },
        { category: "elements", desired: { x: 123, y: 250 }, snapped: { x: 120, y: 250 } },
    ] as const;
    for (const gridEnabled of [false, true]) {
        for (const guideEnabled of [false, true]) {
            for (const elementsEnabled of [false, true]) {
                const selected = { grid: gridEnabled, guide: guideEnabled, elements: elementsEnabled };
                const options: SnapOptions = {
                    ...guides,
                    snapToGrid: gridEnabled,
                    snapToGuides: guideEnabled,
                    snapToElements: elementsEnabled,
                    grid: { ...defaultGrid, visible: true, rows: 4, columns: 1 },
                };
                for (const { category, desired, snapped } of probes) {
                    assert.deepEqual(moveElement(neighbouringScene, element, desired, options), selected[category] ? snapped : desired,
                        `${category}: ${JSON.stringify(selected)}`);
                    assert.deepEqual(moveElement(neighbouringScene, element, desired, { ...options, enabled: false }), desired,
                        `master off: ${category}: ${JSON.stringify(selected)}`);
                }
            }
        }
    }
});

test("Guide controls centre-line attraction while the circumference stays a hard limit", () => {
    const desired = { x: 201, y: 201 };
    assert.deepEqual(moveElement(scene, element, desired, { ...guides, snapToGuides: true }), { x: 198, y: 198 });
    assert.deepEqual(moveElement(scene, element, desired, { ...guides, snapToGuides: false }), desired);
    for (const snapToGuides of [false, true]) {
        assert.deepEqual(moveElement(scene, element, { x: 0, y: 198 }, { ...guides, snapToGuides }), { x: 17, y: 198 });
    }
});


test("snapping follows edited guides and excludes deleted guides and rings", () => {
    const original = { ...defaultGrid, visible: true, rows: 4, columns: 1 };
    const options = { ...none, enabled: true, grid: editGridLine(416, 16, original, "rows-1", -0.25) };
    assert.equal(moveElement(scene, element, { x: 190, y: 163 }, options).y, 160);
    assert.equal(moveElement(scene, element, { x: 190, y: 115 }, options).y, 115);
    options.grid = editGridLine(416, 16, options.grid, "rows-1", null);
    assert.equal(moveElement(scene, element, { x: 190, y: 163 }, options).y, 163);
    const rings = { ...defaultGrid, visible: true, rows: 1, columns: 1, circumferences: 1 };
    const ringMoved = editGridLine(416, 16, rings, "rings-1", 0.5);
    assert.equal(moveElement(scene, element, { x: 198, y: 115 }, { ...options, grid: ringMoved }).y, 112);
    assert.equal(moveElement(scene, element, { x: 198, y: 115 }, { ...options,
        grid: editGridLine(416, 16, ringMoved, "rings-1", null) }).y, 115);
});


const editableGrid = { ...defaultGrid, visible: true };
const gridLine = (axis: GridLine["axis"]): GridLine => ({ id: `${axis}-1`, axis, value: -0.5, path: "" });

test("dragged straight grid lines snap to element edges and centres on either axis", () => {
    for (const axis of ["rows", "columns"] as const) {
        for (const target of [180, 190, 200]) {
            const desired = (target + 3 - 208) / 192;
            assert.equal(snapGridLineToElements(scene, editableGrid, gridLine(axis), desired, { enabled: true }),
                (target - 208) / 192);
        }
    }
});

test("grid-to-element snapping respects its switch, appearance and native-pixel threshold", () => {
    const line = gridLine("rows");
    const desired = (183 - 208) / 192;
    const snap = (local: Scene, options: { enabled: boolean; night?: boolean; threshold?: number }) =>
        snapGridLineToElements(local, editableGrid, line, desired, options);
    assert.equal(snap(scene, { enabled: false }), desired);
    assert.equal(snap(scene, { enabled: true, threshold: 2 }), desired);
    assert.equal(snap(scene, { enabled: true, threshold: 3 }), (180 - 208) / 192);
    const hidden: Scene = { ...scene, elements: [{ ...element, visible: "night" }] };
    assert.equal(snap(hidden, { enabled: true }), desired);
    assert.equal(snap(hidden, { enabled: true, night: true }), (180 - 208) / 192);
    assert.equal(snap({ ...scene, elements: [{ ...element, visible: "day" }] }, { enabled: true, night: true }), desired);
    assert.equal(snap({ ...scene, elements: [{ ...element, source: "secondsRing" }] }, { enabled: true }), desired);
    assert.equal(snapGridLineToElements(scene, defaultGrid, line, desired, { enabled: true }), desired);
});

test("curved grid snapping uses actual ellipse intersections and rings use radial anchors", () => {
    const local = { ...scene, elements: [{ ...element, x: 260, y: 140 }] };
    for (const axis of ["rows", "columns"] as const) {
        const vertical = axis === "columns";
        const dx = 270 - 208, dy = 150 - 208;
        const cross = vertical ? dy : dx;
        const target = (vertical ? dx : dy) / (192 * Math.sqrt(1 - (cross / 192) ** 2));
        const result = snapGridLineToElements(local, { ...editableGrid, curvedRows: true, curvedColumns: true },
            gridLine(axis), target + 0.01 / 192, { enabled: true });
        assert.ok(Math.abs(result - target) < 1e-12);
    }
    const radial = { ...scene, elements: [{ ...element, x: 208, y: 108 }] };
    assert.equal(snapGridLineToElements(radial, editableGrid, gridLine("rings"), 100.01 / 192, { enabled: true }), 100 / 192);
});

test("grid snaps remain bounded and mirror correctly on every device", () => {
    for (const [device, size] of Object.entries(devices)) {
        const centre = size / 2, radius = centre - 16;
        const local: Scene = { ...scene, device: device as Scene["device"],
            elements: [{ ...element, x: centre - 60, y: centre - 60 }] };
        const target = -60 / radius;
        const value = snapGridLineToElements(local, editableGrid, gridLine("rows"), target + 3 / radius, { enabled: true });
        assert.equal(value, target);
        const changed = editGridLine(size, 16, editableGrid, "rows-1", value, true);
        const lines = gridLines(size, 16, changed);
        assert.equal(lines.find((line) => line.id === "rows-1")?.value, target);
        assert.equal(lines.find((line) => line.id === "rows-3")?.value, -target);
        const outside: Scene = { ...local, elements: [{ ...element, x: size + 10, y: size + 10 }] };
        assert.equal(snapGridLineToElements(outside, editableGrid, gridLine("rows"), 0.99, { enabled: true }), 0.99);
        const boundary: Scene = { ...local, elements: [{ ...element, x: centre + radius, y: centre }] };
        assert.equal(snapGridLineToElements(boundary, editableGrid, gridLine("columns"), 0.99, { enabled: true }), 0.99);
    }
    assert.equal(snapGridLineToElements(scene, editableGrid, gridLine("rows"), 0.3, { enabled: true, threshold: -1 }), 0.3);
    assert.ok(Number.isNaN(snapGridLineToElements(scene, editableGrid, gridLine("rows"), NaN, { enabled: true })));
});

test("elements snap to split grid edges rather than the empty centre", () => {
    const grid = setGridLineGaps(416, 16, editableGrid, ["rows-2"], 20);
    const thin = { ...element, height: 2 };
    const options = { ...none, enabled: true, grid };
    assert.equal(moveElement(scene, thin, { x: 180, y: 200 }, options).y, 198);
    assert.equal(moveElement(scene, thin, { x: 180, y: 205 }, options).y, 205);
});

test("dragged split guides align their edges to elements", () => {
    const grid = setGridLineGaps(416, 16, editableGrid, ["rows-2"], 20);
    const line = gridLines(416, 16, grid).find((item) => item.id === "rows-2")!;
    const snapped = snapGridLineToElements(scene, grid, line, (172 - 208) / 192, { enabled: true });
    assert.ok(Math.abs(snapped - (170 - 208) / 192) < 1e-12);
});
