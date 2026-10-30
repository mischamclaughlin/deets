/** Compare the real editor canvas with fixed-frame compiled Garmin output. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { garmin } from "../server/garmin.ts";
import { callBridge } from "../server/bridge.ts";
import type { Scene, WatchMapping } from "../shared/scene.ts";
import { scene as initialScene } from "../src/watch/scene.ts";
import { captureCanvas } from "./export-browser.ts";
import { captureNative } from "./export-simulator.ts";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const help = `Usage: npm run test:export -- [--scene design.json] [--mode day|night|both] [--out NEW_DIRECTORY] [--prepare-only]

Compares the actual WatchCanvas raster with the same scene compiled and captured
in Garmin's simulator. Default: src/watch/scene.ts, day and night, exact pixels.
Requires Chrome, the Garmin toolchain, an unlocked Mac and System Events automation.
--prepare-only captures the browser and compiles proof files without testing native parity.
`;
if (args.includes("--help")) { console.log(help); process.exit(0); }
let scenePath: string | undefined;
let mode = "both";
let output = resolve(root, "exports", `visual-${new Date().toISOString().replaceAll(":", "-")}`);
let prepareOnly = false;
for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--prepare-only") { prepareOnly = true; continue; }
    if (!["--scene", "--mode", "--out"].includes(flag) || !args[index + 1] || args[index + 1].startsWith("--"))
        throw new Error(help);
    const value = args[++index];
    if (flag === "--scene") scenePath = resolve(value);
    if (flag === "--mode") mode = value;
    if (flag === "--out") output = resolve(value);
}
if (!["day", "night", "both"].includes(mode)) throw new Error(help);

interface PixelResult { match: boolean; changedPixels: number; comparedPixels: number; }
interface CaseResult {
    mode: string;
    status: "prepared" | "match" | "mismatch" | "error";
    pixels?: PixelResult;
    error?: string;
}
const cases: CaseResult[] = [];
const report: { method: string; prepareOnly: boolean; cases: CaseResult[]; error?: string } = {
    method: "editor-canvas versus compiled Garmin proof output", prepareOnly, cases,
};
let outputCreated = false;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

async function saveReport() {
    await writeFile(join(output, "results.json"), JSON.stringify(report, null, 2));
    const cards = cases.map((item) => `<section><h2>${item.mode}: ${item.status}</h2>
        ${item.pixels ? `<p>${item.pixels.changedPixels} / ${item.pixels.comparedPixels} pixels differ. Tolerance: zero.</p>` : ""}
        ${item.error ? `<p class="error">${escapeHtml(item.error)}</p>` : ""}
        <div class="images"><figure><figcaption>Editor canvas</figcaption><img src="${item.mode}/canvas.png"></figure>
        ${item.pixels ? `<figure><figcaption>Garmin output</figcaption><img src="${item.mode}/native.png"></figure><figure><figcaption>Difference (pink)</figcaption><img src="${item.mode}/comparison/diff.png"></figure>` : ""}</div>
        <p><a href="${item.mode}/proof.prg">Compiled fixed-frame proof</a> · <a href="${item.mode}/scene.json">Scene</a></p></section>`).join("");
    await writeFile(join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Garmin export pixel comparison</title>
        <style>body{font:15px system-ui;background:#182528;color:#dceae3;margin:32px}h1{font-size:24px}.images{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0}figcaption{margin:12px 0}img{width:min(100%,454px);image-rendering:pixelated;background:#000}section{padding:20px 0;border-top:1px solid #52675f}a{color:#b7edcf}.error{color:#ffd0c5;white-space:pre-wrap}</style>
        <h1>Garmin export pixel comparison</h1><p>${prepareOnly ? "Preparation only — native parity has not been tested." : "Actual editor canvas versus compiled fixed-frame output. Pixels outside the round display are excluded. No resizing or colour tolerance."}</p>${report.error ? `<p class="error">Test did not complete: ${escapeHtml(report.error)}</p>` : ""}${cards}</html>`);
}

async function run() {
    // A fresh directory prevents stale captures from satisfying a later run.
    await mkdir(dirname(output), { recursive: true });
    await mkdir(output, { recursive: false });
    outputCreated = true;
    const input = scenePath ? JSON.parse(await readFile(scenePath, "utf8")) as Scene : initialScene;
    const mapped = await callBridge<WatchMapping>("refresh-fonts", { scene: input });
    let currentNight = false;
    const server = await createServer({
        root, configFile: false, plugins: [react(), garmin(), {
            name: "deets-export-test-harness",
            configureServer(harnessServer) {
                harnessServer.middlewares.use(async (request, response, next) => {
                    if (request.url !== "/__export-test.html") { next(); return; }
                    try {
                        const html = `<!doctype html><html><meta charset="utf-8"><title>Export test canvas</title><div id="root"></div>
                            <script type="module">
                            import React from 'react';
                            import {createRoot} from 'react-dom/client';
                            import {WatchCanvas} from '/src/watch/WatchCanvas.tsx';
                            createRoot(document.getElementById('root')).render(React.createElement(WatchCanvas, {
                                scene: ${JSON.stringify(mapped.scene).replaceAll("<", "\\u003c")}, night: ${currentNight}, showAreas: false
                            }));</script></html>`;
                        response.setHeader("Content-Type", "text/html");
                        response.end(await harnessServer.transformIndexHtml("/__export-test.html", html));
                    } catch (error) {
                        response.statusCode = 500;
                        response.end(String(error));
                    }
                });
            },
        }],
        server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    try {
        await server.listen();
        const address = server.httpServer?.address();
        if (!address || typeof address === "string") throw new Error("The isolated canvas test server did not start.");
        for (const night of mode === "both" ? [false, true] : [mode === "night"]) {
            currentNight = night;
            const name = night ? "night" : "day";
            const directory = join(output, name);
            await mkdir(directory);
            const item: CaseResult = { mode: name, status: "error" };
            cases.push(item);
            try {
                await writeFile(join(directory, "scene.json"), JSON.stringify(mapped.scene, null, 2));
                console.log(`${name}: capturing the editor canvas…`);
                await captureCanvas(`http://127.0.0.1:${address.port}/__export-test.html`, join(directory, "canvas.png"), process.env.CHROME_PATH);
                console.log(`${name}: compiling fixed-frame Garmin output…`);
                const marker = `DEETS_CAPTURE_READY:${randomUUID()}`;
                const compilation = exec(process.env.DEETS_PYTHON ?? "python3", [
                    join(root, "garmin/tools/prepare_export_capture.py"), join(directory, "proof.prg"), marker,
                ], { timeout: 135_000 });
                compilation.child.stdin?.end(JSON.stringify({ scene: mapped.scene, mapping: mapped.mapping, proof: true, night }));
                await compilation;
                if (prepareOnly) { item.status = "prepared"; continue; }
                console.log(`${name}: loading the simulator and capturing its display…`);
                await captureNative(join(directory, "proof.prg"), mapped.scene.device, join(directory, "native.png"), join(directory, "simulator.log"), marker);
                try {
                    const compared = await exec(process.env.DEETS_PYTHON ?? "python3", [
                        join(root, "garmin/tools/compare_export_pixels.py"), join(directory, "canvas.png"),
                        join(directory, "native.png"), join(directory, "comparison"),
                    ], { timeout: 60_000 });
                    item.pixels = JSON.parse(compared.stdout) as PixelResult;
                } catch (error) {
                    const result = error as { code?: number; stdout?: string };
                    if (result.code !== 1 || !result.stdout) throw error;
                    item.pixels = JSON.parse(result.stdout) as PixelResult;
                }
                item.status = item.pixels.match ? "match" : "mismatch";
                console.log(`${name}: ${item.status} (${item.pixels.changedPixels} changed pixels).`);
            } catch (error) {
                item.error = error instanceof Error ? error.message : String(error);
                throw error;
            } finally { await saveReport(); }
        }
    } finally { await server.close(); }
    if (cases.some((item) => item.status === "mismatch")) process.exitCode = 1;
    console.log(`${prepareOnly ? "Prepared only; native parity unverified" : "Comparison complete"}: ${join(output, "index.html")}`);
}

try { await run(); }
catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    if (outputCreated) await saveReport();
    console.error(report.error);
    console.error(`Export comparison did not complete. Output: ${output}`);
    process.exitCode = 2;
}
