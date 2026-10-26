import test from "node:test";
import assert from "node:assert/strict";
import { callBridge, GarminError } from "./bridge.ts";
import { populatedScene as scene } from "./scene.fixture.ts";
import { scene as initialScene } from "../src/watch/scene.ts";
import { moveElement } from "../src/watch/snapping.ts";
import { devices } from "../shared/scene.ts";
import type { WatchMapping } from "../shared/scene.ts";

const blankScene = { ...initialScene, elements: [] };

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


test("snapped positions round-trip the native validator on every device", async () => {
    for (const device of Object.keys(devices) as Array<keyof typeof devices>) {
        const original = {
            ...blankScene,
            device,
            elements: [{
                ...scene.elements[1], id: "activity", source: "stepsWeek", font: "widget" as const,
                x: 150, y: 150, width: 100, height: 18,
            }],
        };
        const element = original.elements[0];
        const position = moveElement(original, element, { x: 157, y: 205 }, {
            enabled: true, showGuideLines: true, showCircumference: true,
        });
        const moved = { ...original, elements: [{ ...element, ...position }] };
        const mapped = await callBridge<WatchMapping>("layout", { scene: moved });
        assert.deepEqual(mapped.scene, moved);
        assert.equal(mapped.areas[0].x, position.x);
        assert.equal(mapped.areas[0].y, position.y);
        assert.ok(mapped.ops.length > 0);
    }
});


test("initial HH:MM time uses native glyphs and is centred on both axes", async () => {
    const layout = await callBridge<WatchMapping>("layout", { scene: initialScene });
    assert.deepEqual(layout.scene, initialScene);
    assert.equal(layout.areas.length, 1);
    const area = layout.areas[0];
    assert.equal(area.source, "time");
    assert.equal(area.x + area.width / 2, layout.size / 2);
    assert.equal(area.y + area.height / 2, layout.size / 2);
    assert.equal(layout.ops.length, 5);
    assert.ok(layout.ops.every((op) => op.kind === "bitmap" && op.elementId === "time"));
    const shifted = moveElement(initialScene, initialScene.elements[0], { x: 91, y: 167 }, {
        enabled: true, showGuideLines: true, showCircumference: true,
    });
    assert.deepEqual(shifted, { x: 88, y: 164 });
});
