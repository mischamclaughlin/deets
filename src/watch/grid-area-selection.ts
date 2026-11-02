import type { GridArea, GridAreaBox } from './grid-area.ts';

const epsilon = 1e-8;
const identity = (area: GridArea) => area.key ?? area.path;

/** Shift/Command/Ctrl-click toggles cells; a plain click replaces the collection. */
export function toggleGridArea(areas: readonly GridArea[], area: GridArea, additive: boolean): GridArea[] {
    if (!additive) return [area];
    const key = identity(area);
    return areas.some((item) => identity(item) === key)
        ? areas.filter((item) => identity(item) !== key) : [...areas, area];
}

export interface GridAreaMerge { area?: GridArea; error?: string }

/** Only a completely filled continuous rectangle becomes one placement box. */
export function mergeGridAreas(size: number, inset: number, areas: readonly GridArea[]): GridAreaMerge {
    const unique = [...new Map(areas.map((area) => [identity(area), area])).values()];
    if (!unique.length) return {};
    if (!Number.isInteger(size) || size < 1 || size > 1024 || !Number.isFinite(inset) || inset < 0 || inset >= size / 2)
        return { error: 'Choose a valid watch boundary before selecting areas.' };
    const first = unique[0].geometry;
    if (unique.length === 1) return first && (first.size !== size || first.inset !== inset)
        ? { error: 'The grid changed. Select the areas again.' } : { area: unique[0] };
    if (!first || first.size !== size || first.inset !== inset || unique.some((area) => !area.geometry
        || area.geometry.size !== size || area.geometry.inset !== inset || area.geometry.signature !== first.signature))
        return { error: 'The grid changed. Select the areas again.' };
    if (unique.some((area) => !area.rectangle))
        return { error: 'Choose areas with straight outer edges that form one rectangle.' };
    const rectangles = unique.map((area) => area.rectangle!);
    const left = Math.min(...rectangles.map((box) => box.x));
    const top = Math.min(...rectangles.map((box) => box.y));
    const right = Math.max(...rectangles.map((box) => box.x + box.width));
    const bottom = Math.max(...rectangles.map((box) => box.y + box.height));
    const coordinates = [...new Set(rectangles.flatMap((box) => [box.x, box.x + box.width]))].sort((a, b) => a - b);
    // Sweep every open vertical strip. Complete interval coverage proves there is
    // no missing cell, thin gap, diagonal-only contact or hole hidden by pixels.
    for (let index = 1; index < coordinates.length; index++) {
        if (coordinates[index] - coordinates[index - 1] <= epsilon) continue;
        const middle = (coordinates[index] + coordinates[index - 1]) / 2;
        const intervals = rectangles.filter((box) => box.x < middle && box.x + box.width > middle)
            .map((box) => [box.y, box.y + box.height] as const).sort((a, b) => a[0] - b[0]);
        let covered = top;
        for (const [start, end] of intervals) {
            if (start > covered + epsilon) break;
            covered = Math.max(covered, end);
        }
        if (covered < bottom - epsilon)
            return { error: 'Select connected areas that fill one rectangle, without gaps.' };
    }
    const centre = size / 2, radius = centre - inset;
    if (!Number.isFinite(radius) || radius <= 0 || [left, right].some((x) => [top, bottom].some((y) =>
        (x - centre) ** 2 + (y - centre) ** 2 > radius ** 2 + epsilon)))
        return { error: 'The combined rectangle must fit inside the watch boundary.' };
    const box: GridAreaBox = { x: Math.ceil(left - epsilon), y: Math.ceil(top - epsilon),
        width: Math.floor(right + epsilon) - Math.ceil(left - epsilon),
        height: Math.floor(bottom + epsilon) - Math.ceil(top - epsilon) };
    if (box.width < 1 || box.height < 1) return { error: 'Choose areas with room for a whole-pixel rectangle.' };
    const rectangle = { x: left, y: top, width: right - left, height: bottom - top };
    const path = `M${left} ${top}h${rectangle.width}v${rectangle.height}h${-rectangle.width}Z`;
    return { area: { anchor: { x: (left + right) / 2, y: (top + bottom) / 2 }, path, rectangle, box,
        bounds: { x: Math.floor(left), y: Math.floor(top), width: Math.ceil(right) - Math.floor(left), height: Math.ceil(bottom) - Math.floor(top) },
        pixels: (Math.ceil(right - .5) - Math.ceil(left - .5)) * (Math.ceil(bottom - .5) - Math.ceil(top - .5)),
        geometry: first, key: `${first.signature}:merged:${[...unique].map(identity).sort().join('|')}` } };
}
