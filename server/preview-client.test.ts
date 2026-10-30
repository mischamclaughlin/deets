/// <reference lib="dom" />
import test from "node:test";
import assert from "node:assert/strict";
import { previewWatch, setElementColour } from "../src/watch/api.ts";
import { paintWatch } from "../src/watch/raster.ts";
import { scene } from "../src/watch/scene.ts";
import type { WatchMapping } from "../shared/scene.ts";

test("a settings response supplies preview pixels without a second layout request", async (context) => {
    const changed = { ...scene, name: "Colour response reuse" };
    const mapping: WatchMapping = { scene: changed, mapping: "canonical", size: 416,
        background: 0, ops: [], areas: [], assets: {} };
    const fetch = context.mock.method(globalThis, "fetch", async () => Response.json(mapping));
    const response = await setElementColour(scene, "time", "day", 0xffffff);
    assert.equal(await previewWatch(response.scene), response);
    assert.equal(fetch.mock.callCount(), 1);
});

test("prepared font masks repaint synchronously without creating or decoding another image", async (context) => {
    const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    context.after(() => {
        if (originalImage) Object.defineProperty(globalThis, "Image", originalImage);
        else Reflect.deleteProperty(globalThis, "Image");
        if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
        else Reflect.deleteProperty(globalThis, "document");
    });
    let decodes = 0;
    let images = 0;
    let copies = 0;
    let fail = false;
    class Mask {
        src = "";
        naturalWidth = 10;
        naturalHeight = 10;
        constructor() { images++; }
        async decode() { decodes++; if (fail) throw new Error("Decode failed"); }
    }
    const context2d = { fillRect() {}, drawImage() { copies++; } };
    const makeCanvas = () => ({ width: 0, height: 0, getContext: () => context2d });
    Object.defineProperty(globalThis, "Image", { value: Mask, configurable: true });
    Object.defineProperty(globalThis, "document", { value: { createElement: makeCanvas }, configurable: true });
    const canvas = makeCanvas() as unknown as HTMLCanvasElement;
    const mapping: WatchMapping = { scene, mapping: "mask-reuse", size: 416, background: 0,
        assets: { time: "data:image/png;base64,mask-reuse" }, areas: [], ops: [
            { kind: "bitmap", font: "time", elementId: "time", colour: 0xffffff,
                x: 1, y: 1, sx: 0, sy: 0, width: 10, height: 10 },
        ] };
    const signal = new AbortController().signal;
    await paintWatch(canvas, mapping, signal);
    assert.equal(images, 1);
    assert.equal(decodes, 1);
    const before = copies;
    const repaint = paintWatch(canvas, mapping, signal);
    assert.ok(copies > before, "prepared pixels must paint before the promise resolves");
    await repaint;
    assert.equal(images, 1);
    assert.equal(decodes, 1);
    const cancelled = new AbortController();
    cancelled.abort();
    const beforeCancel = copies;
    await paintWatch(canvas, mapping, cancelled.signal);
    assert.equal(copies, beforeCancel);
    fail = true;
    const retry = { ...mapping, assets: { time: "data:image/png;base64,retry-mask" } };
    await assert.rejects(paintWatch(canvas, retry, signal), /Decode failed/);
    fail = false;
    await paintWatch(canvas, retry, signal);
    assert.equal(decodes, 3, "a failed mask must be decoded again on retry");
});
