/** Recolour the Forerunner SDK artwork using the Whitestone materials. */
export function applyForerunnerWhitestone(pixels: Uint8ClampedArray, width: number, height: number): void {
    for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] === 0) continue;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        // The bezel, glass and lettering are neutral. Fade the tint where they
        // meet the coloured plastic so the antialiased edges stay smooth.
        const strength = Math.min(1, (Math.min(green, blue) - red - 8) / 24);
        if (strength <= 0) continue;

        const x = (offset / 4) % width;
        const y = Math.floor(offset / 4 / width);
        // The mint Start button sits above the centre on the far right.
        const mint = Math.max(0, Math.min(1, (green - blue) / 8));
        const startButton = x > width * 0.87 && y < height / 2 ? mint : 0;
        const whiteCase = Math.min(237, 145 + red * 1.45);
        const whiteStrap = Math.min(245, green * 1.18);
        const white = whiteCase + (whiteStrap - whiteCase) * mint;
        const button = green * 0.76;
        const shade = white + (button - white) * startButton;

        pixels[offset] = red + (shade - 10 * startButton - red) * strength;
        pixels[offset + 1] = green + (shade - green) * strength;
        pixels[offset + 2] = blue + (shade + 6 * startButton - blue) * strength;
    }
}
