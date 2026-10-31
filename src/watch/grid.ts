/** Native-coordinate guide geometry; SVG paths themselves are browser-only annotations. */
export interface GridSettings {
    visible: boolean;
    circumferences: number;
    circumferenceStart: "inside" | "outside";
    circumferenceSpacing: number;
    curvedRows: boolean;
    curvedColumns: boolean;
    /** Independent normalised browser-only positions; null removes a line. */
    edits?: Record<string, number | null>;
    /** Full native-pixel width of a symmetric gap around each logical line. */
    gaps?: Record<string, number>;
}

export const defaultGrid: GridSettings = {
    visible: false,
    circumferences: 0,
    circumferenceStart: "outside",
    circumferenceSpacing: 24,
    curvedRows: false,
    curvedColumns: false,
};

export interface GridLine {
    id: string;
    axis: "rows" | "columns" | "rings";
    /** Signed offset from the centre, or radius for rings, divided by the content radius. */
    value: number;
    path: string;
}

type LinePosition = Omit<GridLine, "path">;

function positions(size: number, inset: number, grid: GridSettings): LinePosition[] {
    const radius = size / 2 - inset;
    if (!grid.visible || radius <= 0) return [];
    const result: LinePosition[] = [];
    if (!Number.isInteger(grid.circumferences) || grid.circumferences < 0 || grid.circumferences > 24)
        throw new RangeError("Extra circumferences must be an integer from 0 to 24.");
    if (!Number.isInteger(grid.circumferenceSpacing) || grid.circumferenceSpacing < 1 || grid.circumferenceSpacing > 100)
        throw new RangeError("Circumference spacing must be an integer from 1 to 100.");
    if (grid.circumferenceStart !== "inside" && grid.circumferenceStart !== "outside")
        throw new RangeError("Choose an inside or outside circumference start.");
    const spacing = Math.min(grid.circumferenceSpacing, radius / (grid.circumferences + 1));
    for (let index = 1; index <= grid.circumferences; index++) {
        const distance = spacing * index;
        result.push({ id: `rings-${index}`, axis: "rings",
            value: (grid.circumferenceStart === "inside" ? distance : radius - distance) / radius });
    }
    const edits = Object.entries(grid.edits ?? {});
    if (edits.length > 256) throw new RangeError("Too many grid edits.");
    for (const [id, value] of edits) {
        const axis = /^(rows|columns|rings)-[1-9]\d*(?:-mirror)*$/.exec(id)?.[1] as GridLine["axis"] | undefined;
        if (!axis || (value !== null && (!Number.isFinite(value) || value <= (axis === "rings" ? 0 : -1) || value >= 1)))
            throw new RangeError("Grid edits must have valid IDs and positions within the content circle.");
        const existing = result.find((line) => line.id === id);
        if (existing) {
            if (value === null) result.splice(result.indexOf(existing), 1);
            else existing.value = value;
        } else if (value !== null) result.push({ id, axis, value });
    }
    const gaps = Object.entries(grid.gaps ?? {});
    if (gaps.length > 256) throw new RangeError("Too many grid gaps.");
    for (const [id, gap] of gaps) {
        if (!/^(rows|columns|rings)-[1-9]\d*(?:-mirror)*$/.test(id) || !Number.isSafeInteger(gap) || gap < 0)
            throw new RangeError("Grid gaps must be non-negative whole native pixels with valid line IDs.");
    }
    return result;
}

/** Add exactly one independent guide at the centre without moving existing guides. */
export function addGridLine(grid: GridSettings, axis: "rows" | "columns"): { grid: GridSettings; id: string } {
    const edits = { ...grid.edits };
    let index = 1;
    while (Object.hasOwn(edits, `${axis}-${index}`)) index++;
    const id = `${axis}-${index}`;
    if (Object.keys(edits).length >= 256) throw new RangeError("Too many grid edits.");
    edits[id] = 0;
    return { grid: { ...grid, visible: true, edits }, id };
}

/** Regenerate rings without clearing independent horizontal or vertical guides. */
export function configureGridRings(grid: GridSettings,
    settings: Partial<Pick<GridSettings, "circumferences" | "circumferenceSpacing" | "circumferenceStart">>): GridSettings {
    const keep = <T,>(entries: Record<string, T> | undefined) => {
        const remaining = Object.entries(entries ?? {}).filter(([id]) => !id.startsWith("rings-"));
        return remaining.length ? Object.fromEntries(remaining) : undefined;
    };
    return { ...grid, ...settings, edits: keep(grid.edits), gaps: keep(grid.gaps) };
}

function bounds(radius: number, line: LinePosition, gap = 0): [number, number] {
    const limit = Math.max(0.5, 1 - Math.min(0.5, 0.5 / radius));
    const half = gap / (2 * radius);
    return [(line.axis === "rings" ? 1 - limit : -limit) + half, limit - half];
}

function availableGap(radius: number, line: LinePosition): number {
    const [minimum, maximum] = bounds(radius, line);
    return Math.max(0, Math.floor(2 * radius * Math.min(line.value - minimum, maximum - line.value) + 1e-9));
}

function effectiveGap(radius: number, grid: GridSettings, line: LinePosition): number {
    return Math.min(grid.gaps?.[line.id] ?? 0, availableGap(radius, line));
}

/** Native positions of the visible edges; selection and movement keep the logical centre. */
export function gridLineValues(size: number, inset: number, grid: GridSettings, line: LinePosition): number[] {
    const radius = size / 2 - inset;
    const gap = radius > 0 ? effectiveGap(radius, grid, line) : 0;
    return gap > 0 ? [line.value - gap / (2 * radius), line.value + gap / (2 * radius)] : [line.value];
}

export function gridLineGap(size: number, inset: number, grid: GridSettings, id: string): number {
    const line = positions(size, inset, grid).find((item) => item.id === id);
    return line ? effectiveGap(size / 2 - inset, grid, line) : 0;
}

function reflected(lines: LinePosition[], line: LinePosition): LinePosition | undefined {
    return lines.find((candidate) => candidate.id !== line.id && candidate.axis === line.axis &&
        Math.abs(candidate.value + line.value) < 1e-9);
}

function reflectedId(line: LinePosition, partner?: LinePosition): string {
    return partner?.id ?? (line.id.endsWith("-mirror") ? line.id.slice(0, -7) : `${line.id}-mirror`);
}

export function maxGridLineGap(size: number, inset: number, grid: GridSettings,
    ids: readonly string[], mirror = false): number {
    const lines = positions(size, inset, grid);
    const selected = lines.filter((line) => ids.includes(line.id));
    if (!selected.length) return 0;
    const targets = selected.flatMap((line) => {
        const partner = mirror && line.axis !== "rings" ? reflected(lines, line) : undefined;
        return partner ? [line, partner] : [line];
    });
    return Math.min(...targets.map((line) => availableGap(size / 2 - inset, line)));
}

/** Apply one shared width atomically; setting zero restores each original centre line. */
export function setGridLineGaps(size: number, inset: number, grid: GridSettings,
    ids: readonly string[], gap: number, mirror = false): GridSettings {
    if (!Number.isSafeInteger(gap) || gap < 0) throw new RangeError("Choose a non-negative whole-pixel grid gap.");
    const lines = positions(size, inset, grid);
    const selected = lines.filter((line) => ids.includes(line.id));
    if (!selected.length) return grid;
    const width = Math.min(gap, maxGridLineGap(size, inset, grid, ids, mirror));
    const edits = { ...grid.edits };
    const gaps = { ...grid.gaps };
    for (const line of selected) {
        if (width) gaps[line.id] = width;
        else delete gaps[line.id];
        if (mirror && line.axis !== "rings") {
            const partner = reflected(lines, line);
            if (partner || Math.abs(line.value) > 1e-9) {
                const id = reflectedId(line, partner);
                if (!partner) edits[id] = -line.value;
                if (width) gaps[id] = width;
                else delete gaps[id];
            }
        }
    }
    if (Object.keys(gaps).length > 256) throw new RangeError("Too many grid gaps.");
    if (Object.keys(edits).length > 256) throw new RangeError("Too many grid edits.");
    return { ...grid, ...(grid.edits || Object.keys(edits).length ? { edits } : {}), gaps: Object.keys(gaps).length ? gaps : undefined };
}

/** Straight chords, elliptical arcs and rings bounded by the same content circle. */
export function gridLines(size: number, inset: number, grid: GridSettings): GridLine[] {
    const centre = size / 2;
    const radius = centre - inset;
    const path = (line: LinePosition, value: number) => {
        const offset = radius * value;
        const coordinate = centre + offset;
        if (line.axis === "rings") {
            return `M ${centre - offset} ${centre} A ${offset} ${offset} 0 1 0 ${centre + offset} ${centre} A ${offset} ${offset} 0 1 0 ${centre - offset} ${centre}`;
        }
        const vertical = line.axis === "columns";
        const curved = vertical ? grid.curvedColumns : grid.curvedRows;
        if (curved && Math.abs(offset) > 1e-10) {
            return vertical
                ? `M ${centre} ${inset} A ${Math.abs(offset)} ${radius} 0 0 ${offset > 0 ? 1 : 0} ${centre} ${size - inset}`
                : `M ${inset} ${centre} A ${radius} ${Math.abs(offset)} 0 0 ${offset > 0 ? 0 : 1} ${size - inset} ${centre}`;
        }
        const span = Math.sqrt(Math.max(0, radius * radius - offset * offset));
        return vertical
            ? `M ${coordinate} ${centre - span} L ${coordinate} ${centre + span}`
            : `M ${centre - span} ${coordinate} L ${centre + span} ${coordinate}`;
    };
    return positions(size, inset, grid).map((line) => ({
        ...line,
        path: gridLineValues(size, inset, grid, line).map((value) => path(line, value)).join(" "),
    }));
}

export function gridPaths(size: number, inset: number, grid: GridSettings): string[] {
    return gridLines(size, inset, grid).filter((line) => line.axis !== "rings").map((line) => line.path);
}

export function gridRadii(size: number, inset: number, grid: GridSettings): number[] {
    const radius = size / 2 - inset;
    const spacing = Math.min(grid.circumferenceSpacing, radius / (grid.circumferences + 1));
    return positions(size, inset, grid).filter((line) => line.axis === "rings").flatMap((line) => {
        const distance = spacing * Number(line.id.slice(6));
        const centre = grid.edits?.[line.id] !== undefined ? line.value * radius
            : grid.circumferenceStart === "inside" ? distance : radius - distance;
        const gap = effectiveGap(radius, grid, line);
        return gap ? [centre - gap / 2, centre + gap / 2] : [centre];
    });
}

/** Edit from the current geometry; mirror pairs reflect across the watch centre. */
export function editGridLine(size: number, inset: number, grid: GridSettings, id: string,
    value: number | null, mirror = false): GridSettings {
    const lines = positions(size, inset, grid);
    const line = lines.find((candidate) => candidate.id === id);
    if (!line) return grid;
    if (value !== null && !Number.isFinite(value)) throw new RangeError("Grid positions must be finite.");
    const radius = size / 2 - inset;
    const gap = effectiveGap(radius, grid, line);
    const [minimum, maximum] = bounds(radius, line, gap);
    const next = value === null ? null : Math.max(minimum, Math.min(maximum, value));
    const edits = { ...grid.edits, [id]: next };
    const gaps = { ...grid.gaps };
    if (next === null || !gap) delete gaps[id];
    else gaps[id] = gap;
    if (mirror && line.axis !== "rings") {
        const partner = reflected(lines, line);
        const partnerId = reflectedId(line, partner);
        if (partner || (next !== null && Math.abs(next) > 1e-9)) {
            edits[partnerId] = next === null || Math.abs(next) < 1e-9 ? null : -next;
            if (edits[partnerId] === null || !gap) delete gaps[partnerId];
            else gaps[partnerId] = gap;
        }
    }
    if (Object.keys(edits).length > 256) throw new RangeError("Too many grid edits.");
    if (Object.keys(gaps).length > 256) throw new RangeError("Too many grid gaps.");
    return { ...grid, edits, ...(grid.gaps || Object.keys(gaps).length ? { gaps: Object.keys(gaps).length ? gaps : undefined } : {}) };
}

/** Move selected logical lines by a shared displacement, treating mirrored pairs once. */
export function moveGridLines(size: number, inset: number, grid: GridSettings,
    ids: readonly string[], delta: number, mirror = false): GridSettings {
    if (!Number.isFinite(delta)) throw new RangeError("Grid displacement must be finite.");
    if (delta === 0) return grid;
    const lines = positions(size, inset, grid);
    const radius = size / 2 - inset;
    const plan = new Map<string, { line: LinePosition; direction: number; gap: number }>();
    for (const id of ids) {
        const line = lines.find((candidate) => candidate.id === id);
        if (!line || plan.has(id)) continue;
        const gap = effectiveGap(radius, grid, line);
        plan.set(id, { line, direction: 1, gap });
        if (mirror && line.axis !== "rings") {
            const partner = reflected(lines, line);
            const partnerId = reflectedId(line, partner);
            plan.set(partnerId, { line: { ...line, id: partnerId, value: -line.value }, direction: -1, gap });
        }
    }
    if (!plan.size) return grid;
    let minimumDelta = -Infinity, maximumDelta = Infinity;
    for (const { line, direction, gap } of plan.values()) {
        const [minimum, maximum] = bounds(radius, line, gap);
        const lower = direction === 1 ? minimum - line.value : line.value - maximum;
        const upper = direction === 1 ? maximum - line.value : line.value - minimum;
        minimumDelta = Math.max(minimumDelta, lower);
        maximumDelta = Math.min(maximumDelta, upper);
    }
    if (minimumDelta > maximumDelta) return grid;
    const displacement = Math.max(minimumDelta, Math.min(maximumDelta, delta));
    const edits = { ...grid.edits }, gaps = { ...grid.gaps };
    for (const [id, { line, direction, gap }] of plan) {
        const value = line.value + direction * displacement;
        // A reflected centre collapses to its single original logical line.
        const duplicate = direction === -1 && Math.abs(value) < 1e-9;
        edits[id] = duplicate ? null : value;
        if (duplicate || !gap) delete gaps[id];
        else gaps[id] = gap;
    }
    if (Object.keys(edits).length > 256) throw new RangeError("Too many grid edits.");
    if (Object.keys(gaps).length > 256) throw new RangeError("Too many grid gaps.");
    return { ...grid, edits, ...(grid.gaps || Object.keys(gaps).length ? { gaps: Object.keys(gaps).length ? gaps : undefined } : {}) };
}
