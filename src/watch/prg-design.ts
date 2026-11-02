import { maxDesignBytes, parseDesign, type DesignDocument } from './design-file.ts';
import { defaultGrid } from './grid.ts';

export const maxPrgBytes = 16 * 1024 * 1024;
const start = 'DEETS_EDITABLE_V1:';
const end = ':END_DEETS_EDITABLE_V1';
const invalid = () => new Error('This Garmin file contains damaged or unsupported editable design data.');

/** Read data only. PRG code is never run, and embedded documents remain untrusted. */
export async function readPrgDesign(bytes: Uint8Array, signal?: AbortSignal): Promise<DesignDocument> {
    signal?.throwIfAborted();
    if (bytes.byteLength > maxPrgBytes) throw new Error('Choose a Garmin file up to 16 MB.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 16 || view.getUint32(0) !== 0xd000d00d) throw invalid();
    let resource: Uint8Array | undefined;
    let terminated = false;
    for (let offset = 0; offset < bytes.length;) {
        if (offset + 8 > bytes.length) throw invalid();
        const tag = view.getUint32(offset);
        const length = view.getUint32(offset + 4);
        offset += 8;
        if (length > bytes.length - offset) throw invalid();
        if (tag === 0) {
            if (length !== 0 || offset !== bytes.length) throw invalid();
            terminated = true;
            break;
        }
        if (tag === 0xf00d600d) {
            if (resource) throw invalid();
            resource = bytes.subarray(offset, offset + length);
        }
        offset += length;
    }
    if (!terminated || !resource) throw invalid();
    // ASCII framing survives Garmin's string encoding; only scan compiler resources.
    const text = new TextDecoder('latin1').decode(resource);
    const first = text.indexOf(start);
    if (first < 0) throw new Error('This .prg has no editable Deets design. Older exports and other Garmin apps cannot be imported.');
    const last = text.indexOf(end, first + start.length);
    if (last < 0 || text.indexOf(start, first + start.length) >= 0 || text.indexOf(end, last + end.length) >= 0) throw invalid();
    const encoded = text.slice(first + start.length, last);
    if (encoded.length > maxDesignBytes * 2 || (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))) throw invalid();
    let expanded: Uint8Array;
    try {
        const binary = atob(encoded);
        if (!binary || btoa(binary) !== encoded) throw invalid();
        const packed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                signal?.throwIfAborted();
                const { done, value } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > maxDesignBytes) throw invalid();
                chunks.push(value);
            }
        } finally {
            await reader.cancel().catch(() => {});
        }
        expanded = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { expanded.set(chunk, offset); offset += chunk.length; }
    } catch (failure) {
        signal?.throwIfAborted();
        throw invalidWithCause(failure);
    }
    signal?.throwIfAborted();
    let document: unknown;
    try { document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(expanded)); }
    catch { throw invalid(); }
    // CLI exports without browser annotations reopen with a fresh default grid.
    if (document && typeof document === 'object' && !Array.isArray(document) && !Object.hasOwn(document, 'grid'))
        document = { ...document, grid: defaultGrid };
    return parseDesign(JSON.stringify(document));
}

function invalidWithCause(cause: unknown) {
    return new Error(invalid().message, { cause });
}
