import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFile, unlink, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ViteDevServer } from "vite";
import { garmin } from "./garmin.ts";
import { devicePreview } from "./device-preview.ts";
import { scene } from "../src/watch/scene.ts";
import type { WatchMapping } from "../shared/scene.ts";

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

test("device previews reject arbitrary paths and preserve the local host restriction", async () => {
    for (const device of ["../epix2pro47mm", "__proto__", "unknown", "epix2pro47mm?file=secret"]) {
        assert.equal((await requestApi(`/api/garmin/device-preview/${device}`, [], {}, "GET")).status, 400);
    }
    assert.equal((await requestApi("/api/garmin/device-preview/epix2pro47mm", [], { host: "attacker.example" }, "GET")).status, 403);
});

test("device previews use the selected model's screen rectangle and reject mismatched geometry", async () => {
    const root = await mkdtemp(join(tmpdir(), "deets-device-preview-"));
    try {
        const directory = join(root, "epix2pro47mm");
        await mkdir(directory);
        const image = Buffer.alloc(24);
        Buffer.from("89504e470d0a1a0a", "hex").copy(image);
        image.writeUInt32BE(646, 16);
        image.writeUInt32BE(887, 20);
        await writeFile(join(directory, "epix2pro47mm.png"), image);
        const metadata = join(directory, "simulator.json");
        const screen = { x: 122, y: 238, width: 416, height: 416 };
        await writeFile(metadata, JSON.stringify({ display: { location: screen } }));
        assert.deepEqual(await devicePreview("epix2pro47mm", root), {
            image: `data:image/png;base64,${image.toString("base64")}`, width: 646, height: 887, screen,
        });
        for (const invalid of [{ ...screen, width: 390 }, { ...screen, x: 600 }, { ...screen, y: -1 }]) {
            await writeFile(metadata, JSON.stringify({ display: { location: invalid } }));
            await assert.rejects(devicePreview("epix2pro47mm", root), /Watch casing unavailable/);
        }
        await assert.rejects(devicePreview("epix2pro42mm", root), /Watch casing unavailable/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

function assertFitsContent(mapping: WatchMapping, elementId: string) {
    const element = mapping.scene.elements.find((item) => item.id === elementId)!;
    const ink = mapping.ops.filter((operation) => operation.kind === "bitmap" && operation.elementId === elementId);
    assert.equal(element.boxSizing, "hug");
    assert.ok(ink.length > 0);
    assert.deepEqual([
        Math.min(...ink.map((op) => op.x)), Math.min(...ink.map((op) => op.y)),
        Math.max(...ink.map((op) => op.x + op.width)), Math.max(...ink.map((op) => op.y + op.height)),
    ], [element.x, element.y, element.x + element.width, element.y + element.height]);
}

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
            assertFitsContent(mapped, clock.id);
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
    const element = { ...divider.elements[0], boxSizing: "fixed" as const, height: 88 };
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
            assert.equal(mapped.ops.length, 60);
            assert.ok(mapped.ops.every((operation) => operation.kind === "bitmap" && operation.font.startsWith("ring:")));
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
        assert.equal(Math.min(...topTick.map((op) => op.y)), 0);
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
        assertFitsContent(result.body as unknown as WatchMapping, added.id);
        assert.deepEqual(added.typography, { ...defaults, family: "time" });
    }
    const applied = await requestApi("/api/garmin/apply-text-defaults", [Buffer.from(JSON.stringify({ scene: current, elementId: "time" }))], headers);
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assertFitsContent(applied.body as unknown as WatchMapping, "time");
    assert.equal((applied.body as unknown as WatchMapping).scene.elements[0].typography?.size, defaults.size);
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
        assertFitsContent(applied.body as unknown as WatchMapping, element.id);
        assert.equal(element.typography?.size, presets.find((preset) => preset.id === presetId)!.size);
        assert.equal(element.source, "time");
    }
    const added = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene: current, source: "divider" }))], headers);
    assert.equal(added.status, 200, JSON.stringify(added.body));
    assertFitsContent(added.body as unknown as WatchMapping, (added.body as unknown as WatchMapping).scene.elements.at(-1)!.id);
    assert.equal((await requestApi("/api/garmin/apply-text-preset", [Buffer.from(JSON.stringify({ scene: current, elementId: "time", presetId: "missing" }))], headers)).status, 400);
    assert.equal((await requestApi("/api/garmin/text-presets", [Buffer.from(JSON.stringify({ scene, presets: [...presets, { ...presets[0], id: "other", name: "time" }], defaultPresetId: "time" }))], headers)).status, 400);
    assert.equal((await requestApi("/api/garmin/text-presets", [], { origin: "https://attacker.example" })).status, 403);
});

test("text presets start empty and the last preset can be removed without changing text", async () => {
    assert.deepEqual(scene.textPresets, []);
    assert.equal(scene.defaultTextPresetId, null);
    const headers = { "content-type": "application/json" };
    const result = await requestApi("/api/garmin/text-presets", [Buffer.from(JSON.stringify({ scene, presets: [], defaultPresetId: null }))], headers);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const cleared = (result.body as unknown as WatchMapping).scene;
    assert.deepEqual(cleared.textPresets, []);
    assert.deepEqual(cleared.elements, scene.elements);
    const added = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene: cleared, source: "time" }))], headers);
    assert.equal(added.status, 200, JSON.stringify(added.body));
});

test("preset links update every user automatically and custom detachment preserves appearance", async () => {
    const headers = { "content-type": "application/json" };
    const preset = { id: "display", name: "Display", size: 50, thickness: 0, width: 100, letterSpacing: 1 };
    async function post(path: string, payload: unknown) {
        const result = await requestApi(`/api/garmin/${path}`, [Buffer.from(JSON.stringify(payload))], headers);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        return (result.body as unknown as WatchMapping).scene;
    }
    let current = await post("text-presets", { scene, presets: [preset], defaultPresetId: "display" });
    current = await post("apply-text-preset", { scene: current, elementId: "time", presetId: "display" });
    current = await post("copy-element", { scene: current, elementId: "time" });
    const copiedId = current.elements[1].id;
    assert.ok(current.elements.every((element) => element.textPresetId === "display"));
    current = await post("text-presets", { scene: current, presets: [{ ...preset, size: 40 }], defaultPresetId: "display" });
    assert.ok(current.elements.every((element) => element.height === 40));
    current = await post("apply-text-preset", { scene: current, elementId: copiedId, presetId: null });
    assert.equal(current.elements[1].textPresetId, undefined);
    current = await post("text-presets", { scene: current, presets: [{ ...preset, size: 30 }], defaultPresetId: "display" });
    assert.equal(current.elements[0].height, 30);
    assert.equal(current.elements[1].height, 40);
    current = await post("text-presets", { scene: current, presets: [], defaultPresetId: null });
    assert.ok(current.elements.every((element) => element.textPresetId === undefined));
    assert.deepEqual(current.elements.map((element) => element.height), [30, 40]);
});

test("element day and night colours can be custom or linked to live colour presets", async () => {
    const headers = { "content-type": "application/json" };
    async function post(path: string, payload: unknown) {
        const result = await requestApi(`/api/garmin/${path}`, [Buffer.from(JSON.stringify(payload))], headers);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        return (result.body as unknown as WatchMapping).scene;
    }
    let current = await post("element-colour", { scene, elementId: "time", channel: "day", colour: 0x123456 });
    assert.equal(current.elements[0].colour, 0x123456);
    assert.equal(current.elements[0].nightColour, scene.elements[0].nightColour);
    const presets = [{ id: "accent", name: "Accent", colour: 0xff5500 }];
    current = await post("colour-presets", { scene: current, presets });
    for (const channel of ["day", "night"]) {
        current = await post("element-colour-preset", { scene: current, elementId: "time", channel, presetId: "accent" });
    }
    current = await post("copy-element", { scene: current, elementId: "time" });
    current = await post("colour-presets", { scene: current, presets: [{ ...presets[0], colour: 0x445566 }] });
    assert.ok(current.elements.every((element) => element.colour === 0x445566 && element.nightColour === 0x445566));
    current = await post("element-colour", { scene: current, elementId: "time", channel: "day", colour: 0xffffff });
    assert.equal(current.elements[0].colourPresetId, undefined);
    assert.equal(current.elements[0].nightColourPresetId, "accent");
    current = await post("colour-presets", { scene: current, presets: [{ ...presets[0], colour: 0xabcdef }] });
    assert.equal(current.elements[0].colour, 0xffffff);
    assert.equal(current.elements[0].nightColour, 0xabcdef);
    assert.equal(current.elements[1].colour, 0xabcdef);
    current = await post("colour-presets", { scene: current, presets: [] });
    assert.ok(current.elements.every((element) => !element.colourPresetId && !element.nightColourPresetId));
    assert.equal(current.elements[1].colour, 0xabcdef);
});

test("colour APIs reject invalid RGB, links and origins", async () => {
    const headers = { "content-type": "application/json" };
    for (const colour of [-1, 0x1000000, true, "#ffffff"]) {
        const result = await requestApi("/api/garmin/element-colour", [Buffer.from(JSON.stringify({ scene, elementId: "time", channel: "day", colour }))], headers);
        assert.equal(result.status, 400);
    }
    const missing = await requestApi("/api/garmin/element-colour-preset", [Buffer.from(JSON.stringify({ scene, elementId: "time", channel: "day", presetId: "missing" }))], headers);
    assert.equal(missing.status, 400);
    for (const path of ["colour-presets", "element-colour", "element-colour-preset"]) {
        assert.equal((await requestApi(`/api/garmin/${path}`, [], { origin: "https://attacker.example" })).status, 403);
    }
});

test("date API adds independent dates, changes formats and retains strict request validation", async () => {
    const headers = { "content-type": "application/json" };
    const added = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene, source: "numericDate" }))], headers);
    assert.equal(added.status, 200, JSON.stringify(added.body));
    const mapped = added.body as unknown as WatchMapping;
    const date = mapped.scene.elements.at(-1)!;
    assert.equal(date.source, "numericDate");
    assert.deepEqual(mapped.scene.elements.slice(0, -1), scene.elements);
    const changed = await requestApi("/api/garmin/date", [Buffer.from(JSON.stringify({
        scene: mapped.scene, elementId: date.id, source: "date",
    }))], headers);
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal((changed.body as unknown as WatchMapping).scene.elements.at(-1)?.source, "date");
    for (const payload of [
        { scene: mapped.scene, elementId: date.id },
        { scene: mapped.scene, elementId: date.id, source: "date", extra: true },
        { scene: mapped.scene, elementId: date.id, source: "time" },
        { scene: mapped.scene, elementId: "time", source: "date" },
    ]) {
        const rejected = await requestApi("/api/garmin/date", [Buffer.from(JSON.stringify(payload))], headers);
        assert.equal(rejected.status, 400);
    }
    assert.equal((await requestApi("/api/garmin/date", [], { origin: "https://attacker.example" })).status, 403);
});


test("font refresh upgrades the initial scene and keeps strict scene-only request validation", async () => {
    const headers = { "content-type": "application/json" };
    const refreshed = await requestApi("/api/garmin/refresh-fonts", [Buffer.from(JSON.stringify({ scene }))], headers);
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
    const mapped = refreshed.body as unknown as WatchMapping;
    assert.deepEqual(mapped.scene.elements.map((element) => element.id), scene.elements.map((element) => element.id));
    assert.ok(mapped.scene.elements.every((element) => element.font.startsWith("generated:")));
    assertFitsContent(mapped, "time");
    assert.equal(mapped.scene.elements[0].typography?.size, scene.elements[0].height);
    for (const payload of [{}, { scene, night: false }, { scene, elementId: "time" }]) {
        const rejected = await requestApi("/api/garmin/refresh-fonts", [Buffer.from(JSON.stringify(payload))], headers);
        assert.equal(rejected.status, 400);
    }
    assert.equal((await requestApi("/api/garmin/refresh-fonts", [], { origin: "https://attacker.example" })).status, 403);
});

test("manual text boxes retain independent dimensions and can return to automatic fitting", async () => {
    const headers = { "content-type": "application/json" };
    const manual = { ...scene, elements: scene.elements.map((element) => ({ ...element, boxSizing: "fixed" as const, width: 180, height: 40 })) };
    const changed = await requestApi("/api/garmin/layout", [Buffer.from(JSON.stringify({ scene: manual }))], headers);
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const fixed = changed.body as unknown as WatchMapping;
    assert.equal(fixed.scene.elements[0].height, 40);
    assert.ok(fixed.ops.every((op) => op.x >= 88 && op.y >= 164 && op.x + op.width <= 268 && op.y + op.height <= 204));
    const fitted = await requestApi("/api/garmin/fit-box", [Buffer.from(JSON.stringify({ scene: fixed.scene, elementId: "time" }))], headers);
    assert.equal(fitted.status, 200, JSON.stringify(fitted.body));
    assert.equal((fitted.body as unknown as WatchMapping).scene.elements[0].boxSizing, "hug");
    const missing = await requestApi("/api/garmin/fit-box", [Buffer.from(JSON.stringify({ scene: fixed.scene }))], headers);
    assert.equal(missing.status, 400);
    const extra = await requestApi("/api/garmin/fit-box", [Buffer.from(JSON.stringify({ scene: fixed.scene, elementId: "time", width: 42 }))], headers);
    assert.equal(extra.status, 400);
    const crossOrigin = await requestApi("/api/garmin/fit-box", [Buffer.from(JSON.stringify({ scene: fixed.scene, elementId: "time" }))], { ...headers, origin: "https://example.com" });
    assert.equal(crossOrigin.status, 403);
});

test("adding activity extras passes the API boundary as one atomic scene edit", async () => {
    const headers = { "content-type": "application/json" };
    const result = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene, source: "steps", options: { icon: true, graph: true } }))], headers);
    assert.equal(result.status, 200);
    const updated = result.body.scene as typeof scene;
    assert.equal(updated.elements.length, scene.elements.length + 3);
    assert.deepEqual(updated.elements.slice(scene.elements.length).map((element) => element.source), ["steps", "stepsIcon", "stepsWeek"]);
    assert.deepEqual(updated.elements.slice(0, scene.elements.length), scene.elements);
    for (const options of [{ icon: "yes" }, { unexpected: true }]) {
        const invalid = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene, source: "steps", options }))], headers);
        assert.equal(invalid.status, 400);
    }
    const origin = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene, source: "steps", options: { graph: true } }))], { ...headers, origin: "https://attacker.example" });
    assert.equal(origin.status, 403);
});

test("selected activity graph API preserves linked icon/data and strict requests", async () => {
    const headers = { "content-type": "application/json" };
    const added = await requestApi("/api/garmin/add", [Buffer.from(JSON.stringify({ scene, source: "floors" }))], headers);
    assert.equal(added.status, 200);
    const initial = added.body.scene as typeof scene;
    const [value, icon] = initial.elements.slice(scene.elements.length);
    assert.equal(icon.activityId, value.id);
    assert.equal(value.moveTogether, true);
    assert.equal(value.y - icon.y - icon.height, 16);
    const graph = await requestApi("/api/garmin/activity-graph", [Buffer.from(JSON.stringify({ scene: initial, elementId: icon.id, enabled: true }))], headers);
    assert.equal(graph.status, 200);
    const updated = graph.body.scene as typeof scene;
    assert.deepEqual(updated.elements.slice(0, initial.elements.length), initial.elements);
    assert.equal(updated.elements.at(-1)?.activityId, value.id);
    const invalid = await requestApi("/api/garmin/activity-graph", [Buffer.from(JSON.stringify({ scene: initial, elementId: value.id, enabled: "yes" }))], headers);
    assert.equal(invalid.status, 400);
    const origin = await requestApi("/api/garmin/activity-graph", [Buffer.from(JSON.stringify({ scene: initial, elementId: value.id, enabled: true }))], { ...headers, origin: "https://attacker.example" });
    assert.equal(origin.status, 403);
});

test("editable export metadata rejects invalid grids before native compilation", async () => {
    for (const grid of [null, [], { visible: true }, { visible: false, circumferences: 999 }]) {
        const result = await requestApi("/api/garmin/export", [Buffer.from(JSON.stringify({ scene, mapping: "unused", grid }))], { "content-type": "application/json" });
        assert.equal(result.status, 400);
    }
});
