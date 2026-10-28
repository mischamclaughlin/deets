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


test("clock display API switches between combined time, hours, minutes and seconds", async () => {
    let current = scene;
    for (const source of ["hours", "minutes", "seconds", "timeSeconds", "time"]) {
        const payload = { scene: current, elementId: "time", source };
        const result = await requestApi("/api/garmin/clock", [Buffer.from(JSON.stringify(payload))], { "content-type": "application/json" });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const mapped = result.body as unknown as WatchMapping;
        current = mapped.scene;
        assert.equal(current.elements[0].source, source);
        assert.equal(mapped.ops.length, source === "time" ? 5 : source === "timeSeconds" ? 8 : 2);
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

test("layout API positions divider ink within its native box and rejects invalid positions", async () => {
    const headers = { "content-type": "application/json" };
    const response = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene: { ...scene, elements: [] }, source: "divider" }))], headers);
    assert.equal(response.status, 200);
    const divider = (response.body as unknown as WatchMapping).scene;
    const element = divider.elements[0];
    const positions = [];
    for (const dividerPosition of ["top", "middle", "bottom"] as const) {
        const changed = { ...divider, elements: [{ ...element, dividerPosition }] };
        const result = await requestApi("/api/garmin/layout", [Buffer.from(JSON.stringify({ scene: changed }))], headers);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const mapped = result.body as unknown as WatchMapping;
        const ink = mapped.ops[0];
        assert.equal(mapped.scene.elements[0].dividerPosition, dividerPosition);
        assert.equal(ink.y, element.y + (dividerPosition === "top" ? 0 : dividerPosition === "bottom"
            ? element.height - ink.height : Math.floor((element.height - ink.height) / 2)));
        positions.push(ink.y);
    }
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
    const invalid = { ...divider, elements: [{ ...element, dividerPosition: "outside" }] };
    assert.equal((await requestApi("/api/garmin/layout", [Buffer.from(JSON.stringify({ scene: invalid }))], headers)).status, 400);
});

test("seconds switch between digits and the full outer ring without replacing clocks", async () => {
    const headers = { "content-type": "application/json" };
    let current = scene;
    for (const source of ["seconds", "secondsRing", "seconds", "secondsRing", "time"]) {
        const result = await requestApi("/api/garmin/clock", [Buffer.from(JSON.stringify({ scene: current, elementId: "time", source }))], headers);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const mapped = result.body as unknown as WatchMapping;
        const element = mapped.scene.elements[0];
        assert.equal(element.id, "time");
        assert.equal(element.source, source);
        if (source === "secondsRing") {
            assert.deepEqual([element.x, element.y, element.width, element.height], [0, 0, 416, 416]);
            assert.ok(mapped.ops.length > 60);
            assert.ok(mapped.ops.every((op) => op.kind === "rect"));
        } else {
            assert.equal(mapped.ops.length, source === "time" ? 5 : source === "timeSeconds" ? 8 : 2);
        }
        current = mapped.scene;
    }
});

test("seconds tick outer tips follow edge clearance and retain their inward lengths", async () => {
    const headers = { "content-type": "application/json" };
    const response = await requestApi("/api/garmin/clock", [Buffer.from(JSON.stringify({ scene, elementId: "time", source: "secondsRing" }))], headers);
    assert.equal(response.status, 200);
    const ring = (response.body as unknown as WatchMapping).scene;
    for (const edgeInset of [40, 60]) {
        const design = { ...ring, edgeInset, elements: [{ ...ring.elements[0], ringTicksToCircumference: true }] };
        const result = await requestApi("/api/garmin/layout", [Buffer.from(JSON.stringify({ scene: design }))], headers);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const mapped = result.body as unknown as WatchMapping;
        assert.equal(mapped.scene.elements[0].ringTicksToCircumference, true);
        const topTick = mapped.ops.filter((op) => op.x <= 208 && op.x + op.width > 208 && op.y > 4 && op.y < 100);
        assert.equal(Math.min(...topTick.map((op) => op.y)), edgeInset);
        assert.equal(Math.max(...topTick.map((op) => op.y + op.height)), edgeInset + 15);
    }
    const invalid = { ...ring, elements: [{ ...ring.elements[0], ringTicksToCircumference: "yes" }] };
    assert.equal((await requestApi("/api/garmin/layout", [Buffer.from(JSON.stringify({ scene: invalid }))], headers)).status, 400);
});

test("stretched seconds ticks keep outer tips fixed and reach clearance inwards", async () => {
    const headers = { "content-type": "application/json" };
    const response = await requestApi("/api/garmin/clock", [Buffer.from(JSON.stringify({ scene, elementId: "time", source: "secondsRing" }))], headers);
    assert.equal(response.status, 200);
    const ring = (response.body as unknown as WatchMapping).scene;
    for (const edgeInset of [40, 60]) {
        const design = { ...ring, edgeInset, elements: [{ ...ring.elements[0], ringTicksStretchToCircumference: true }] };
        const result = await requestApi("/api/garmin/layout", [Buffer.from(JSON.stringify({ scene: design }))], headers);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const mapped = result.body as unknown as WatchMapping;
        assert.equal(mapped.scene.elements[0].ringTicksStretchToCircumference, true);
        const topTick = mapped.ops.filter((op) => op.x <= 208 && op.x + op.width > 208 && op.y < 100);
        assert.equal(Math.min(...topTick.map((op) => op.y)), 4);
        assert.equal(Math.max(...topTick.map((op) => op.y + op.height)), edgeInset);
    }
    for (const flags of [
        { ringTicksStretchToCircumference: "yes" },
        { ringTicksStretchToCircumference: true, ringTicksToCircumference: true },
    ]) {
        const invalid = { ...ring, elements: [{ ...ring.elements[0], ...flags }] };
        assert.equal((await requestApi("/api/garmin/layout", [Buffer.from(JSON.stringify({ scene: invalid }))], headers)).status, 400);
    }
});

test("library dividers are independent elements with native symbol choices", async () => {
    const headers = { "content-type": "application/json" };
    const response = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene, source: "divider" }))], headers);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    let current = (response.body as unknown as WatchMapping).scene;
    assert.deepEqual(current.elements[0], scene.elements[0]);
    const identity = current.elements[1].id;
    assert.equal(current.elements[1].source, "divider");
    assert.equal(current.elements[1].inheritFont, true);
    for (const symbol of [":", ".", "-", "/", "|"]) {
        const result = await requestApi("/api/garmin/divider", [Buffer.from(JSON.stringify({ scene: current, elementId: identity, symbol }))], headers);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const mapped = result.body as unknown as WatchMapping;
        assert.equal(mapped.scene.elements[1].dividerSymbol, symbol);
        assert.deepEqual(mapped.scene.elements[0], scene.elements[0]);
        assert.equal(mapped.ops.filter((op) => op.kind === "bitmap" && op.elementId === identity).length, 1);
        current = mapped.scene;
    }
    for (const payload of [
        { scene: current, elementId: identity, symbol: "unsupported" },
        { scene: current, elementId: "time", symbol: ":" },
    ]) {
        assert.equal((await requestApi("/api/garmin/divider", [Buffer.from(JSON.stringify(payload))], headers)).status, 400);
    }
    assert.equal((await requestApi("/api/garmin/clock", [Buffer.from(JSON.stringify({ scene: current, elementId: "time", source: "divider" }))], headers)).status, 400);
    assert.equal((await requestApi("/api/garmin/divider", [], { origin: "https://attacker.example" })).status, 403);
});

test("HH:MM:SS uses native full-size or half-size seconds and preserves clock identity", async () => {
    const headers = { "content-type": "application/json" };
    const response = await requestApi("/api/garmin/clock", [Buffer.from(JSON.stringify({ scene, elementId: "time", source: "timeSeconds" }))], headers);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    let current = (response.body as unknown as WatchMapping).scene;
    for (const size of ["half", "full", "half"]) {
        const result = await requestApi("/api/garmin/seconds-size", [Buffer.from(JSON.stringify({ scene: current, elementId: "time", size }))], headers);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const mapped = result.body as unknown as WatchMapping;
        const element = mapped.scene.elements[0];
        assert.equal(element.id, "time");
        assert.equal(element.source, "timeSeconds");
        assert.equal(element.secondsSize, size);
        assert.equal(mapped.ops.length, 8);
        const digits = mapped.ops.filter((op) => op.kind === "bitmap");
        if (size === "half") {
            assert.ok(digits.slice(-2).every((op) => op.height <= Math.floor(element.height / 2)));
            assert.ok(digits.slice(0, 2).every((op) => op.height > element.height / 2));
        }
        assert.ok(Math.abs(element.x + element.width / 2 - 208) <= 1);
        current = mapped.scene;
    }
    for (const size of ["tiny", 0, null]) {
        const invalid = await requestApi("/api/garmin/seconds-size", [Buffer.from(JSON.stringify({ scene: current, elementId: "time", size }))], headers);
        assert.equal(invalid.status, 400);
    }
    assert.equal((await requestApi("/api/garmin/seconds-size", [], { origin: "https://attacker.example" })).status, 403);
});

test("text defaults save without resizing existing elements and apply to new or selected text", async () => {
    const headers = { "content-type": "application/json" };
    const defaults = { size: 50, thickness: 1, width: 105, letterSpacing: 2 };
    const saved = await requestApi("/api/garmin/text-defaults", [Buffer.from(JSON.stringify({ scene, defaults }))], headers);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const current = (saved.body as unknown as WatchMapping).scene;
    assert.deepEqual(current.textDefaults, defaults);
    assert.deepEqual(current.elements, scene.elements);
    for (const source of ["time", "divider"]) {
        const result = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene: current, source }))], headers);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const added = (result.body as unknown as WatchMapping).scene.elements.at(-1)!;
        assert.equal(added.height, defaults.size);
        assert.deepEqual(added.typography, { ...defaults, family: "time" });
    }
    const applied = await requestApi("/api/garmin/apply-text-defaults", [Buffer.from(JSON.stringify({ scene: current, elementId: "time" }))], headers);
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal((applied.body as unknown as WatchMapping).scene.elements[0].height, defaults.size);
    assert.equal((await requestApi("/api/garmin/text-defaults", [Buffer.from(JSON.stringify({ scene, defaults: { ...defaults, size: true } }))], headers)).status, 400);
    assert.equal((await requestApi("/api/garmin/apply-text-defaults", [], { origin: "https://attacker.example" })).status, 403);
});

test("copy and delete APIs preserve originals and allow an empty canvas", async () => {
    const headers = { "content-type": "application/json" };
    const copied = await requestApi("/api/garmin/copy-element", [Buffer.from(JSON.stringify({ scene, elementId: "time" }))], headers);
    assert.equal(copied.status, 200, JSON.stringify(copied.body));
    let current = (copied.body as unknown as WatchMapping).scene;
    assert.equal(current.elements.length, 2);
    assert.deepEqual(current.elements[0], scene.elements[0]);
    assert.notEqual(current.elements[1].id, "time");
    assert.deepEqual({ ...current.elements[1], id: "time" }, scene.elements[0]);
    for (const elementId of current.elements.map((element) => element.id)) {
        const deleted = await requestApi("/api/garmin/delete-element", [Buffer.from(JSON.stringify({ scene: current, elementId }))], headers);
        assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
        current = (deleted.body as unknown as WatchMapping).scene;
    }
    assert.deepEqual(current.elements, []);
    for (const operation of ["copy-element", "delete-element", "apply-text-defaults"]) {
        assert.equal((await requestApi(`/api/garmin/${operation}`, [Buffer.from(JSON.stringify({ scene, elementId: "missing" }))], headers)).status, 400);
        assert.equal((await requestApi(`/api/garmin/${operation}`, [Buffer.from(JSON.stringify({ scene }))], headers)).status, 400);
    }
    assert.equal((await requestApi("/api/garmin/copy-element", [], { host: "attacker.example" })).status, 403);
    assert.equal((await requestApi("/api/garmin/delete-element", [], { origin: "https://attacker.example" })).status, 403);
});

test("named text presets save independently and apply by id", async () => {
    const headers = { "content-type": "application/json" };
    const presets = [
        { id: "time", name: "Time", size: 60, thickness: 0, width: 100, letterSpacing: 1 },
        { id: "widgets", name: "Widgets", size: 26, thickness: 1, width: 105, letterSpacing: 2 },
    ];
    const saved = await requestApi("/api/garmin/text-presets", [Buffer.from(JSON.stringify({ scene, presets, defaultPresetId: "widgets" }))], headers);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const current = (saved.body as unknown as WatchMapping).scene;
    assert.deepEqual(current.textPresets, presets);
    assert.equal(current.defaultTextPresetId, "widgets");
    assert.deepEqual(current.elements, scene.elements);
    for (const presetId of ["time", "widgets"]) {
        const applied = await requestApi("/api/garmin/apply-text-preset", [Buffer.from(JSON.stringify({ scene: current, elementId: "time", presetId }))], headers);
        assert.equal(applied.status, 200, JSON.stringify(applied.body));
        const element = (applied.body as unknown as WatchMapping).scene.elements[0];
        assert.equal(element.height, presets.find((preset) => preset.id === presetId)!.size);
        assert.equal(element.source, "time");
    }
    const added = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene: current, source: "divider" }))], headers);
    assert.equal(added.status, 200, JSON.stringify(added.body));
    assert.equal((added.body as unknown as WatchMapping).scene.elements.at(-1)!.height, 26);
    assert.equal((await requestApi("/api/garmin/apply-text-preset", [Buffer.from(JSON.stringify({ scene: current, elementId: "time", presetId: "missing" }))], headers)).status, 400);
    assert.equal((await requestApi("/api/garmin/text-presets", [Buffer.from(JSON.stringify({ scene, presets: [...presets, { ...presets[0], id: "other", name: "time" }], defaultPresetId: "time" }))], headers)).status, 400);
    assert.equal((await requestApi("/api/garmin/text-presets", [], { origin: "https://attacker.example" })).status, 403);
});
