import { devices, type Scene } from '../../shared/scene.ts';
import { defaultGrid, gridLines, type GridSettings } from './grid.ts';
import { refreshFonts } from './api.ts';
import { parseLayout, type EditorLayout } from './editor-layout.ts';

export interface DesignDocument { scene: Scene; grid: GridSettings; layout?: EditorLayout }
export const maxDesignBytes = 1024 * 1024;
const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validate browser annotations separately; native validation owns the scene. */
export function parseDesign(text: string): DesignDocument {
    if (new TextEncoder().encode(text).length > maxDesignBytes) throw new Error('Choose a design file up to 1 MB.');
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
    if (!object(value) || value.format !== 'deets' || value.version !== 1 || !object(value.scene) || !object(value.grid))
        throw new Error('Choose a supported .deets.json design file.');
    const scene = value.scene;
    if (scene.version !== 2 || typeof scene.device !== 'string' || !Object.hasOwn(devices, scene.device) ||
        typeof scene.name !== 'string' || !Array.isArray(scene.elements))
        throw new Error('This file does not contain a supported watch design.');
    const grid = value.grid;
    const allowed = new Set([...Object.keys(defaultGrid), 'edits', 'gaps', 'gapMirrors']);
    if (Object.keys(grid).some((key) => !allowed.has(key)) ||
        ['visible', 'curvedRows', 'curvedColumns'].some((key) => typeof grid[key] !== 'boolean') ||
        ['edits', 'gaps', 'gapMirrors'].some((key) => grid[key] !== undefined && !object(grid[key])))
        throw new Error('This file contains invalid grid settings.');
    const size = devices[scene.device as keyof typeof devices];
    const inset = scene.edgeInset ?? 0;
    if (typeof inset !== 'number' || !Number.isInteger(inset) || inset < 0 || inset >= size / 2)
        throw new Error('This file contains invalid edge clearance.');
    // Validate hidden grids as well, using the same geometry rules as the editor.
    gridLines(size, inset, { ...grid, visible: true } as unknown as GridSettings);
    return { scene: scene as unknown as Scene, grid: grid as unknown as GridSettings,
        ...(value.layout === undefined ? {} : { layout: parseLayout(value.layout, scene.elements.map((element) => object(element) ? String(element.id) : '')) }) };
}

export function serialiseDesign(document: DesignDocument): string {
    return JSON.stringify({ format: 'deets', version: 1, ...document }, null, 2) + '\n';
}

/** Rebuild local glyphs and validate the complete scene before the caller applies it. */
export async function prepareDesign(text: string, signal?: AbortSignal): Promise<DesignDocument> {
    const document = parseDesign(text);
    signal?.throwIfAborted();
    const mapped = await refreshFonts(document.scene, signal);
    signal?.throwIfAborted();
    return { ...document, scene: mapped.scene };
}

export function designFilename(name: string): string {
    return `${name.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'design'}.deets.json`;
}
