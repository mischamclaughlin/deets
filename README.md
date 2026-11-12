# Deets

Deets is a local editor for Garmin watch faces. Arrange clocks, dates, live
readings, graphs and your own icons on a native-pixel canvas, then export the
design as a Garmin `.prg`.

## Run locally

Install Node.js 26, Python 3 and ImageMagick (`magick`), then run:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). In **Canvas → Target watch**,
choose a Garmin epix Pro (Gen 2) in 42, 47 or 51 mm, or the Forerunner 165 Music.

## Save and export

- **Save design** keeps a copy in this browser. Use **Saved designs** to reopen
  it. Keep the original files for any custom fonts.
- **Export Garmin** compiles the current design. Export requires Java 17, the
  Garmin Connect IQ SDK and a developer signing key. Copy the exported `.prg`
  to `GARMIN/APPS` on the matching watch.
- **Import design** reopens a `.deets.json` file or a Deets `.prg` with embedded
  design data.

## Development

Run `npm run build`, `npm run lint` and `npm test` to check changes. The CLI
exports the default design in `src/watch/scene.ts` with
`npm run export:garmin -- --out /absolute/path/Deets.prg`.

## Documentation

- [Editor guide](docs/editor-guide.md) for controls, live readings, saving designs
  and Garmin toolchain setup.
- [Native Garmin fonts](docs/garmin-native-font-export.md) for rendering and font
  resources.
- [Export pixel comparison](docs/export-visual-testing.md) for simulator testing.
