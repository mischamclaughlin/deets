import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ViteDevServer } from "vite";
import { garmin } from "./garmin.ts";
import { scene } from "../src/watch/scene.ts";
import type { WatchMapping } from "../shared/scene.ts";

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

async function requestApi(path: string, chunks: Buffer[], headers: Record<string, string> = {}, method = "POST") {
    let middleware: Middleware | undefined;
    const plugin = garmin();
    const install = plugin.configureServer;
    assert.equal(typeof install, "function");
    if (typeof install !== "function") throw new Error("Missing Vite middleware.");
    await install.call({} as never, {
        middlewares: { use: (handler: Middleware) => { middleware = handler; } },
        httpServer: { address: () => ({ port: 5173 }) },
        config: { server: { port: 5173 } },
    } as unknown as ViteDevServer);
    assert.ok(middleware);
    const request = Readable.from(chunks) as IncomingMessage;
    request.url = path;
    request.method = method;
    request.headers = {
        host: "127.0.0.1:5173",
        origin: "http://127.0.0.1:5173",
        "content-type": "application/octet-stream",
        "x-font-name": encodeURIComponent("My font.ttf"),
        ...headers,
    };
    return new Promise<{ status: number; headers: Record<string, string>; body: Record<string, unknown> }>((resolve) => {
        let status = 200;
        let responseHeaders: Record<string, string> = {};
        const response = {
            headersSent: false,
            writeHead(code: number, values: Record<string, string>) {
                status = code;
                responseHeaders = values;
                this.headersSent = true;
            },
            end(text: string) {
                resolve({ status, headers: responseHeaders, body: text ? JSON.parse(text) : {} });
            },
        };
        middleware!(request, response as unknown as ServerResponse, () => resolve({ status: 404, headers: {}, body: {} }));
    });
}

test("font uploads use content-addressed local files and return filename metadata", async () => {
    const bytes = Buffer.concat([Buffer.from([0, 1, 0, 0]), randomBytes(32)]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const path = join(tmpdir(), "deets-fonts-v1", `${digest}.font`);
    try {
        const result = await requestApi("/api/garmin/font", [bytes.subarray(0, 9), bytes.subarray(9)]);
        assert.equal(result.status, 200);
        assert.deepEqual(result.body, { id: `upload:${digest}`, name: "My font.ttf" });
        assert.equal(result.headers["Cache-Control"], "no-store");
        assert.deepEqual(await readFile(path), bytes);
    } finally {
        await unlink(path).catch(() => undefined);
    }
});

test("font uploads preserve host and origin restrictions", async () => {
    assert.equal((await requestApi("/api/garmin/font", [], { host: "attacker.example" })).status, 403);
    assert.equal((await requestApi("/api/garmin/font", [], { origin: "https://attacker.example" })).status, 403);
    assert.equal((await requestApi("/api/garmin/font", [], { origin: "" })).status, 403);
    assert.equal((await requestApi("/api/garmin/font", [], {}, "GET")).status, 405);
});

test("font uploads reject untrusted names, file formats and oversized streams", async () => {
    assert.equal((await requestApi("/api/garmin/font", [], { "content-type": "application/json" })).status, 415);
    for (const name of ["../escape.ttf", "sub/font.ttf", "sub\\font.ttf", "bad\u0000.ttf", "%", "", "a".repeat(256) + ".ttf"]) {
        const result = await requestApi("/api/garmin/font", [], { "x-font-name": name === "%" ? name : encodeURIComponent(name) });
        assert.equal(result.status, 400, name);
    }
    assert.equal((await requestApi("/api/garmin/font", [], { "x-font-name": "image.png" })).status, 415);
    assert.equal((await requestApi("/api/garmin/font", [Buffer.from("not a font file")])).status, 400);
    assert.equal((await requestApi("/api/garmin/font", [], { "content-length": String(5 * 1024 * 1024 + 1) })).status, 413);
    assert.equal((await requestApi("/api/garmin/font", [Buffer.alloc(3 * 1024 * 1024), Buffer.alloc(3 * 1024 * 1024)])).status, 413);
});

test("typography requests retain JSON scene limits and reject unsupported fields", async () => {
    const headers = { "content-type": "application/json" };
    for (const payload of [{ scene: {} }, { scene: {}, elementId: "time", typography: {}, unexpected: true }]) {
        const result = await requestApi("/api/garmin/typography", [Buffer.from(JSON.stringify(payload))], headers);
        assert.equal(result.status, 400);
        assert.match(String(result.body.error), /unsupported or missing/);
    }
    const oversized = await requestApi("/api/garmin/typography", [Buffer.alloc(65_537, 32)], headers);
    assert.equal(oversized.status, 400);
    assert.match(String(oversized.body.error), /request limit/);
});


test("typography API generates canonical clock pixels from an included or uploaded font", async (context) => {
    const families = ["time"];
    const systemFont = "/System/Library/Fonts/Supplemental/Arial.ttf";
    let uploadedPath: string | undefined;
    try {
        const bytes = await readFile(systemFont).catch(() => undefined);
        if (!bytes) { context.skip("No system TTF fixture is available."); return; }
        const cachePath = join(tmpdir(), "deets-fonts-v1", `${createHash("sha256").update(bytes).digest("hex")}.font`);
        const existed = await readFile(cachePath).then(() => true, () => false);
        const uploaded = await requestApi("/api/garmin/font", [bytes], { "x-font-name": "Arial.ttf" });
        assert.equal(uploaded.status, 200);
        const id = String(uploaded.body.id);
        families.push(id);
        if (!existed) uploadedPath = cachePath;
        for (const family of families) {
            const typography = { family, size: 60, thickness: 1, width: 110, letterSpacing: 2 };
            const result = await requestApi("/api/garmin/typography", [Buffer.from(JSON.stringify({ scene: { ...scene, elements: scene.elements.map((element) => ({ ...element, inheritFont: false })) }, elementId: "time", typography }))], { "content-type": "application/json" });
            assert.equal(result.status, 200, JSON.stringify(result.body));
            const mapped = result.body as unknown as WatchMapping;
            const clock = mapped.scene.elements[0];
            assert.deepEqual(clock.typography, typography);
            assert.equal(clock.height, 60);
            assert.match(clock.font, /^generated:[a-f0-9]{64}$/);
            assert.ok(mapped.assets[clock.font]?.startsWith("data:image/png;base64,"));
            assert.equal(mapped.ops.length, 5);
        }
    } finally {
        if (uploadedPath) await unlink(uploadedPath).catch(() => undefined);
    }
});


test("clock display API switches between combined time, hours and minutes", async () => {
    let current = scene;
    for (const source of ["hours", "minutes", "time"]) {
        const payload = { scene: current, elementId: "time", source };
        const result = await requestApi("/api/garmin/clock", [Buffer.from(JSON.stringify(payload))], { "content-type": "application/json" });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const mapped = result.body as unknown as WatchMapping;
        current = mapped.scene;
        assert.equal(current.elements[0].source, source);
        assert.equal(mapped.ops.length, source === "time" ? 5 : 2);
        assert.ok(Math.abs(current.elements[0].x + current.elements[0].width / 2 - 208) <= 0.5);
    }
    const invalid = await requestApi("/api/garmin/clock", [Buffer.from(JSON.stringify({ scene, elementId: "time", source: "date" }))], { "content-type": "application/json" });
    assert.equal(invalid.status, 400);
});


test("add-time API appends independent elements without replacing existing clocks", async () => {
    let current = scene;
    for (let count = 2; count <= 3; count++) {
        const result = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene: current, source: "time" }))], { "content-type": "application/json" });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const mapped = result.body as unknown as WatchMapping;
        assert.deepEqual(mapped.scene.elements.slice(0, -1), current.elements);
        assert.equal(mapped.scene.elements.length, count);
        assert.equal(mapped.scene.elements.at(-1)?.id, `time-${count}`);
        assert.equal(mapped.ops.length, count * 5);
        current = mapped.scene;
    }
});

test("watch fonts resolve inherited clocks and inheritance requests keep strict bounds", async () => {
    const headers = { "content-type": "application/json" };
    const changed = await requestApi("/api/garmin/watch-font", [Buffer.from(JSON.stringify({ scene, family: "widget" }))], headers);
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const current = (changed.body as unknown as WatchMapping).scene;
    assert.equal(current.fontFamily, "widget");
    assert.equal(current.elements[0].typography?.family, "widget");
    assert.equal(current.elements[0].inheritFont, true);
    const custom = await requestApi("/api/garmin/inherit-font", [Buffer.from(JSON.stringify({ scene: current, elementId: "time", inherit: false }))], headers);
    assert.equal(custom.status, 200, JSON.stringify(custom.body));
    assert.equal((custom.body as unknown as WatchMapping).scene.elements[0].inheritFont, false);
    for (const [path, payload] of [
        ["watch-font", { scene }],
        ["watch-font", { scene, family: "../../font" }],
        ["inherit-font", { scene, elementId: "time" }],
        ["inherit-font", { scene, elementId: "time", inherit: "yes" }],
    ] as const) {
        const result = await requestApi(`/api/garmin/${path}`, [Buffer.from(JSON.stringify(payload))], headers);
        assert.equal(result.status, 400);
    }
    assert.equal((await requestApi("/api/garmin/watch-font", [], { host: "attacker.example" })).status, 403);
    assert.equal((await requestApi("/api/garmin/inherit-font", [], { origin: "https://attacker.example" })).status, 403);
});
