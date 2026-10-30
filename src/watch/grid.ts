/** Native-coordinate guide geometry; SVG paths themselves are browser-only annotations. */
export interface GridSettings {
    visible: boolean;
    rows: number;
    columns: number;
    circumferences: number;
    circumferenceStart: "inside" | "outside";
    circumferenceSpacing: number;
    curvedRows: boolean;
    curvedColumns: boolean;
    /** Normalised browser-only positions; null removes a generated line. */
    edits?: Record<string, number | null>;
}

export const defaultGrid: GridSettings = {
    visible: false,
    rows: 4,
    columns: 4,
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
    for (const axis of ["rows", "columns"] as const) {
        const count = grid[axis];
        if (!Number.isInteger(count) || count < 1 || count > 24)
            throw new RangeError("Grid counts must be integers from 1 to 24.");
        for (let index = 1; index < count; index++)
            result.push({ id: `${axis}-${index}`, axis, value: 2 * index / count - 1 });
    }
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
    return result;
}

/** Straight chords, elliptical arcs and rings bounded by the same content circle. */
export function gridLines(size: number, inset: number, grid: GridSettings): GridLine[] {
    const centre = size / 2;
    const radius = centre - inset;
    return positions(size, inset, grid).map((line) => {
        const offset = radius * line.value;
        const coordinate = centre + offset;
        if (line.axis === "rings") {
            return { ...line, path: `M ${centre - offset} ${centre} A ${offset} ${offset} 0 1 0 ${centre + offset} ${centre} A ${offset} ${offset} 0 1 0 ${centre - offset} ${centre}` };
        }
        const vertical = line.axis === "columns";
        const curved = vertical ? grid.curvedColumns : grid.curvedRows;
        if (curved && Math.abs(offset) > 1e-10) {
            return { ...line, path: vertical
                ? `M ${centre} ${inset} A ${Math.abs(offset)} ${radius} 0 0 ${offset > 0 ? 1 : 0} ${centre} ${size - inset}`
                : `M ${inset} ${centre} A ${radius} ${Math.abs(offset)} 0 0 ${offset > 0 ? 0 : 1} ${size - inset} ${centre}` };
        }
        const span = Math.sqrt(Math.max(0, radius * radius - offset * offset));
        return { ...line, path: vertical
            ? `M ${coordinate} ${centre - span} L ${coordinate} ${centre + span}`
            : `M ${centre - span} ${coordinate} L ${centre + span} ${coordinate}` };
    });
}

export function gridPaths(size: number, inset: number, grid: GridSettings): string[] {
    return gridLines(size, inset, grid).filter((line) => line.axis !== "rings").map((line) => line.path);
}

export function gridRadii(size: number, inset: number, grid: GridSettings): number[] {
    const radius = size / 2 - inset;
    const spacing = Math.min(grid.circumferenceSpacing, radius / (grid.circumferences + 1));
    return positions(size, inset, grid).filter((line) => line.axis === "rings").map((line) => {
        if (grid.edits?.[line.id] !== undefined) return line.value * radius;
        const distance = spacing * Number(line.id.slice(6));
        return grid.circumferenceStart === "inside" ? distance : radius - distance;
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
    // Keep a small visible chord even when dragging beyond the watch boundary.
    const limit = Math.max(0.5, 1 - Math.min(0.5, 0.5 / radius));
    const next = value === null ? null : Math.max(line.axis === "rings" ? 1 - limit : -limit, Math.min(limit, value));
    const edits = { ...grid.edits, [id]: next };
    if (mirror && line.axis !== "rings") {
        const partner = lines.find((candidate) => candidate.id !== id && candidate.axis === line.axis &&
            Math.abs(candidate.value + line.value) < 1e-9);
        // A missing reflection gets a stable ID so repeated drags update the same line.
        const partnerId = partner?.id ?? (id.endsWith("-mirror") ? id.slice(0, -7) : `${id}-mirror`);
        if (partner || (next !== null && Math.abs(next) > 1e-9))
            edits[partnerId] = next === null || Math.abs(next) < 1e-9 ? null : -next;
    }
    return { ...grid, edits };
}
