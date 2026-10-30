import test from "node:test";
import assert from "node:assert/strict";
import { callBridge } from "./bridge.ts";
import { devices, type Scene, type WatchMapping } from "../shared/scene.ts";
import { scene as initialScene } from "../src/watch/scene.ts";
import { preparedMapping, rememberMapping } from "../src/watch/mapping-cache.ts";

test("prepared movement matches canonical clipped pixels on every device without fetching", async (context) => {
    context.mock.method(globalThis, "fetch", () => { throw new Error("Movement must not fetch."); });
    for (const device of Object.keys(devices) as Array<keyof typeof devices>) {
        const scene: Scene = {
            ...initialScene, name: `Movement ${device}`, device, edgeInset: undefined,
            elements: [{ ...initialScene.elements[0], x: 20, y: 20, width: 60, height: 40, boxSizing: "fixed" }],
        };
        const original = rememberMapping(await callBridge<WatchMapping>("layout", { scene }));
        assert.equal(preparedMapping(original.scene), original);
        const moved: Scene = { ...original.scene, elements: original.scene.elements.map((element) =>
            ({ ...element, x: devices[device] - element.width, y: devices[device] - element.height })) };
        const local = preparedMapping(moved);
        assert.ok(local);
        assert.match(local.mapping, /^preview:/);
        const canonical = await callBridge<WatchMapping>("layout", { scene: moved });
        assert.deepEqual({ ...local, mapping: canonical.mapping }, canonical);
        assert.equal(preparedMapping(moved), local);
    }
});

test("prepared mapping reuses exact mutation responses and separates day and night", () => {
    const scene = { ...initialScene, name: "Exact response cache" };
    const mapping: WatchMapping = { scene, size: 416, background: 0, mapping: "canonical", assets: {}, areas: [], ops: [] };
    assert.equal(rememberMapping(mapping), mapping);
    assert.equal(preparedMapping(scene), mapping);
    assert.equal(preparedMapping(scene, true), undefined);
    const night = { ...mapping, mapping: "night" };
    rememberMapping(night, true);
    assert.equal(preparedMapping(scene, true), night);
    assert.equal(preparedMapping(scene), mapping);
});

test("prepared movement rejects geometry changes, unknown owners, invalid bounds and rings", () => {
    const scene: Scene = { ...initialScene, name: "Strict translation", elements: [{ ...initialScene.elements[0] }] };
    const mapping: WatchMapping = { scene, size: 416, background: 0, mapping: "canonical", assets: {}, areas: [], ops: [] };
    rememberMapping(mapping);
    const change = (properties: Partial<Scene["elements"][number]>) =>
        ({ ...scene, elements: [{ ...scene.elements[0], ...properties }] });
    assert.equal(preparedMapping(change({ width: 239 })), undefined);
    assert.equal(preparedMapping(change({ align: "right" })), undefined);
    assert.equal(preparedMapping({ ...scene, device: "epix2pro42mm" }), undefined);
    assert.equal(preparedMapping(change({ x: -1 })), undefined);
    assert.equal(preparedMapping(change({ x: 88.5 })), undefined);
    assert.equal(preparedMapping(change({ x: 175 })), undefined);
    const cloned = structuredClone(scene);
    assert.ok(preparedMapping(cloned));
    const ring: Scene = { ...scene, name: "Anchored ring", elements: [{ ...scene.elements[0], source: "secondsRing" }] };
    rememberMapping({ ...mapping, scene: ring });
    assert.equal(preparedMapping({ ...ring, elements: [{ ...ring.elements[0], x: 89 }] }), undefined);
    rememberMapping({ ...mapping, ops: [{ kind: "rect", x: 0, y: 0, width: 1, height: 1, colour: 0 }] });
    assert.equal(preparedMapping(change({ x: 89 })), undefined);
    rememberMapping({ ...mapping, ops: [{ kind: "bitmap", elementId: "unknown", font: "time", x: 0, y: 0,
        sx: 0, sy: 0, width: 1, height: 1, colour: 0 }] });
    assert.equal(preparedMapping(change({ x: 90 })), undefined);
});
