import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { sidebarEntries, sidebarKind, activityParts } from "../src/watch/library-catalogue.ts";
import { devices, type Scene, type WatchMapping } from "../shared/scene.ts";
import { scene } from "../src/watch/scene.ts";
import { callBridge } from "./bridge.ts";

test("sidebar exposes every native catalogue entry exactly once, including independent icons and graphs", async () => {
    const { stdout } = await promisify(execFile)(process.env.DEETS_PYTHON ?? "python3", ["-c",
        "import sys,json;sys.path.insert(0,sys.argv[1]);from designer_model import CATALOG;print(json.dumps([entry['id'] for entry in CATALOG if entry['id'] != 'customIcon']))",
        fileURLToPath(new URL("../garmin/tools", import.meta.url))]);
    // Imported artwork uses the file chooser; every other native source has a sidebar row.
    const nativeSources = JSON.parse(stdout) as string[];
    assert.equal(new Set(sidebarEntries.map((entry) => entry.source)).size, sidebarEntries.length);
    assert.deepEqual(sidebarEntries.map((entry) => entry.source).sort(), nativeSources.sort());
    for (const parts of Object.values(activityParts)) {
        assert.ok(sidebarEntries.some((entry) => entry.source === parts.icon));
        assert.equal(sidebarKind(parts.icon), "Icons");
        if (parts.graph) {
            assert.ok(sidebarEntries.some((entry) => entry.source === parts.graph));
            assert.equal(sidebarKind(parts.graph), "Graphs");
        }
    }
    assert.equal(sidebarKind("secondsRing"), "Graphs");
    for (const source of ["time", "timeSeconds", "hours", "minutes", "seconds", "secondsRing", "date", "numericDate", "weekday", "day", "month", "year"])
        assert.ok(sidebarEntries.some((entry) => entry.source === source), source);
});

test("every sidebar choice can be added through the canonical API", async () => {
    const original: Scene = { ...scene, elements: [] };
    for (const entry of sidebarEntries) {
        const mapped = await callBridge<WatchMapping>("add", { scene: original, source: entry.source });
        assert.ok(mapped.scene.elements.some((element) => element.source === entry.source), entry.source);
        assert.ok(mapped.ops.length > 0, entry.source);
        assert.equal(mapped.size, devices[original.device]);
    }
    assert.deepEqual(original.elements, []);
});
