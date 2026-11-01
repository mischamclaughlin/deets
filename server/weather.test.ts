import test from "node:test";
import assert from "node:assert/strict";
import { callBridge } from "./bridge.ts";
import { devices, isEditableTextSource, type Scene, type WatchMapping } from "../shared/scene.ts";
import { scene } from "../src/watch/scene.ts";
import { activityParts, libraryItems, matchingEntries, type LibrarySource } from "../src/watch/library-catalogue.ts";
import { activityLayout, arrangeActivity } from "../src/watch/activity-layout.ts";
import { activityName, elementName } from "../src/watch/element-name.ts";
import { linkedElementIds, moveSceneElement } from "../src/watch/snapping.ts";

const weather: LibrarySource[] = ["temperature", "highLow", "temperatureHigh", "temperatureLow", "sunriseSunset"];

test("weather library exposes the parent's data/icon/band choices with useful search", () => {
    assert.deepEqual(libraryItems.filter((entry) => entry.category === "weather").map((entry) => entry.source), weather);
    assert.deepEqual(matchingEntries("weather", "weather conditions").map((entry) => entry.source), ["temperature"]);
    assert.ok(matchingEntries("weather", "high low").some((entry) => entry.source === "highLow"));
    assert.deepEqual(matchingEntries("weather", "sunset icon").map((entry) => entry.source), ["sunriseSunset"]);
    assert.deepEqual(matchingEntries("weather", "daylight graph").map((entry) => entry.source), ["sunriseSunset"]);
    assert.deepEqual(matchingEntries("activity", "daylight"), []);
    assert.equal(activityParts.temperature?.graphLabel, "Temperature band");
    assert.equal(activityParts.highLow?.graph, "temperatureZones");
    assert.equal(activityParts.sunriseSunset?.graphLabel, "Daylight graph");
    assert.equal(activityParts.temperatureHigh?.graph, undefined);
    assert.equal(activityParts.temperatureLow?.graph, undefined);
    for (const source of weather) {
        assert.equal(isEditableTextSource(source), true);
        assert.equal(isEditableTextSource(activityParts[source]!.icon), false);
    }
});

test("weather uses shared controls, native validation and independently movable graphs on every device", async () => {
    for (const device of Object.keys(devices) as Array<keyof typeof devices>) {
        for (const source of weather) {
            const parts = activityParts[source]!;
            const mapped = await callBridge<WatchMapping>("add", { scene: { ...scene, device, elements: [] }, source,
                options: { value: true, icon: true, graph: !!parts.graph } });
            const [value, icon, graph] = mapped.scene.elements;
            assert.deepEqual(mapped.scene.elements.map((item) => item.source), [source, parts.icon, ...(parts.graph ? [parts.graph] : [])]);
            assert.equal(icon.activityId, value.id);
            assert.equal(activityName(mapped.scene, value.id), elementName(mapped.scene, value.id));
            assert.deepEqual(linkedElementIds(mapped.scene, value.id), [value.id, icon.id]);
            const moved = moveSceneElement(mapped.scene, icon.id, { x: icon.x + 5, y: icon.y + 5 }, { enabled: false, showGuideLines: false });
            assert.notDeepEqual(moved, mapped.scene);
            if (graph) {
                assert.equal(moved.elements[2], graph);
                assert.deepEqual(linkedElementIds(mapped.scene, graph.id), [graph.id]);
            }
            for (const position of ["above", "below"] as const) {
                const arranged = arrangeActivity(mapped.scene, value.id, position, 8);
                const validated = await callBridge<WatchMapping>("layout", { scene: arranged });
                assert.deepEqual(validated.scene, arranged);
                assert.equal(activityLayout(validated.scene, value.id)!.gap, 8);
                if (graph) assert.equal(arranged.elements[2], graph);
            }
            if (graph) {
                const removed = await callBridge<WatchMapping>("activity-graph", { scene: mapped.scene, elementId: icon.id, enabled: false });
                assert.deepEqual(removed.scene.elements, mapped.scene.elements.slice(0, 2));
                const added = await callBridge<WatchMapping>("activity-graph", { scene: removed.scene, elementId: value.id, enabled: true });
                assert.equal(added.scene.elements.at(-1)?.source, parts.graph);
            }
        }
    }
});

test("weather supports individual parts and rejects graphs for individual high/low values", async () => {
    const empty: Scene = { ...scene, elements: [] };
    for (const source of weather) {
        const value = await callBridge<WatchMapping>("add", { scene: empty, source, options: { value: true, icon: false } });
        assert.deepEqual(value.scene.elements.map((item) => item.source), [source]);
        const icon = await callBridge<WatchMapping>("add", { scene: value.scene, source, options: { value: false, icon: true } });
        assert.equal(icon.scene.elements[1].activityId, value.scene.elements[0].id);
    }
    await assert.rejects(callBridge("add", { scene: empty, source: "temperatureHigh", options: { graph: true } }), /does not have/);
});
