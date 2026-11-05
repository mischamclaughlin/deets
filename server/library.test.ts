import test from "node:test";
import assert from "node:assert/strict";
import { matchingEntries } from "../src/watch/library-catalogue.ts";
import { elementName } from "../src/watch/element-name.ts";
import { scene } from "../src/watch/scene.ts";
import { devices, inheritsFont, isEditableTextSource, type Scene, type WatchMapping } from "../shared/scene.ts";
import { libraryEntries } from "../src/watch/library-catalogue.ts";
import { activityLayout, arrangeActivity } from "../src/watch/activity-layout.ts";
import { callBridge } from "./bridge.ts";
import { linkedElementIds, moveSceneElement } from "../src/watch/snapping.ts";

function activityScene(): Scene {
    return { ...scene, elements: [
        { ...scene.elements[0], id: "data", source: "steps", font: "widget", x: 150, y: 180, width: 112, height: 30, moveTogether: false },
        { ...scene.elements[0], id: "icon", source: "stepsIcon", font: "widget", activityId: "data", x: 190, y: 140, width: 31, height: 24 },
        { ...scene.elements[0], id: "graph", source: "stepsWeek", font: "widget", activityId: "data", x: 150, y: 226, width: 112, height: 24 },
        { ...scene.elements[0], id: "other" },
    ] };
}

test("activity layout changes exact box gaps and order while keeping the data anchored", () => {
    const original = activityScene();
    const before = structuredClone(original);
    for (const position of ["above", "below"] as const) {
        for (const gap of [0, 7, 32]) {
            const changed = arrangeActivity(original, "data", position, gap);
            const layout = activityLayout(changed, "data")!;
            assert.equal(layout.position, position);
            assert.equal(layout.gap, gap);
            assert.equal(layout.icon.x, 190, "Odd widths align to integer native pixels");
            assert.deepEqual(layout.value, original.elements[0]);
            assert.equal(changed.elements[3], original.elements[3]);
            assert.equal(changed.elements[2], original.elements[2], "Gap and order never move the graph");
        }
    }
    assert.deepEqual(original, before);
});

test("activity layout reads independently moved boxes and leaves independent graphs alone", () => {
    const original = activityScene();
    original.elements[1] = { ...original.elements[1], y: 240, height: 40 };
    original.elements[2] = { ...original.elements[2], y: 100 };
    assert.equal(activityLayout(original, "data")!.position, "below");
    assert.equal(activityLayout(original, "data")!.gap, 30);
    const changed = arrangeActivity(original, "data", "above", 12);
    assert.equal(changed.elements[1].y, 128);
    assert.equal(changed.elements[2], original.elements[2]);
    assert.equal(activityLayout({ ...original, elements: original.elements.filter((element) => element.id !== "icon") }, "data"), undefined);
    for (const gap of [-1, 1.5, NaN, Infinity, devices[original.device] + 1])
        assert.throws(() => arrangeActivity(original, "data", "above", gap), /whole-pixel gap/);
});

test("activity gap and order round-trip native validation for every activity and device", async () => {
    for (const device of Object.keys(devices) as Array<keyof typeof devices>) {
        for (const source of ["steps", "floors", "weeklyWalk", "weeklyRun"]) {
            const original = await callBridge<WatchMapping>("add", { scene: { ...scene, device, elements: [] },
                source, options: { value: true, icon: true, graph: true } });
            const id = original.scene.elements[0].id;
            for (const position of ["above", "below"] as const) {
                const arranged = arrangeActivity(original.scene, id, position, 9);
                const mapped = await callBridge<WatchMapping>("layout", { scene: arranged });
                assert.deepEqual(mapped.scene, arranged);
                assert.equal(activityLayout(mapped.scene, id)!.gap, 9);
            }
        }
    }
    const original = activityScene();
    await assert.rejects(callBridge("layout", { scene: arrangeActivity(original, "data", "above", 400) }));
});

test("activity values share text controls while icons and graphs retain geometry controls", () => {
    for (const entry of libraryEntries.filter((item) => item.category === "activity" || item.category === "health")) {
        const value = ["heartRate", "steps", "floors", "weeklyWalk", "weeklyRun", "bodyBattery", "stress", "recoveryTime"].includes(entry.source);
        assert.equal(isEditableTextSource(entry.source), value, entry.source);
        if (value) {
            const element = { source: entry.source };
            assert.equal(inheritsFont(element), false, "Legacy data retains its own font");
            assert.equal(inheritsFont({ ...element, inheritFont: true }), true);
            assert.equal(inheritsFont({ ...element, inheritFont: false }), false);
        }
    }
    assert.equal(isEditableTextSource("battery"), true);
    assert.equal(isEditableTextSource("unknown"), false);
    assert.equal(inheritsFont({ source: "time" }), true);
    assert.equal(inheritsFont({ source: "numericDate" }), false);
});

test("library search combines category, names and useful activity synonyms", () => {
    assert.deepEqual(matchingEntries("activity", " WALKING   graph ").map((entry) => entry.source), ["weeklyWalk"]);
    assert.deepEqual(matchingEntries("clock", "walking"), []);
    assert.deepEqual(matchingEntries("activity", "steps").map((entry) => entry.source), ["steps"]);
    assert.deepEqual(matchingEntries("all", "weekly chart").map((entry) => entry.source), ["steps", "floors", "weeklyWalk", "weeklyRun"]);
    assert.deepEqual(matchingEntries("all", "unknown-item"), []);
    assert.equal(matchingEntries("all", "   ").length, 21);
});

test("element names distinguish values, symbols and graphs and number duplicates", () => {
    const sources = ["time", "hours", "numericDate", "date", "divider", "steps", "stepsIcon", "stepsIcon", "walkWeek", "walkWeek"];
    const design = { ...scene, elements: sources.map((source, i) => ({ ...scene.elements[0], source, id: `item-${i}` })) };
    assert.deepEqual(design.elements.map((element) => elementName(design, element.id)),
        ["Time 1", "Time 2", "Date 1", "Date 2", "Divider 1", "Steps 1", "Steps icon 1", "Steps icon 2", "Walking graph 1", "Walking graph 2"]);
    assert.equal(elementName(design, "unknown"), "unknown");
});

test("stairs searches resolve to the data entry with its associated extras", () => {
    for (const query of ["stairs", "floors", "flights of stairs"]) {
        assert.deepEqual(matchingEntries("activity", query).map((entry) => entry.source), ["floors"]);
    }
});

test("heart-rate searches include the value, icon and zones graph", () => {
    for (const query of ["heart", "heart icon", "heart rate", "pulse", "bpm", "heart graph", "heart zones"])
        assert.deepEqual(matchingEntries("health", query).map((entry) => entry.source), ["heartRate"]);
});

test("heart-rate zones can be added and toggled while moving independently", async () => {
    const original = await callBridge<WatchMapping>("add", { scene, source: "heartRate", options: { graph: true } });
    const value = original.scene.elements.find((item) => item.source === "heartRate")!;
    const icon = original.scene.elements.find((item) => item.source === "heartIcon")!;
    const graph = original.scene.elements.find((item) => item.source === "heartZones")!;
    assert.equal(graph.activityId, value.id);
    assert.deepEqual(linkedElementIds(original.scene, graph.id), [graph.id]);
    const moved = moveSceneElement(original.scene, icon.id, { x: icon.x + 6, y: icon.y + 6 }, { enabled: false, showGuideLines: false });
    assert.equal(moved.elements.find((item) => item.id === graph.id), graph);
    const removed = await callBridge<WatchMapping>("activity-graph", { scene: original.scene, elementId: icon.id, enabled: false });
    assert.equal(removed.scene.elements.some((item) => item.id === graph.id), false);
    const restored = await callBridge<WatchMapping>("activity-graph", { scene: removed.scene, elementId: value.id, enabled: true });
    assert.equal(restored.scene.elements.at(-1)?.source, "heartZones");
});

test("heart-rate value and icon use the existing layout, linked movement and native layers", async () => {
    for (const device of Object.keys(devices) as Array<keyof typeof devices>) {
        const base = await callBridge<WatchMapping>("add", { scene: { ...scene, device, elements: [] }, source: "time" });
        const original = await callBridge<WatchMapping>("add", {
            scene: base.scene, source: "heartRate", options: { value: true, icon: true },
        });
        assert.deepEqual(original.scene.elements[0], base.scene.elements[0]);
        assert.deepEqual(original.scene.elements.slice(-2).map((element) => element.source), ["heartRate", "heartIcon"]);
        const value = original.scene.elements.at(-2)!;
        const icon = original.scene.elements.at(-1)!;
        assert.equal(icon.activityId, value.id);
        assert.equal(elementName(original.scene, value.id), "Heart rate 1");
        assert.equal(elementName(original.scene, icon.id), "Heart icon 1");
        for (const position of ["above", "below"] as const) {
            const arranged = arrangeActivity(original.scene, value.id, position, 12);
            const mapped = await callBridge<WatchMapping>("layout", { scene: arranged });
            assert.equal(activityLayout(mapped.scene, value.id)!.position, position);
            assert.equal(activityLayout(mapped.scene, value.id)!.gap, 12);
        }
    }
});


test("device and literal text are exposed as independent searchable elements", () => {
    assert.deepEqual(matchingEntries("device", "").map((entry) => entry.source), ["battery", "alarms", "label"]);
    for (const [query, source] of [["charge", "battery"], ["alarm", "alarms"], ["custom text", "label"]])
        assert.deepEqual(matchingEntries("device", query).map((entry) => entry.source), [source]);
});
