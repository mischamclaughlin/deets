import test from "node:test";
import assert from "node:assert/strict";
import { elementName } from "../src/watch/element-name.ts";
import { elementLabel } from "../src/watch/element-label.ts";
import { scene } from "../src/watch/scene.ts";

test("imported artwork uses its filename name across layers and inspector, with numbered copies", () => {
    const icon = { ...scene.elements[0], id: "icon-unique-id", source: "customIcon", icon: { name: "Anchor", width: 1, height: 1, bits: "80" } };
    const design = { ...scene, elements: [icon] };
    assert.equal(elementName(design, icon.id), "Anchor");
    assert.equal(elementLabel(design, icon.id), "Anchor");
    const copies = { ...design, elements: [icon, { ...icon, id: "copy" }, { ...icon, id: "different", icon: { ...icon.icon, name: "Mountain" } }] };
    assert.deepEqual(copies.elements.map((element) => elementName(copies, element.id)), ["Anchor 1", "Anchor 2", "Mountain"]);
    for (const element of copies.elements) assert.equal(elementLabel(copies, element.id), elementName(copies, element.id));
    assert.equal(elementName(design, "missing"), "missing");
});
