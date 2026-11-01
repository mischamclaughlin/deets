import test from "node:test";
import assert from "node:assert/strict";
import { callBridge } from "./bridge.ts";
import type { Scene, WatchMapping } from "../shared/scene.ts";
import { scene as initialScene } from "../src/watch/scene.ts";
import { setTextBackground } from "../src/watch/text-background.ts";
import { layerDragLayout } from "../src/watch/layer-drag.ts";
import { frontToBack, moveLayer, placeLayer } from "../src/watch/layers.ts";
import { preparedMapping, rememberMapping } from "../src/watch/mapping-cache.ts";

const scene: Scene = { ...initialScene, name: "Layer controls", elements: ["back", "middle", "front"].map((id, index) =>
    ({ ...initialScene.elements[0], id, colour: [0xff0000, 0x00ff00, 0x0000ff][index] })) };
const ids = (value: Scene) => value.elements.map((element) => element.id);

test("layer controls move only the selected layer and keep front-first presentation", () => {
    const before = structuredClone(scene);
    assert.deepEqual(frontToBack(scene).map((element) => element.id), ["front", "middle", "back"]);
    assert.deepEqual(ids(moveLayer(scene, "back", "front")), ["middle", "front", "back"]);
    assert.deepEqual(ids(moveLayer(scene, "front", "back")), ["front", "back", "middle"]);
    assert.deepEqual(ids(moveLayer(scene, "middle", "forward")), ["back", "front", "middle"]);
    assert.deepEqual(ids(moveLayer(scene, "middle", "backward")), ["middle", "back", "front"]);
    assert.equal(moveLayer(scene, "front", "forward"), scene);
    assert.equal(moveLayer(scene, "back", "backward"), scene);
    assert.equal(moveLayer(scene, "missing", "front"), scene);
    assert.deepEqual(scene, before);
});

test("drag placement uses either edge of a front-first row and handles no-op drops", () => {
    assert.deepEqual(ids(placeLayer(scene, "back", "front", "before")), ["middle", "front", "back"]);
    assert.deepEqual(ids(placeLayer(scene, "back", "front", "after")), ["middle", "back", "front"]);
    assert.deepEqual(ids(placeLayer(scene, "front", "back", "after")), ["front", "back", "middle"]);
    assert.deepEqual(ids(placeLayer(scene, "front", "back", "before")), ["back", "front", "middle"]);
    assert.equal(placeLayer(scene, "middle", "middle", "after"), scene);
    assert.equal(placeLayer(scene, "middle", "front", "after"), scene);
    assert.equal(placeLayer(scene, "missing", "front", "before"), scene);
    assert.equal(placeLayer(scene, "front", "missing", "before"), scene);
    for (const source of scene.elements) {
        for (const target of scene.elements) {
            for (const edge of ["before", "after"] as const) {
                const moved = placeLayer(scene, source.id, target.id, edge);
                assert.equal(moved.elements.length, scene.elements.length);
                assert.equal(new Set(ids(moved)).size, scene.elements.length);
                for (const element of scene.elements) assert.equal(moved.elements.find((item) => item.id === element.id), element);
            }
        }
    }
});

test("reordering invalidates prepared ink and maps overlapping layers in the same day/night order", async () => {
    for (const night of [false, true]) {
        const original = rememberMapping(await callBridge<WatchMapping>("layout", { scene, night }), night);
        const reordered = placeLayer(original.scene, "back", "front", "before");
        assert.equal(preparedMapping(reordered, night), undefined);
        const mapped = await callBridge<WatchMapping>("layout", { scene: reordered, night });
        assert.notEqual(mapped.mapping, original.mapping);
        assert.deepEqual(mapped.scene, reordered);
        assert.deepEqual([...new Set(mapped.ops.map((operation) => operation.elementId))], ids(reordered));
        assert.deepEqual(mapped.areas.map((area) => area.id), ids(reordered));
    }
});

const slots = ["a", "b", "c", "d"].map((id, index) => ({ id, top: 100 + index * 50, height: 44 }));

test("tiles cross insertion midpoints and leave a full tile-sized space", () => {
    assert.equal(layerDragLayout(slots, "b", 24).destination, 1);
    const down = layerDragLayout(slots, "b", 26);
    assert.equal(down.destination, 2);
    assert.deepEqual([...down.shifts], [["a", 0], ["c", -50], ["b", 50], ["d", 0]]);
    const up = layerDragLayout(slots, "c", -76);
    assert.equal(up.destination, 0);
    assert.deepEqual([...up.shifts], [["c", -100], ["a", 50], ["b", 50], ["d", 0]]);
    assert.equal(layerDragLayout(slots, "b", 0).destination, 1);
});

test("pointer movement is clamped to the list and handles a single tile", () => {
    const top = layerDragLayout(slots, "b", -1000);
    assert.equal(top.offset, -50);
    assert.equal(top.destination, 0);
    const bottom = layerDragLayout(slots, "b", 1000);
    assert.equal(bottom.offset, 100);
    assert.equal(bottom.destination, 3);
    assert.equal(layerDragLayout(slots.slice(0, 1), "a", 100).offset, 0);
    assert.equal(layerDragLayout([], "missing", 100).destination, -1);
});

test("unequal tile heights reach every slot without overlap or changing total height", () => {
    const varied = [100, 30, 60, 44].map((height, index, heights) => ({
        id: String(index), height, top: heights.slice(0, index).reduce((total, value) => total + value + 6, 0),
    }));
    for (const source of varied) {
        for (let destination = 0; destination < varied.length; destination++) {
            const remaining = varied.filter((slot) => slot !== source);
            const target = remaining.slice(0, destination).reduce((top, slot) => top + slot.height + 6, 0);
            const layout = layerDragLayout(varied, source.id, target - source.top);
            assert.equal(layout.destination, destination);
            const order = [...remaining];
            order.splice(destination, 0, source);
            let bottom = -6;
            for (const slot of order) {
                const top = slot.top + layout.shifts.get(slot.id)!;
                assert.equal(top, bottom + 6);
                bottom = top + slot.height;
            }
            assert.equal(bottom, 252);
        }
    }
});


test("text backgrounds change each appearance independently without changing layers or glyphs", () => {
    const before = structuredClone(scene);
    const day = setTextBackground(scene, "middle", false, 0x24273a);
    const both = setTextBackground(day, "middle", true, 0);
    assert.deepEqual(ids(both), ids(scene));
    assert.deepEqual(both.elements[1], { ...scene.elements[1], backgroundColour: 0x24273a, nightBackgroundColour: 0 });
    assert.equal(both.elements[0], scene.elements[0]);
    assert.equal(both.elements[2], scene.elements[2]);
    const transparent = setTextBackground(both, "middle", false, undefined);
    assert.equal(Object.hasOwn(transparent.elements[1], "backgroundColour"), false);
    assert.equal(transparent.elements[1].nightBackgroundColour, 0);
    assert.deepEqual(setTextBackground(transparent, "middle", true, undefined), scene);
    assert.deepEqual(scene, before);
});

test("text backgrounds reject invalid colours, missing elements and non-text sources", () => {
    assert.equal(setTextBackground(scene, "missing", false, 0), scene);
    assert.equal(setTextBackground(scene, "middle", false, undefined), scene);
    for (const invalid of [-1, 0x1000000, 0.5, NaN, Infinity]) {
        assert.equal(setTextBackground(scene, "middle", false, invalid), scene);
    }
    for (const source of ["stepsIcon", "secondsRing", "walkWeek", "unknown"]) {
        const other = { ...scene, elements: [{ ...scene.elements[0], source }] };
        assert.equal(setTextBackground(other, other.elements[0].id, false, 0), other);
    }
});

test("background changes invalidate old mappings and travel with text during movement previews", async () => {
    const original = rememberMapping(await callBridge<WatchMapping>("layout", { scene }));
    const opaque = setTextBackground(original.scene, "middle", false, 0x24273a);
    assert.equal(preparedMapping(opaque), undefined);
    const mapped = rememberMapping(await callBridge<WatchMapping>("layout", { scene: opaque }));
    assert.notEqual(mapped.mapping, original.mapping);
    const shifted = { ...mapped.scene, elements: mapped.scene.elements.map((element) => element.id === "middle"
        ? { ...element, x: element.x + 1 } : element) };
    const preview = preparedMapping(shifted)!;
    assert.ok(preview);
    const fill = mapped.ops.find((op) => op.elementId === "middle" && op.kind === "rect")!;
    assert.ok(fill);
    assert.deepEqual(preview.ops.find((op) => op.elementId === "middle" && op.kind === "rect"), { ...fill, x: fill.x + 1 });
    assert.notEqual(preview.mapping, mapped.mapping);
});
