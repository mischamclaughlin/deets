export interface LayerSlot { id: string; top: number; height: number }

/** Move towards the nearest insertion slot, keeping the whole tile inside the list. */
export function layerDragLayout(slots: LayerSlot[], id: string, distance: number) {
    const source = slots.findIndex((slot) => slot.id === id);
    if (source < 0 || !slots.length) return { destination: source, offset: 0, shifts: new Map<string, number>() };
    const tile = slots[source];
    const last = slots[slots.length - 1];
    const offset = Math.max(slots[0].top - tile.top, Math.min(last.top + last.height - tile.height - tile.top, distance));
    const remaining = slots.filter((slot) => slot.id !== id);
    const gap = slots.length > 1 ? slots[1].top - slots[0].top - slots[0].height : 0;
    // Compare insertion positions, so differently sized tiles can reach both ends.
    let destination = source;
    let closest = Math.abs(offset);
    let candidateTop = slots[0].top;
    for (let index = 0; index <= remaining.length; index++) {
        const distance = Math.abs(candidateTop - tile.top - offset);
        if (distance < closest) { destination = index; closest = distance; }
        if (index < remaining.length) candidateTop += remaining[index].height + gap;
    }
    const order = [...remaining];
    order.splice(destination, 0, tile);
    let top = slots[0].top;
    const shifts = new Map<string, number>();
    for (const slot of order) {
        shifts.set(slot.id, top - slot.top);
        top += slot.height + gap;
    }
    return { destination, offset, shifts };
}
