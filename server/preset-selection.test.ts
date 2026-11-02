import test from 'node:test';
import assert from 'node:assert/strict';
import { elementPresetIds, followPresetSelection } from '../src/watch/preset-selection.ts';
import { scene } from '../src/watch/scene.ts';
import type { Scene } from '../shared/scene.ts';

function design(): Scene {
    return { ...scene, textPresets: [
        { id: 'small', name: 'Small', size: 24, thickness: 0, width: 100, letterSpacing: 1 },
        { id: 'large', name: 'Large', size: 88, thickness: 0, width: 100, letterSpacing: 1 },
    ], colourPresets: [
        { id: 'rose', name: 'Rose', colour: 0xff0000 },
        { id: 'foam', name: 'Foam', colour: 0x00ffff },
    ], elements: [
        { ...scene.elements[0], id: 'first', textPresetId: 'small', colourPresetId: 'rose', nightColourPresetId: 'foam' },
        { ...scene.elements[0], id: 'second', textPresetId: 'large', nightColourPresetId: 'foam' },
        { ...scene.elements[0], id: 'custom', typography: { family: 'Test font', size: 24, thickness: 0, width: 100, letterSpacing: 1 }, colour: 0xff0000 },
    ] };
}

test('element selection resolves explicit text and colour links, preferring Day over Night', () => {
    const document = design();
    assert.deepEqual(elementPresetIds(document, 'first'), { text: 'small', colour: 'rose' });
    assert.deepEqual(elementPresetIds(document, 'second'), { text: 'large', colour: 'foam' });
    assert.deepEqual(elementPresetIds(document, 'custom'), { text: undefined, colour: undefined });
    assert.deepEqual(elementPresetIds(document), { text: undefined, colour: undefined });
    assert.deepEqual(elementPresetIds(document, 'missing'), { text: undefined, colour: undefined });
});

test('missing preset links are ignored and chart bands can supply the colour preset', () => {
    const document = design();
    document.elements[0] = { ...document.elements[0], textPresetId: 'missing', colourPresetId: 'missing',
        zoneColourPresetIds: [null, 'foam'] };
    assert.deepEqual(elementPresetIds(document, 'first'), { text: undefined, colour: 'foam' });
    document.colourPresets = [];
    assert.deepEqual(elementPresetIds(document, 'first'), { text: undefined, colour: undefined });
});

test('following an element changes the browsed preset without preventing later manual choices', () => {
    const manual = { elementId: 'first', linkedId: 'small', selectedId: 'large' };
    assert.equal(followPresetSelection(manual, 'first', 'small'), manual);
    const switched = followPresetSelection(manual, 'second', 'small');
    assert.equal(switched.selectedId, 'small');
    assert.equal(followPresetSelection(switched, 'second', 'large').selectedId, 'large');
    assert.equal(followPresetSelection(switched, 'custom').selectedId, 'small');
    assert.equal(followPresetSelection(switched).selectedId, 'small');
});
