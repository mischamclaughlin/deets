/** Browser-only guides; these paths never supply exported element coordinates. */
export interface GridSettings {
    visible: boolean;
    rows: number;
    columns: number;
    circumferences: number;
    circumferenceStart: "inside" | "outside";
    circumferenceSpacing: number;
    curvedRows: boolean;
    curvedColumns: boolean;
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

/** Straight chords or elliptical arcs, bounded by the same content circle. */
export function gridPaths(size: number, inset: number, grid: GridSettings): string[] {
    const centre = size / 2;
    const radius = centre - inset;
    if (!grid.visible || radius <= 0) return [];
    const paths: string[] = [];
    for (const [count, curved, vertical] of [
        [grid.rows, grid.curvedRows, false],
        [grid.columns, grid.curvedColumns, true],
    ] as const) {
        if (!Number.isInteger(count) || count < 1 || count > 24)
            throw new RangeError("Grid counts must be integers from 1 to 24.");
        for (let index = 1; index < count; index++) {
            const offset = radius * (2 * index / count - 1);
            const coordinate = centre + offset;
            if (curved && Math.abs(offset) > 1e-10) {
                paths.push(vertical
                    ? `M ${centre} ${inset} A ${Math.abs(offset)} ${radius} 0 0 ${offset > 0 ? 1 : 0} ${centre} ${size - inset}`
                    : `M ${inset} ${centre} A ${radius} ${Math.abs(offset)} 0 0 ${offset > 0 ? 0 : 1} ${size - inset} ${centre}`);
            } else {
                const span = Math.sqrt(radius * radius - offset * offset);
                paths.push(vertical
                    ? `M ${coordinate} ${centre - span} L ${coordinate} ${centre + span}`
                    : `M ${centre - span} ${coordinate} L ${centre + span} ${coordinate}`);
            }
        }
    }
    return paths;
}

/** Build rings from the chosen end; reduce spacing only when needed to fit them all. */
export function gridRadii(size: number, inset: number, grid: GridSettings): number[] {
    const radius = size / 2 - inset;
    if (!grid.visible || radius <= 0) return [];
    if (!Number.isInteger(grid.circumferences) || grid.circumferences < 0 || grid.circumferences > 24)
        throw new RangeError("Extra circumferences must be an integer from 0 to 24.");
    if (!Number.isInteger(grid.circumferenceSpacing) || grid.circumferenceSpacing < 1 || grid.circumferenceSpacing > 100)
        throw new RangeError("Circumference spacing must be an integer from 1 to 100.");
    if (grid.circumferenceStart !== "inside" && grid.circumferenceStart !== "outside")
        throw new RangeError("Choose an inside or outside circumference start.");
    const spacing = Math.min(grid.circumferenceSpacing, radius / (grid.circumferences + 1));
    return Array.from({ length: grid.circumferences }, (_, index) => {
        const distance = spacing * (index + 1);
        return grid.circumferenceStart === "inside" ? distance : radius - distance;
    });
}
