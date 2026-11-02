import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreviewScenario, parsePreviewScenario } from '../src/watch/preview-scenario.ts';
import { previewWatch } from '../src/watch/api.ts';
import { rememberMapping, preparedMapping } from '../src/watch/mapping-cache.ts';
import { populatedScene } from './scene.fixture.ts';
import type { WatchMapping } from '../shared/scene.ts';

test('preview scenarios accept real calendar dates and reject malformed or unbounded values', () => {
    assert.deepEqual(parsePreviewScenario({ ...defaultPreviewScenario, date: '2028-02-29' }), { ...defaultPreviewScenario, date: '2028-02-29' });
    for (const value of [null, {}, { ...defaultPreviewScenario, date: '2026-02-29' }, { ...defaultPreviewScenario, date: '2100-01-01' },
        { ...defaultPreviewScenario, time: '24:00:00' }, { ...defaultPreviewScenario, readings: 'arbitrary' },
        { ...defaultPreviewScenario, weather: '../rain' }, { ...defaultPreviewScenario, scene: {} }])
        assert.throws(() => parsePreviewScenario(value));
});

test('scenario previews bypass and never contaminate canonical prepared pixels', async (context) => {
    const scene = structuredClone(populatedScene);
    const normal: WatchMapping = { scene, mapping: 'normal', size: 416, ops: [], areas: [], assets: {}, background: 0 };
    rememberMapping(normal);
    const scenario = { ...defaultPreviewScenario, readings: 'large' as const };
    const special = { ...normal, mapping: 'preview:large' };
    const fetch = context.mock.method(globalThis, 'fetch', async () => Response.json(special));
    assert.equal((await previewWatch(scene, false, undefined, scenario)).mapping, 'preview:large');
    assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1]!.body as string), { scene, night: false, preview: scenario });
    assert.equal(preparedMapping(scene), normal);
    assert.equal(await previewWatch(scene), normal);
    assert.equal(fetch.mock.callCount(), 1);
});
