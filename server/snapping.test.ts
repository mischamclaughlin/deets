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

test("Guide controls circumference snapping as well as centre guides", () => {
    const desired = { x: 22, y: 198 };
    const options: SnapOptions = { ...none, enabled: true, showCircumference: true, snapToGuides: true };
    assert.deepEqual(moveElement(scene, element, desired, options), { x: 17, y: 198 });
    assert.deepEqual(moveElement(scene, element, desired, { ...options, snapToGuides: false }), desired);
    assert.deepEqual(moveElement(scene, element, desired, { ...options, enabled: false }), desired);
});
