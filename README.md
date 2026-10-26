# deets

A TypeScript watch canvas, native-pixel area mapping and matching Garmin export.

```sh
npm run dev
npm run build
npm test
npm run export:garmin
```

`npm run dev` opens the local Vite app at `http://127.0.0.1:5173`. The visible
surface is only the watch. Hover or focus a mapped area to see its data binding,
X/Y coordinates and native width/height. These annotations are not exported ink.

`src/watch/scene.ts` is the typed scene definition. Its integer coordinates,
fonts, colours, clipping boxes and data bindings supply both the canvas and the
Garmin program. `WatchCanvas` also accepts a scene and optional night mode as
props. There is no editor, sidebar, inspector, library or application shell.

## Core

- `shared/scene.ts`: typed scenes, draw operations and mapped areas.
- `src/watch/WatchCanvas.tsx`: watch canvas and translated area information.
- `src/watch/raster.ts`: paints canonical glyph masks and integer draw operations.
- `src/watch/api.ts`: `mapWatch(scene)` and `exportGarmin(scene)`.
- `server/garmin.ts`: same-origin local TypeScript API, integrated with Vite.
- `garmin/tools/`: isolated, previously verified raster and Monkey C export core.
- `garmin/source/` and font/resources: only the native data providers and build
  inputs required by export. No signing keys are copied into this project.

The TypeScript server invokes the Python Garmin boundary with JSON. It has no
account, persistence, simulator-control or designer UI layer. The Python boundary
retains shared bitmap masks, exact clipping, RGB565 conversion and live firmware
fallbacks rather than replacing verified rendering rules during migration.

## Garmin export

`npm run export:garmin -- --out /absolute/path/Deets.prg` compiles the scene in
`src/watch/scene.ts` with live watch data. Install the matching `.prg` in
`GARMIN/APPS` using the watch's supported USB transfer method.

Python 3, ImageMagick, Java 17 and the Garmin Connect IQ SDK are required. The
bridge discovers installed macOS SDKs and the local signing-key path. Override
with `DEETS_PYTHON`, `SDK_ROOT`, `JAVA_HOME` or `DEVELOPER_KEY` if needed. Key
contents are never read by the application; only their path is passed to Garmin.

The export takes a scene snapshot, renders its mapping and checks the returned
mapping token before compilation. Application IDs include the scene, renderer
and font-resource fingerprints to prevent stale Garmin resource caches. Resource
limits are checked before export. The original Garmin project is not referenced
at runtime and remains unchanged.

For native pixel comparisons, `--proof` freezes the same sample values used by
the canvas; `--proof --night` selects its night rendering. A normal export always
uses live watch data and normal power callbacks. Compare the browser raster
against a native simulator **Save Screen Capture** image. Physical-watch
installation is a separate verification step.
