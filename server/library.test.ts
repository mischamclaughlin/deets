import test from "node:test";
import assert from "node:assert/strict";
import { matchingEntries } from "../src/watch/library-catalogue.ts";
import { elementName } from "../src/watch/element-name.ts";
import { scene } from "../src/watch/scene.ts";
import { devices, inheritsFont, isEditableTextSource, type Scene, type WatchMapping } from "../shared/scene.ts";
import { libraryEntries } from "../src/watch/library-catalogue.ts";
import { activityLayout, arrangeActivity } from "../src/watch/activity-layout.ts";
import { callBridge } from "./bridge.ts";

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
    for (const entry of libraryEntries.filter((item) => item.category === "activity")) {
        const value = ["steps", "floors", "weeklyWalk", "weeklyRun"].includes(entry.source);
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
    assert.equal(matchingEntries("all", "   ").length, 7);
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
