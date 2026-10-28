# deets

A TypeScript watch canvas, native-pixel area mapping and matching Garmin export.

```sh
npm run dev
npm run build
npm test
npm run export:garmin
```

`npm run dev` serves the local Vite app at `http://127.0.0.1:5173`. Start with
a centred HH:MM time face and a sidebar containing the circumference control. Edge
clearance is an integer inset in native watch pixels, initially 16 px. The dashed
guide can be hidden independently; it never enters the canvas raster or export.
The optional grid supports 1–24 rows and columns independently, plus 0–24 extra
concentric circumferences inside the content boundary. Rings can start from the
centre (inside, growing outwards) or the boundary (outside, growing inwards).
Choose 1–100 native pixels of spacing; spacing reduces automatically when needed
to fit the requested count. Each axis can
stay straight or follow the radius: curved dividers form elliptical arcs that
meet the content circle, with equal spacing along the central axes. Grid settings
are browser-only, survive hiding the grid and reset on refresh. They do not alter
the scene or enter Garmin exports. Enable Snap to use visible guides for placement.
A separate Show guide lines toggle adds faint horizontal and vertical centre
lines across the watch, independently of grid visibility and edge clearance.
These are browser-only annotations and are excluded from Garmin exports.

The Snap button enables alignment of element edges and centre axes to visible
centre guides, grid dividers, rings and the circumference. Drag a mapped element
to preview its bounding box; release to commit its integer native-pixel position
and remap its ink. Arrow keys move by one pixel, Shift by ten; Alt temporarily
bypasses snapping. The **Grid**, **Guide** and **Elements** checkboxes choose
snap targets independently: visible grid lines/rings, visible centre/circumference
guides, and other visible elements’ edges/centres (including touching edges).
Snap off disables every category while retaining the checkbox selections. All
three categories are selected by default. The seconds ring’s full-screen bounds
are excluded from element targets. Escape or pointer cancellation discards a drag. The full box
remains inside the content boundary even with snapping off. The initial time element
uses the native bitmap font, with a fixed 10:08 design preview and live time in
the Garmin export (following the watch’s 12/24-hour setting).

Layout and guide controls stay in the left sidebar; selected-element controls
(such as Typography) live in the right sidebar. Each sidebar scrolls independently
of the canvas. Native-pixel and usable-diameter information sits beneath the watch.
On narrow screens both sidebar regions sit above the canvas and scroll separately.

`src/watch/scene.ts` is the initial typed scene definition. The editor keeps its
current scene in memory. The CLI exports the scene definition on disk. Integer
coordinates, fonts, colours, clipping boxes and data bindings supply both the
canvas and the Garmin program. `edgeInset` constrains entire element rectangles
to the inner circle in the canonical native validator. Legacy scenes without it
retain their existing bounds. Dedicated edge content such as outer seconds
markers can gain an explicit exception later; no exception is enabled yet.

## Elements

The left sidebar lists existing elements at the top. The Library section below
has + Time and + Divider buttons that create and select independent, centred elements.
Existing clocks remain listed as Time 1, Time 2 and so on, with
independent display modes and typography. Select a clock in the list or on the canvas
to reveal its controls on the right, including HH:MM, HH:MM:SS, hours only (HH), minutes
only (MM) or seconds (SS). Changes preserve the
same element, its typography and its centre to the nearest native pixel. Native
metrics determine the new width and snapping bounds. The preview shows 10:08,
10, 08, 23 or 10:08:23; Garmin exports use live hours/minutes/seconds and the watch's clock settings.
Typography remains in the right sidebar for all five time display modes. HH:MM:SS offers full-size or half-size seconds;
the final :SS group is bottom-aligned and uses native glyph masks.
Divider entries show only their symbol in the element list.
Dividers have their own right-hand controls for colon (:), dot (.), dash (-),
slash (/) and vertical bar (|). Their visible symbol can sit at the top, middle
(default) or bottom of the native element box, with independent typography and
watch-font inheritance. Seconds offer **Digits** or **Outer ring**. The ring uses
60 radial ticks with longer five-second and quarter-minute marks, based on the
parent watch face. It stays centred on the physical screen,
independent of the content edge clearance. Switching back to digits retains the
font settings. The ring's selection area follows its circumference so inner
elements remain selectable. **Align tick tips to clearance** places every tick’s outer tip on the
circumference defined by edge clearance. The varied tick lengths extend inwards
from that circle. While enabled, the tips follow edge-clearance changes.
**Stretch ticks to clearance** instead keeps the outer tips in their default
outside positions and extends every tick inwards to the clearance circle. The
quarter-minute, five-second and ordinary tick widths stay distinct. The two
buttons are mutually exclusive; toggle the active one off for default geometry.

## Typography

Set the default family in **Watch font** on the left. Each clock offers
**Inherit watch font** or **Custom font** on the right. New clocks inherit;
custom clocks keep their family when the watch font changes. Size, thickness,
width and spacing remain independent for every element. A watch-wide change
updates all inheriting clocks together, or leaves the scene intact if any cannot fit.

Select a time element to edit its visible height (12–160 native pixels),
thickness (−2 to +6 pixels), width (50–200%) and letter spacing (−4 to +24 pixels).
Choose the included JetBrains Mono Regular or NL Thin glyphs, or upload a TTF/OTF
font up to 5 MB. Thickness applies synthetic pixel erosion/dilation; width scales
glyphs horizontally. These controls do not select variable-font weight or width
axes. Uploaded fonts use their default face.

The local Python pipeline uses the existing ImageMagick runtime to rasterise
clock characters and produces one binary atlas and exact glyph metrics. Edits
preserve the element's centre to the nearest native pixel and reserve enough
width for every live value in the selected display mode. A change that cannot fit inside the current boundary
shows an error and leaves the last accepted scene intact. No browser text
measurement supplies layout or export coordinates.

Uploads and generated atlases are stored in the local temporary directory,
`deets-fonts-v1`, under content hashes. Scene records reference those hashes and
settings; they do not contain arbitrary font paths. Clearing that temporary
cache requires uploading or generating those fonts again. UI edits remain in
memory; the CLI still exports the scene definition on disk. Preview and Garmin
export consume the same generated pixels. No new runtime dependencies are added.

## Core

- `shared/scene.ts`: typed scenes, draw operations and mapped areas.
- `src/watch/WatchEditor.tsx`: sidebar, scene state and guide visibility.
- `src/watch/WatchCanvas.tsx`: watch canvas and translated area information.
- `src/watch/raster.ts`: paints canonical glyph masks and integer draw operations.
- `src/watch/api.ts`: `mapWatch(scene)` and `exportGarmin(scene)`.
- `server/garmin.ts`: same-origin local TypeScript API, integrated with Vite.
- `garmin/tools/`: isolated, previously verified raster and Monkey C export core.
- `garmin/source/` and font/resources: only the native data providers and build
  inputs required by export. No signing keys are copied into this project.

The TypeScript server invokes the Python Garmin boundary with JSON. It has no
account, persistence or simulator-control layer. The Python boundary
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
