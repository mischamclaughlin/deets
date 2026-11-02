import test from "node:test";
import assert from "node:assert/strict";
import { exportGarmin } from "../src/watch/api.ts";
import { defaultGrid } from "../src/watch/grid.ts";
import { scene } from "../src/watch/scene.ts";

test("export keeps the clicked scene snapshot and uses its validated mapping", async (context) => {
    const current = structuredClone(scene);
    const original = structuredClone(current);
    const mappedScene = { ...original, edgeInset: 7 };
    const controller = new AbortController();
    const requests: { path: string; payload: unknown }[] = [];
    const bytes = new Uint8Array([1, 3, 7, 9]);
    context.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
        requests.push({ path, payload: JSON.parse(options.body as string) });
        assert.equal(options.method, "POST");
        assert.equal(options.signal, controller.signal);
        if (path.endsWith("/layout")) {
            // Editing can continue while the mapping request is in flight.
            current.edgeInset = 99;
            return Response.json({ scene: mappedScene, mapping: "validated-token" });
        }
        return new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } });
    });

    const result = await exportGarmin(current, controller.signal);

    assert.deepEqual(requests, [
        { path: "/api/garmin/layout", payload: { scene: original, night: false } },
        { path: "/api/garmin/export", payload: { scene: mappedScene, mapping: "validated-token" } },
    ]);
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
});

test("a rejected mapping prevents compilation", async (context) => {
    const fetch = context.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: "The scene is invalid." }, { status: 400 }));
    await assert.rejects(exportGarmin(scene), /The scene is invalid\./);
    assert.equal(fetch.mock.callCount(), 1);
});

test("compiler failures reach the caller instead of becoming a download", async (context) => {
    context.mock.method(globalThis, "fetch", async (path: string) => path.endsWith("/layout")
        ? Response.json({ scene, mapping: "validated-token" })
        : Response.json({ error: "A Garmin export is already running." }, { status: 409 }));
    await assert.rejects(exportGarmin(scene), /A Garmin export is already running\./);
});

test("editable exports capture the clicked grid independently of ongoing edits", async (context) => {
    const grid = { ...defaultGrid, visible: true, edits: { 'rows-1': 0.2 } };
    const original = structuredClone(grid);
    let exported: unknown;
    context.mock.method(globalThis, "fetch", async (path: string, options: RequestInit) => {
        if (path.endsWith("/layout")) {
            grid.edits['rows-1'] = 0.8;
            return Response.json({ scene, mapping: "validated-token" });
        }
        exported = JSON.parse(options.body as string);
        return new Response(new Uint8Array([1, 2, 3]));
    });
    await exportGarmin(scene, undefined, grid);
    assert.deepEqual(exported, { scene, mapping: "validated-token", grid: original });
});
