import test from "node:test";
import assert from "node:assert/strict";
import { createHistory, recordHistory, redoHistory, selectElement, undoHistory } from "../src/watch/history.ts";
import { applyBatchPreset } from "../src/watch/batch-presets.ts";
import { scene } from "../src/watch/scene.ts";

test("undo and redo restore full snapshots and a new edit clears redo", () => {
    const original = { scene: { background: 0, elements: ["time"] }, grid: { visible: false } };
    const edited = { scene: { background: 123, elements: ["time", "date"] }, grid: { visible: true } };
    const history = recordHistory(createHistory(original), edited);
    const undone = undoHistory(history);
    assert.deepEqual(undone.present, original);
    assert.deepEqual(redoHistory(undone).present, edited);
    assert.equal(recordHistory(undone, { ...original, grid: { visible: true } }).future.length, 0);
    assert.equal(undoHistory(createHistory(original)).present, original);
    assert.equal(recordHistory(history, structuredClone(edited)), history);
});

test("history retains the latest 100 edits", () => {
    let history = createHistory(0);
    for (let index = 1; index <= 120; index++) history = recordHistory(history, index);
    for (let index = 0; index < 100; index++) history = undoHistory(history);
    assert.equal(history.present, 20);
    assert.equal(history.past.length, 0);
    for (let index = 0; index < 100; index++) history = redoHistory(history);
    assert.equal(history.present, 120);
});

test("Shift selection toggles individual elements and normal selection replaces", () => {
    assert.deepEqual(selectElement(["time"], "date", true), ["time", "date"]);
    assert.deepEqual(selectElement(["time", "date"], "time", true), ["date"]);
    assert.deepEqual(selectElement(["time", "date"], "steps"), ["steps"]);
    assert.deepEqual(selectElement(["time"], undefined, true), []);
});

test("a batch chains native validation and returns one complete snapshot", async (context) => {
    const original = { ...structuredClone(scene), elements: Array.from({ length: 3 }, (_, index) => ({ ...structuredClone(scene.elements[0]), id: `element-${index}` })) };
    const selected = original.elements.slice(0, 2).map((element) => element.id);
    assert.equal(selected.length, 2);
    const requests: { scene: typeof scene; elementId: string }[] = [];
    context.mock.method(globalThis, "fetch", async (_path: string, options: RequestInit) => {
        const payload = JSON.parse(options.body as string);
        requests.push(payload);
        return Response.json({ scene: { ...payload.scene, elements: payload.scene.elements.map((element: { id: string }) =>
            element.id === payload.elementId ? { ...element, colourPresetId: "rose" } : element) } });
    });
    const result = await applyBatchPreset(original, selected, { kind: "colour", channel: "day", presetId: "rose" });
    assert.equal(requests.length, 2);
    assert.equal(requests[1].scene.elements.find((element) => element.id === selected[0])!.colourPresetId, "rose");
    assert.ok(result.elements.filter((element) => selected.includes(element.id)).every((element) => element.colourPresetId === "rose"));
    assert.equal(original.elements[0].colourPresetId, undefined);
});

test("batch failures and cancellation never publish partial changes", async (context) => {
    const original = { ...structuredClone(scene), elements: Array.from({ length: 3 }, (_, index) => ({ ...structuredClone(scene.elements[0]), id: `element-${index}` })) };
    let calls = 0;
    context.mock.method(globalThis, "fetch", async (_path: string, options: RequestInit) => {
        calls++;
        return calls === 1 ? Response.json({ scene: JSON.parse(options.body as string).scene })
            : Response.json({ error: "Invalid preset" }, { status: 400 });
    });
    await assert.rejects(applyBatchPreset(original, original.elements.slice(0, 2).map((element) => element.id),
        { kind: "colour", channel: "night", presetId: "missing" }), /Invalid preset/);
    assert.equal(original.elements[0].colourPresetId, undefined);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(applyBatchPreset(original, [original.elements[0].id], { kind: "colour", channel: "day", presetId: null }, controller.signal), /abort/i);
    assert.equal(calls, 2);
});

test("text batches skip selected charts and icons", async (context) => {
    const original = { ...structuredClone(scene), elements: Array.from({ length: 3 }, (_, index) => ({ ...structuredClone(scene.elements[0]), id: `element-${index}` })) };
    original.elements = original.elements.slice(0, 3).map((element, index) => ({ ...element,
        source: ["time", "heartZones", "heartIcon"][index] }));
    const fetch = context.mock.method(globalThis, "fetch", async (_path: string, options: RequestInit) =>
        Response.json({ scene: JSON.parse(options.body as string).scene }));
    await applyBatchPreset(original, original.elements.map((element) => element.id), { kind: "text", presetId: null });
    assert.equal(fetch.mock.callCount(), 1);
});
