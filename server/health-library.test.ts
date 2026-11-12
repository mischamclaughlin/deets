import test from "node:test";
import assert from "node:assert/strict";
import { libraryCategories, libraryItems, matchingEntries, activityParts } from "../src/watch/library-catalogue.ts";
import { isEditableTextSource, inheritsFont, type WatchMapping } from "../shared/scene.ts";
import { scene } from "../src/watch/scene.ts";
import { callBridge } from "./bridge.ts";
import { elementName } from "../src/watch/element-name.ts";
import { linkedElementIds } from "../src/watch/snapping.ts";

test("library categories group each choice once and health searches include recovery and energy", () => {
    assert.deepEqual(libraryCategories.map((group) => group.id), ["clock", "health", "activity", "training", "outdoors", "weather", "device"]);
    assert.deepEqual(libraryItems.filter((entry) => entry.category === "health").map((entry) => entry.source),
        ["bodyBattery", "stress", "recoveryTime", "heartRate", "pulseOx", "respirationRate"]);
    for (const [query, source] of [["energy", "bodyBattery"], ["stress", "stress"], ["rest", "recoveryTime"]])
        assert.deepEqual(matchingEntries("health", query).map((entry) => entry.source), [source]);
    assert.deepEqual(matchingEntries("weather", "wind direction").map((entry) => entry.source), ["wind"]);
    assert.deepEqual(matchingEntries("weather", "precipitation").map((entry) => entry.source), ["rainChance"]);
    assert.equal(new Set(libraryItems.map((entry) => entry.source)).size, libraryItems.length);
});

test("new health and weather values have editable text, linked icons and recognisable names", async () => {
    for (const source of ["bodyBattery", "stress", "recoveryTime", "rainChance", "wind"] as const) {
        assert.equal(isEditableTextSource(source), true);
        assert.equal(inheritsFont({ source }), false);
        const parts = activityParts[source]!;
        assert.equal(isEditableTextSource(parts.icon), false);
        const mapped = await callBridge<WatchMapping>("add", { scene, source });
        const value = mapped.scene.elements.find((element) => element.source === source)!;
        const icon = mapped.scene.elements.find((element) => element.source === parts.icon)!;
        assert.equal(icon.activityId, value.id);
        assert.deepEqual(linkedElementIds(mapped.scene, value.id), [value.id, icon.id]);
        assert.ok(!elementName(mapped.scene, value.id).startsWith("element-"));
    }
});
