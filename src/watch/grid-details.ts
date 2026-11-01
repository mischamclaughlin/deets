import { gridLineGap, gridLines, gridLineValues, type GridSettings } from './grid.ts';

/** Coordinates are native pixels; curved-guide coordinates describe their centre crossing. */
export function gridLineDetails(size: number, inset: number, grid: GridSettings, ids: readonly string[]) {
    const centre = size / 2;
    const radius = centre - inset;
    return gridLines(size, inset, grid).filter((line) => ids.includes(line.id)).map((line) => {
        const curved = line.axis === 'rows' ? grid.curvedRows : line.axis === 'columns' ? grid.curvedColumns : false;
        const offset = line.value * radius;
        return {
            id: line.id,
            axis: line.axis,
            curved,
            label: line.axis === 'rings' ? 'Ring' : `${curved ? 'Curved ' : ''}${line.axis === 'rows' ? 'horizontal' : 'vertical'}`,
            offset,
            coordinate: line.axis === 'rings' ? offset : centre + offset,
            edges: gridLineValues(size, inset, grid, line).map((value) => value * radius + (line.axis === 'rings' ? 0 : centre)),
            width: gridLineGap(size, inset, grid, line.id),
        };
    });
}

/** Duplicate exact guide geometry, leaving originals untouched and selecting independent copies. */
export function copyGridLines(size: number, inset: number, grid: GridSettings, ids: readonly string[]): {
    grid: GridSettings; ids: string[];
} {
    const selected = gridLines(size, inset, grid).filter((line) => ids.includes(line.id));
    if (!selected.length) return { grid, ids: [] };
    const edits = { ...grid.edits }, gaps = { ...grid.gaps }, gapMirrors = { ...grid.gapMirrors };
    const occupied = new Set([...Object.keys(edits), ...Object.keys(gaps), ...Object.keys(gapMirrors)]);
    // Ring indices 1–24 are reserved for the generated ring controls.
    for (let index = 1; index <= 24; index++) occupied.add(`rings-${index}`);
    const copiedIds: string[] = [];
    for (const line of selected) {
        let index = 1;
        while (occupied.has(`${line.axis}-${index}`)) index++;
        const id = `${line.axis}-${index}`;
        occupied.add(id);
        copiedIds.push(id);
        edits[id] = line.value;
        const width = gridLineGap(size, inset, grid, line.id);
        if (width) gaps[id] = width;
        if (grid.gapMirrors?.[line.id]) gapMirrors[id] = true;
    }
    if ([edits, gaps, gapMirrors].some((entries) => Object.keys(entries).length > 256))
        throw new RangeError('There is no room for more grid lines. Delete unused lines first.');
    return { grid: { ...grid, edits, gaps: Object.keys(gaps).length ? gaps : undefined,
        gapMirrors: Object.keys(gapMirrors).length ? gapMirrors : undefined }, ids: copiedIds };
}
