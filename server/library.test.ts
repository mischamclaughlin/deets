import test from "node:test";
import assert from "node:assert/strict";
import { matchingEntries } from "../src/watch/library-catalogue.ts";
import { elementName } from "../src/watch/element-name.ts";
import { scene } from "../src/watch/scene.ts";

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
