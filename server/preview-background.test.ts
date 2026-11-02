import test from "node:test";
import assert from "node:assert/strict";
import { removePreviewBackground } from "../src/watch/preview-background.ts";

test("preview matte removal preserves enclosed white details and dark casing", () => {
    const pixels = new Uint8ClampedArray(5 * 5 * 4).fill(255);
    for (const index of [6, 7, 8, 11, 13, 16, 17, 18]) {
        pixels.set([30, 40, 50, 255], index * 4);
    }
    pixels.set([248, 248, 248, 255], 0);
    removePreviewBackground(pixels, 5, 5);
    for (let index = 0; index < 25; index++) {
        const x = index % 5;
        const y = Math.floor(index / 5);
        assert.equal(pixels[index * 4 + 3], x === 0 || x === 4 || y === 0 || y === 4 ? 0 : 255);
    }
    assert.deepEqual([...pixels.slice(12 * 4, 13 * 4)], [255, 255, 255, 255]);
});

test("preview matte removal traverses existing transparency to reach white background", () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255, 20, 30, 40, 255]);
    removePreviewBackground(pixels, 3, 1);
    assert.deepEqual([...pixels], [0, 0, 0, 0, 255, 255, 255, 0, 20, 30, 40, 255]);
});

test("preview matte removal removes white contamination from antialiased casing edges", () => {
    const values = [255, 249, 213, 109, 38, 30, 30, 30, 30];
    const width = values.length;
    const height = 9;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) pixels.set([values[x], values[x], values[x], 255], (y * width + x) * 4);
    }
    removePreviewBackground(pixels, width, height);
    const pixel = (x: number) => [...pixels.slice((4 * width + x) * 4, (4 * width + x + 1) * 4)];
    assert.deepEqual(pixel(0), [255, 255, 255, 0]);
    assert.deepEqual(pixel(1), [249, 249, 249, 0]);
    assert.ok(pixel(2)[3] < 60);
    assert.ok(pixel(3)[3] < 190);
    assert.ok(pixel(2).slice(0, 3).every((channel) => channel <= 38));
    assert.deepEqual(pixel(5), [30, 30, 30, 255]);
});

test("preview matte removal retains enclosed white markings near the outer edge", () => {
    const pixels = new Uint8ClampedArray(9 * 9 * 4).fill(255);
    for (let y = 1; y < 8; y++) {
        for (let x = 1; x < 8; x++) pixels.set([30, 30, 30, 255], (y * 9 + x) * 4);
    }
    pixels.set([255, 255, 255, 255], (4 * 9 + 2) * 4);
    removePreviewBackground(pixels, 9, 9);
    assert.deepEqual([...pixels.slice((4 * 9 + 2) * 4, (4 * 9 + 3) * 4)], [255, 255, 255, 255]);
});
