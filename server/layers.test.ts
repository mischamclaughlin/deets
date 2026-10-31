import test from "node:test";
import assert from "node:assert/strict";
import { callBridge } from "./bridge.ts";
import type { Scene, WatchMapping } from "../shared/scene.ts";
import { scene as initialScene } from "../src/watch/scene.ts";
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
