import test from "node:test";
import assert from "node:assert/strict";
import { moveElement, type SnapOptions } from "../src/watch/snapping.ts";
import { defaultGrid } from "../src/watch/grid.ts";
import { devices, type Scene, type SceneElement } from "../shared/scene.ts";

const element: SceneElement = { id: "test", source: "label", font: "widget", text: "TEST",
    x: 180, y: 180, width: 20, height: 20, align: "centre", colour: 0xffffff, nightColour: 0xffffff, visible: "both" };
const scene: Scene = { version: 2, name: "Snap tests", device: "epix2pro47mm", background: 0, edgeInset: 16, elements: [element] };
const guides: SnapOptions = { enabled: true, showGuideLines: true, showCircumference: false };
const none: SnapOptions = { enabled: false, showGuideLines: false, showCircumference: false };

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
        for (const options of [none, { ...guides, showCircumference: true }]) {
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

test("boundary snaps use outer corners and preserve the element when no placement fits", () => {
    const result = moveElement(scene, element, { x: 22, y: 198 }, { ...none, enabled: true, showCircumference: true });
    assert.deepEqual(result, { x: 17, y: 198 });
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
    assert.deepEqual(moveElement(design, ring, { x: 20, y: -20 }, { enabled: false, showGuideLines: false, showCircumference: false }), { x: 0, y: 0 });
});
