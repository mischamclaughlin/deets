/** Remove the artwork's exterior white matte without erasing enclosed watch details. */
export function removePreviewBackground(pixels: Uint8ClampedArray, width: number, height: number): void {
    if (pixels.length !== width * height * 4 || width < 1 || height < 1) return;
    const visited = new Uint8Array(width * height);
    const distance = new Uint8Array(width * height).fill(255);
    const queue = new Uint32Array(width * height);
    let end = 0;
    const visit = (index: number) => {
        if (visited[index]) return;
        visited[index] = 1;
        const offset = index * 4;
        if (pixels[offset + 3] !== 0 &&
            (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245)) return;
        pixels[offset + 3] = 0;
        distance[index] = 0;
        queue[end++] = index;
    };
    for (let x = 0; x < width; x++) {
        visit(x);
        visit((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
        visit(y * width);
        visit(y * width + width - 1);
    }
    for (let head = 0; head < end; head++) {
        const index = queue[head];
        const x = index % width;
        if (x > 0) visit(index - 1);
        if (x + 1 < width) visit(index + 1);
        if (index >= width) visit(index - width);
        if (index + width < width * height) visit(index + width);
    }

    // The SDK raster was antialiased against white. Merely making pure white
    // transparent leaves that white mixed into the casing's outer few pixels.
    const exteriorEnd = end;
    const extend = (index: number, value: number) => {
        if (distance[index] !== 255) return;
        distance[index] = value;
        queue[end++] = index;
    };
    for (let head = 0; head < end; head++) {
        const index = queue[head];
        const next = distance[index] + 1;
        if (next > 3) continue;
        const x = index % width;
        if (x > 0) extend(index - 1, next);
        if (x + 1 < width) extend(index + 1, next);
        if (index >= width) extend(index - width, next);
        if (index + width < width * height) extend(index + width, next);
    }
    const original = pixels.slice();
    for (let head = exteriorEnd; head < end; head++) {
        const index = queue[head];
        const offset = index * 4;
        if (original[offset + 3] !== 255) continue;
        if (Math.min(original[offset], original[offset + 1], original[offset + 2]) >= 245) continue;
        const x = index % width;
        const y = Math.floor(index / width);
        let sample = offset;
        let darkest = original[offset] + original[offset + 1] + original[offset + 2];
        for (let dy = -3; dy <= 3; dy++) {
            if (y + dy < 0 || y + dy >= height) continue;
            for (let dx = -3; dx <= 3; dx++) {
                if (x + dx < 0 || x + dx >= width) continue;
                const neighbour = (y + dy) * width + x + dx;
                if (distance[neighbour] <= distance[index]) continue;
                const at = neighbour * 4;
                if (original[at + 3] !== 255) continue;
                const brightness = original[at] + original[at + 1] + original[at + 2];
                if (brightness < darkest) {
                    darkest = brightness;
                    sample = at;
                }
            }
        }
        if (sample === offset || original[offset] + original[offset + 1] + original[offset + 2] - darkest < 36) continue;
        let alpha = 0;
        for (let channel = 0; channel < 3; channel++) {
            const backgroundDifference = 255 - original[sample + channel];
            if (backgroundDifference > 0) alpha = Math.max(alpha, (255 - original[offset + channel]) / backgroundDifference);
        }
        alpha = Math.min(1, alpha);
        pixels[offset + 3] = Math.round(alpha * 255);
        for (let channel = 0; channel < 3; channel++) {
            pixels[offset + channel] = alpha > 0 ? (original[offset + channel] - 255 * (1 - alpha)) / alpha : 0;
        }
    }
}
