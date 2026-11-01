import test from "node:test";
import assert from "node:assert/strict";
import { callBridge } from "./bridge.ts";
import { devices, type Scene, type WatchMapping } from "../shared/scene.ts";
import { scene as initialScene } from "../src/watch/scene.ts";
import { preparedMapping, rememberMapping } from "../src/watch/mapping-cache.ts";
import { moveSceneElement } from "../src/watch/snapping.ts";

test("icons move immediately with canonical day and night pixels on every device", async (context) => {
    context.mock.method(globalThis, "fetch", () => { throw new Error("Icon movement must not fetch."); });
    for (const device of Object.keys(devices) as Array<keyof typeof devices>) {
        for (const source of ["temperatureIcon", "highLowIcon", "sunriseSunsetIcon", "heartIcon", "floorsIcon", "stepsIcon", "walkIcon", "runIcon"]) {
            for (const night of [false, true]) {
                const scene: Scene = { ...initialScene, name: `Live ${source} ${device}`, device, edgeInset: undefined,
                    elements: [
                        { ...initialScene.elements[0], id: "icon", source, font: "widget", x: 90, y: 140, width: 30, height: 30 },
                        { ...initialScene.elements[0], id: "overlap", x: 95, y: 145, width: 60, height: 40, boxSizing: "fixed" },
                    ] };
                const original = rememberMapping(await callBridge<WatchMapping>("layout", { scene, night }), night);
                assert.ok(original.ops.some((operation) => operation.kind === "rect" && operation.elementId === "icon"));
                const moved = moveSceneElement(original.scene, "icon", { x: 170, y: 200 }, { enabled: false, showGuideLines: false });
                const local = preparedMapping(moved, night);
                assert.ok(local, `${source} ${device} ${night ? "night" : "day"}`);
                assert.match(local.mapping, /^preview:/);
                const canonical = await callBridge<WatchMapping>("layout", { scene: moved, night });
                assert.deepEqual({ ...local, mapping: canonical.mapping }, canonical);
                assert.deepEqual(local.ops.filter((operation) => operation.elementId === "overlap"),
                    original.ops.filter((operation) => operation.elementId === "overlap"));
            }
        }
    }
});

test("linked icon and data move immediately while the graph stays put", async () => {
    const original = rememberMapping(await callBridge<WatchMapping>("add", {
        scene: { ...initialScene, name: "Live linked activity", elements: [] },
        source: "steps", options: { value: true, icon: true, graph: true },
    }));
    const icon = original.scene.elements.find((element) => element.source === "stepsIcon")!;
    const moved = moveSceneElement(original.scene, icon.id, { x: icon.x + 15, y: icon.y + 20 },
        { enabled: false, showGuideLines: false });
    assert.notDeepEqual(moved, original.scene);
    const graph = original.scene.elements.find((element) => element.source === "stepsWeek")!;
    assert.equal(moved.elements.find((element) => element.id === graph.id), graph);
    const local = preparedMapping(moved);
    assert.ok(local);
    const canonical = await callBridge<WatchMapping>("layout", { scene: moved });
    assert.deepEqual({ ...local, mapping: canonical.mapping }, canonical);
});

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
