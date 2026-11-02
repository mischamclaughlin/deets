import { gridLines, gridLineValues, type GridSettings } from './grid.ts';

export interface GridAreaBox { x: number; y: number; width: number; height: number }
export interface GridArea {
    anchor: { x: number; y: number };
    /** Browser-only coverage of the connected native-pixel region. */
    path: string;
    bounds: GridAreaBox;
    /** Largest whole-pixel rectangle contained by every continuous boundary. */
    box: GridAreaBox;
    pixels: number;
    /** Exact continuous cell bounds, present only when all outer edges are straight. */
    rectangle?: GridAreaBox;
    /** Browser-only provenance and identity, independent of the click anchor. */
    geometry?: { size: number; inset: number; signature: string };
    key?: string;
}
interface Boundary { axis: 'rows' | 'columns' | 'rings'; offset: number; curved: boolean; positive: boolean }
const epsilon = 1e-8;

/** Select an enclosed guide region without deriving geometry from rendered SVG. */
export function selectGridArea(size: number, inset: number, grid: GridSettings,
    point: { x: number; y: number }): GridArea | undefined {
    if (!Number.isInteger(size) || size < 1 || size > 1024 || !Number.isFinite(inset) || inset < 0 || inset >= size / 2 ||
        !Number.isFinite(point.x) || !Number.isFinite(point.y) || !grid.visible) return;
    const centre = size / 2, radius = centre - inset;
    const radiusSquared = radius * radius;
    if ((point.x - centre) ** 2 + (point.y - centre) ** 2 > radiusSquared + epsilon) return;
    let boundaries: Boundary[];
    try {
        boundaries = gridLines(size, inset, grid).flatMap((line) => gridLineValues(size, inset, grid, line).map((value) => ({
            axis: line.axis, offset: value * radius,
            curved: line.axis === 'rows' ? grid.curvedRows : line.axis === 'columns' && grid.curvedColumns,
            positive: false,
        })));
    } catch { return; }
    if (!boundaries.length) return;

    function curve(offset: number, cross: number) {
        return centre + offset * Math.sqrt(Math.max(0, 1 - ((cross - centre) / radius) ** 2));
    }
    function distance(boundary: Boundary, x: number, y: number) {
        if (boundary.axis === 'rings') return (x - centre) ** 2 + (y - centre) ** 2 - boundary.offset ** 2;
        const vertical = boundary.axis === 'columns';
        return (vertical ? x : y) - (boundary.curved
            ? curve(boundary.offset, vertical ? y : x) : centre + boundary.offset);
    }
    const signature = JSON.stringify(boundaries.map(({ axis, offset, curved }) => [axis, offset, curved]));
    for (const boundary of boundaries) boundary.positive = distance(boundary, point.x, point.y) >= 0;

    function matches(x: number, y: number) {
        if ((x - centre) ** 2 + (y - centre) ** 2 > radiusSquared + epsilon) return false;
        return boundaries.every((boundary) => boundary.positive
            ? distance(boundary, x, y) >= -epsilon : distance(boundary, x, y) <= epsilon);
    }
    // Straight boundaries supply a candidate continuous rectangle. Curved and
    // circular constraints may be redundant, but must not trim any of its interior.
    let rectangleLeft = 0, rectangleRight = size, rectangleTop = 0, rectangleBottom = size;
    for (const boundary of boundaries) {
        if (boundary.axis === 'rings' || boundary.curved && Math.abs(boundary.offset) > epsilon) continue;
        const coordinate = centre + boundary.offset;
        if (boundary.axis === 'columns') {
            if (boundary.positive) rectangleLeft = Math.max(rectangleLeft, coordinate);
            else rectangleRight = Math.min(rectangleRight, coordinate);
        } else {
            if (boundary.positive) rectangleTop = Math.max(rectangleTop, coordinate);
            else rectangleBottom = Math.min(rectangleBottom, coordinate);
        }
    }
    const candidateRectangle = { x: rectangleLeft, y: rectangleTop,
        width: rectangleRight - rectangleLeft, height: rectangleBottom - rectangleTop };
    // Classify using the actual pointer first. A fractional guide can pass between
    // that point and the centre of its pixel, so consider adjacent pixel centres.
    let start = -1, closest = Infinity;
    for (let y = Math.max(0, Math.floor(point.y) - 1); y <= Math.min(size - 1, Math.floor(point.y) + 1); y++) {
        for (let x = Math.max(0, Math.floor(point.x) - 1); x <= Math.min(size - 1, Math.floor(point.x) + 1); x++) {
            const separation = (x + .5 - point.x) ** 2 + (y + .5 - point.y) ** 2;
            if (separation < closest && matches(x + .5, y + .5)) { start = y * size + x; closest = separation; }
        }
    }
    if (start < 0) return;
    const visited = new Uint8Array(size * size);
    const queue = new Int32Array(size * size);
    let head = 0, tail = 1;
    queue[0] = start;
    visited[start] = 1;
    let left = size, right = 0, top = size, bottom = 0;
    while (head < tail) {
        const index = queue[head++];
        const x = index % size, y = Math.floor(index / size);
        left = Math.min(left, x); right = Math.max(right, x + 1);
        top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        for (const neighbour of [x > 0 ? index - 1 : -1, x + 1 < size ? index + 1 : -1,
            y > 0 ? index - size : -1, y + 1 < size ? index + size : -1]) {
            if (neighbour < 0 || visited[neighbour]) continue;
            visited[neighbour] = 2;
            const nx = neighbour % size, ny = Math.floor(neighbour / size);
            if (!matches(nx + .5, ny + .5)) continue;
            visited[neighbour] = 1;
            queue[tail++] = neighbour;
        }
    }

    function safeRectangle(x: number, y: number, width: number, height: number) {
        const farX = Math.max(Math.abs(x - centre), Math.abs(x + width - centre));
        const farY = Math.max(Math.abs(y - centre), Math.abs(y + height - centre));
        if (farX * farX + farY * farY > radiusSquared + epsilon) return false;
        for (const boundary of boundaries) {
            let low: number, high: number;
            if (boundary.axis === 'rings') {
                const nearX = Math.max(x - centre, centre - x - width, 0);
                const nearY = Math.max(y - centre, centre - y - height, 0);
                low = nearX * nearX + nearY * nearY - boundary.offset ** 2;
                high = farX * farX + farY * farY - boundary.offset ** 2;
            } else {
                const vertical = boundary.axis === 'columns';
                const cross = vertical ? y : x;
                const coordinate = vertical ? x : y;
                const crossSpan = vertical ? height : width;
                const span = vertical ? width : height;
                let minimum = centre + boundary.offset, maximum = minimum;
                if (boundary.curved) {
                    const a = curve(boundary.offset, cross), b = curve(boundary.offset, cross + crossSpan);
                    minimum = Math.min(a, b); maximum = Math.max(a, b);
                    if (cross <= centre && cross + crossSpan >= centre) {
                        minimum = Math.min(minimum, centre + boundary.offset);
                        maximum = Math.max(maximum, centre + boundary.offset);
                    }
                }
                low = coordinate - maximum; high = coordinate + span - minimum;
            }
            if (boundary.positive ? low < -epsilon : high > epsilon) return false;
        }
        return true;
    }

    // The maximal-rectangle histogram uses only cells whose whole square is safe,
    // including curved edges and the inner hole of an annulus, not just corners.
    const heights = new Int32Array(size);
    let box: GridAreaBox | undefined;
    let bestArea = 0, bestDistance = Infinity;
    const paths: string[] = [];
    let openRuns = new Map<string, { x: number; y: number; width: number; height: number }>();
    const flush = (run: GridAreaBox) => paths.push(`M${run.x} ${run.y}h${run.width}v${run.height}h${-run.width}Z`);
    for (let y = top; y < bottom; y++) {
        const runs = new Map<string, GridAreaBox>();
        for (let x = left; x < right;) {
            if (visited[y * size + x] !== 1) { x++; continue; }
            const beginning = x;
            while (x < right && visited[y * size + x] === 1) x++;
            const key = `${beginning}:${x}`;
            const previous = openRuns.get(key);
            runs.set(key, previous ? { ...previous, height: previous.height + 1 } : { x: beginning, y, width: x - beginning, height: 1 });
        }
        for (const [key, run] of openRuns) if (!runs.has(key)) flush(run);
        openRuns = runs;
        for (let x = left; x < right; x++) heights[x] = visited[y * size + x] === 1 && safeRectangle(x, y, 1, 1) ? heights[x] + 1 : 0;
        const stack: Array<{ x: number; height: number }> = [];
        for (let x = left; x <= right; x++) {
            const height = x === right ? 0 : heights[x];
            let beginning = x;
            while (stack.length && stack[stack.length - 1].height > height) {
                const item = stack.pop()!;
                beginning = item.x;
                const candidate = { x: item.x, y: y - item.height + 1, width: x - item.x, height: item.height };
                const area = candidate.width * candidate.height;
                const separation = (candidate.x + candidate.width / 2 - point.x) ** 2 + (candidate.y + candidate.height / 2 - point.y) ** 2;
                if (area > bestArea || area === bestArea && separation < bestDistance) {
                    box = candidate; bestArea = area; bestDistance = separation;
                }
            }
            if (!stack.length || stack[stack.length - 1].height < height) stack.push({ x: beginning, height });
        }
    }
    for (const run of openRuns.values()) flush(run);
    if (!box) return;
    const rectangle = candidateRectangle.width > 0 && candidateRectangle.height > 0
        && safeRectangle(candidateRectangle.x, candidateRectangle.y, candidateRectangle.width, candidateRectangle.height)
        ? candidateRectangle : undefined;
    const path = paths.join(' ');
    return { anchor: { ...point }, path, bounds: { x: left, y: top, width: right - left, height: bottom - top }, box, pixels: tail,
        ...(rectangle ? { rectangle } : {}), geometry: { size, inset, signature },
        key: `${signature}:${boundaries.map((boundary) => Number(boundary.positive)).join('')}:${path}` };

}
