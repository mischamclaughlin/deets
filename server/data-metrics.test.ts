import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { additionalDataSources, dataMetrics } from "../shared/data-metrics.ts";
import { activityParts, libraryEntries, sidebarEntries, matchingEntries, type LibrarySource } from "../src/watch/library-catalogue.ts";
import { isEditableTextSource, inheritsFont, type WatchMapping } from "../shared/scene.ts";
import { callBridge } from "./bridge.ts";
import { scene } from "../src/watch/scene.ts";
import { elementName } from "../src/watch/element-name.ts";

test("expanded metrics have distinct protocol IDs, local assets and searchable paired sidebar choices", async () => {
    assert.equal(dataMetrics.length, 20);
    assert.deepEqual(dataMetrics.map((metric) => metric.source).sort(), [...additionalDataSources].sort());
    assert.equal(new Set(dataMetrics.map((metric) => metric.source)).size, dataMetrics.length);
    for (const metric of dataMetrics) {
        const icon = `${metric.source}Icon` as LibrarySource;
        assert.ok(isEditableTextSource(metric.source));
        assert.equal(isEditableTextSource(icon), false);
        assert.equal(inheritsFont({ source: metric.source }), false);
        assert.equal(activityParts[metric.source]?.icon, icon);
        for (const source of [metric.source, icon]) {
            assert.equal(sidebarEntries.filter((entry) => entry.source === source).length, 1);
            assert.equal(libraryEntries.find((entry) => entry.source === source)?.category, metric.category);
        }
        assert.ok(matchingEntries(metric.category, metric.label).some((entry) => entry.source === metric.source), metric.source);
        for (const extension of ["svg", "png"]) await access(new URL(`../garmin/resources/drawables/icons/${metric.icon}.${extension}`, import.meta.url));
    }
});

test("expanded metrics retain editable typography, names and icons through the native design boundary", async () => {
    const empty = { ...scene, elements: [] };
    for (const metric of dataMetrics) {
        const mapped = await callBridge<WatchMapping>("add", { scene: empty, source: metric.source });
        const [value, icon] = mapped.scene.elements;
        assert.equal(value.source, metric.source);
        assert.equal(icon.activityId, value.id);
        assert.equal(elementName(mapped.scene, value.id), `${metric.label} 1`);
        const refreshed = await callBridge<WatchMapping>("refresh-fonts", { scene: mapped.scene });
        assert.equal(refreshed.scene.elements[0].source, metric.source);
        assert.deepEqual(empty.elements, []);
    }
});
