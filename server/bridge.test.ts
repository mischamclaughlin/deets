import test from "node:test";
import assert from "node:assert/strict";
import { callBridge, GarminError } from "./bridge.ts";
import { populatedScene as scene } from "./scene.fixture.ts";
import { scene as blankScene } from "../src/watch/scene.ts";
import type { WatchMapping } from "../shared/scene.ts";

test("native mapping round-trips the typed scene and exposes exact element bounds", async () => {
    const layout = await callBridge<WatchMapping>("layout", { scene });
    assert.deepEqual(layout.scene, scene);
    assert.equal(layout.size, 416);
    assert.equal(layout.areas.length, scene.elements.length);
    for (const element of scene.elements) {
        const area = layout.areas.find((area) => area.id === element.id);
        assert.ok(area);
        assert.equal(area.source, element.source);
        for (const dimension of ["x", "y", "width", "height"] as const)
            assert.equal(area[dimension], element[dimension]);
    }
    assert.ok(layout.ops.some((operation) => operation.kind === "bitmap"));
    assert.ok(layout.ops.some((operation) => operation.kind === "rect"));
    assert.match(layout.mapping, /^[a-f0-9]{64}$/);
    assert.ok(layout.assets.time?.startsWith("data:image/png;base64,"));
});

test("invalid and stale scenes cannot reach Garmin compilation", async () => {
    const invalid = structuredClone(scene);
    invalid.elements[1].x = -1;
    await assert.rejects(callBridge("layout", { scene: invalid }), GarminError);
    await assert.rejects(
        callBridge("export", { scene, mapping: "stale" }),
        /render the canvas again/,
    );
});

test("layout and asset changes invalidate the mapping token", async () => {
    const original = await callBridge<WatchMapping>("layout", { scene });
    const changed = structuredClone(scene);
    changed.elements[1].x++;
    const updated = await callBridge<WatchMapping>("layout", {
        scene: changed,
    });
    assert.notEqual(original.mapping, updated.mapping);
    assert.equal(updated.areas.find((area) => area.id === "time")?.x, 33);
});


test("blank canvas preserves its circumference without adding exported ink", async () => {
    const layout = await callBridge<WatchMapping>("layout", { scene: blankScene });
    assert.deepEqual(layout.scene, blankScene);
    assert.deepEqual(layout.ops, []);
    assert.deepEqual(layout.areas, []);
    const updated = await callBridge<WatchMapping>("layout", {
        scene: { ...blankScene, edgeInset: 32 },
    });
    assert.notEqual(updated.mapping, layout.mapping);
    assert.deepEqual(updated.ops, []);
});
