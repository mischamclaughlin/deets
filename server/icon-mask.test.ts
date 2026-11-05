import { test } from "node:test";
import assert from "node:assert/strict";
import { packIcon, sceneWithIcon } from "../src/watch/icon-mask.ts";
import { devices, type Scene } from "../shared/scene.ts";
import { scene } from "../src/watch/scene.ts";
import { serialiseDesign, parseDesign } from "../src/watch/design-file.ts";
import { defaultGrid } from "../src/watch/grid.ts";

test("imported icon coverage trims margins, crosses byte boundaries and preserves alpha threshold", () => {
    const rgba = new Uint8ClampedArray(5 * 5 * 4);
    for (const [x, y, alpha] of [[1, 1, 255], [3, 1, 128], [2, 2, 127], [3, 3, 255]]) rgba[(y * 5 + x) * 4 + 3] = alpha;
    assert.deepEqual(packIcon("my star.svg", 5, 5, rgba), { name: "my star", width: 3, height: 3, bits: "a080" });
    assert.throws(() => packIcon("blank.png", 5, 5, new Uint8ClampedArray(100)), /no visible pixels/);
    assert.throws(() => packIcon("large.png", 65, 1, new Uint8ClampedArray(260)), /dimensions/);
});

test("custom icons remain portable through design files and centre on every device without mutating the scene", () => {
    const icon = { name: "Star", width: 3, height: 3, bits: "a080" };
    for (const [device, size] of Object.entries(devices)) {
        const original = { ...scene, device } as Scene;
        const next = sceneWithIcon(original, icon, "custom-star");
        const element = next.elements.at(-1)!;
        assert.equal(element.x, Math.floor((size - 3) / 2));
        assert.equal(element.y, element.x);
        assert.equal(element.source, "customIcon");
        assert.equal(original.elements.length, scene.elements.length);
        const restored = parseDesign(serialiseDesign({ scene: next, grid: defaultGrid }));
        assert.deepEqual(restored.scene.elements.at(-1)?.icon, icon);
    }
    assert.throws(() => sceneWithIcon({ ...scene, elements: Array(40).fill(scene.elements[0]) }, icon, "full"), /40 slots/);
});
