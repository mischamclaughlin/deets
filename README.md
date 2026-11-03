# deets

A TypeScript watch canvas, native-pixel area mapping and matching Garmin export.

```sh
npm run dev
npm run build
npm run lint
npm test
npm run export:garmin
```

`npm run dev` serves the local Vite app at `http://127.0.0.1:5173`. Start with
a centred HH:MM time face. The left sidebar switches between **Elements**,
**Styles** and **Canvas**; selected-element controls live on the right.
Edge clearance is an integer inset in native watch pixels, initially 16 px.
The dashed circumference guide can be hidden independently; it never enters
watch pixels or export.

In **Canvas → Grid**, add independent centred horizontal or vertical guides.
Each axis can stay straight or use curved dividers. Adding a guide preserves
existing guides and selects the new one. Selected guides support position,
Mirror and Stretch controls; Mirror preserves the stretch width and position.
With Mirror off, stretched bands have a grey interior; with it on, the two
boundary edges remain clear. Reflected copies are available for selected guides.
The grid also supports 0–24 extra concentric circumferences inside the content
boundary, starting from the centre or outside edge. Ring spacing is 1–100 native
pixels and reduces automatically when needed to fit the count.
Grid settings survive hiding the grid and are included in saved design documents
and undo/redo. Guides, shading and area labels remain browser-only annotations
and never enter Garmin exports. Enable Snap to use visible guides for placement.
A separate Show guide lines toggle adds faint horizontal and vertical centre
lines across the watch, independently of grid visibility and edge clearance.
These are browser-only annotations and are excluded from Garmin exports.

The Snap button enables alignment of element edges and centre axes to visible
centre guides, grid dividers and rings. The document circumference is only a
hard movement limit, never a snap target. Drag a mapped element
to preview its bounding box; release to commit its integer native-pixel position
and remap its ink. Arrow keys move by one pixel, Shift by ten; Alt temporarily
bypasses snapping. The **Grid**, **Guide** and **Elements** checkboxes choose
snap targets independently: visible grid lines/rings, visible centre
guides, and other visible elements’ edges/centres (including touching edges).
Snap off disables every category while retaining the checkbox selections. All
three categories are selected by default. The seconds ring’s full-screen bounds
are excluded from element targets. Escape or pointer cancellation discards a drag. The full box
remains inside the content boundary even with snapping off. The initial time element
uses the native bitmap font, with a fixed 10:08 design preview and live time in
the Garmin export (following the watch’s 12/24-hour setting).

Canvas and guide controls stay in the left sidebar; selected-element controls
(such as Typography) live in the right sidebar. Each sidebar scrolls independently
of the canvas. Native-pixel and usable-diameter information sits beneath the watch.
On narrow screens both sidebar regions sit above the canvas and scroll separately.

`src/watch/scene.ts` is the initial typed scene definition. The editor keeps its
current document in memory. The toolbar exports the current scene snapshot;
the CLI exports the scene definition on disk. Integer
coordinates, fonts, colours, clipping boxes and data bindings supply both the
canvas and the Garmin program. `edgeInset` constrains entire element rectangles
to the inner circle in the canonical native validator. Legacy scenes without it
retain their existing bounds. Dedicated edge content such as outer seconds
markers can gain an explicit exception later; no exception is enabled yet.

## Elements

The **Elements** sidebar contains the library and layer list. Open the library
to add independent, centred time, date, divider and supported data elements.
Existing clocks remain listed as Time 1, Time 2 and so on, with
independent display modes and typography. Select a clock in the list or on the canvas
to reveal its controls on the right, including HH:MM, HH:MM:SS, hours only (HH), minutes
only (MM) or seconds (SS). Changes preserve the
same element, its typography and its centre to the nearest native pixel. Native
metrics determine the new width and snapping bounds. The preview shows 10:08,
10, 08, 23 or 10:08:23; Garmin exports use live hours/minutes/seconds and the watch's clock settings.
Typography remains in the right sidebar for all five time display modes. HH:MM:SS offers full-size or half-size seconds;
the final :SS group is bottom-aligned and uses native glyph masks.
Date entries are labelled Date 1, Date 2 and so on; divider entries are labelled
Divider 1, Divider 2 and so on.
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

The selected element’s right-hand **Copy** button creates an identical duplicate
immediately above it in the layer order and selects it. **Delete** removes the
selected element; deleting the final element leaves a blank canvas.

Shift-click elements to toggle multiple selections and use the batch inspector
for supported shared edits. Layers can be reordered by dragging or with the
layer controls. Batch scene changes are validated together, preserving the
accepted scene if the operation fails.

The library's **Device & text** category adds battery percentage, enabled alarm
count and custom text. Select a custom text layer to edit its text, then choose
**Apply text**. Text supports up to 80 characters covered by the selected font;
unsupported characters or text that cannot fit leave the accepted design intact.

Use the padlock beside a layer or the lock button in **Layout** to protect it from
movement, resizing, reordering, deletion and area placement. Unlock it to make
those changes; typography and colours remain editable. Select multiple layers,
open the right sidebar's **Group** panel, enter a name and choose **Create group**.
Use **Membership** to add the selected element to an existing group or choose
**No group** to remove it. The member list lets you inspect individual elements
without ungrouping them; **Select group** selects them together again and shows a
single group outline with its name and native dimensions. Selecting a layer or
clicking it on the canvas selects an individual member, which can be
dragged, nudged or positioned independently. Choose **Select group** to move the
whole group; clicking a member then keeps the group selected. Shift-click toggles
individual members. Edit a group's name on Enter or blur; Escape cancels the draft name.
Groups can be duplicated or ungrouped from this panel, and keep their relative positions
when dragged or aligned. Linked activity icons and values move as one unit too.
The outer seconds ring cannot join a movable group. Alignment offers left,
centre, right, top, middle and bottom edges; spacing requires at least three
independent layers or groups. Invalid arrangements are rejected as a whole.
The **Group** panel separates member selection from **Arrange members**. Align
members to the left, centre, right, top, middle or bottom of the bounds shown in
the panel. **Space horizontally** and **Space vertically** offer **Equal gaps**
between element boxes or **Equal centres** between their midpoints. Each command
uses the bounds captured before arranging; moving members updates those bounds.
**Keep linked parts together** is enabled by default; turn it off to arrange
activity icons and values individually without changing their movement link.
Spacing requires at least three independent members; alignment requires two.
Unavailable commands explain why, and an unchanged arrangement reports that the
members already match. Native validation rejects the entire arrangement on
failure. Group membership is preserved and arrangement supports undo/redo.
Locks and groups are undoable editing metadata, included in saved designs and
editable exports without changing the watch renderer.

Click a grid area to use its rectangle as an element box. Shift-click neighbouring
areas to combine them, or Shift-click again to remove one. The area inspector
can place an existing element or add one from the library. Text size stays
unchanged; invalid combinations and placements are reported without applying
partial scene changes.

## Documents and viewing

**Save design** stores the scene and grid in this browser. **Saved designs** lets
you reopen and manage them; existing saves can be updated or saved as copies.
**Download file** creates a `.deets.json` document; **Import file** validates a
document up to 1 MB and prepares its fonts before applying it. Importing does
not save it automatically. Custom font binaries are not embedded in documents;
their local font cache must remain available, or the original files must be
uploaded again.

Undo/redo keeps up to 100 prior document states, including scene and grid edits.
Use the toolbar or Cmd/Ctrl+Z to undo and Cmd/Ctrl+Shift+Z or Ctrl+Y to redo.
Theme, selection and workspace viewing preferences stay outside document history.

Unsaved designs are backed up automatically in browser storage. After a refresh
or interrupted session, **Restore draft** validates the document and prepares its
fonts before applying it; **Discard draft** removes that backup. Separate editing
sessions keep separate drafts. Saving or starting a new design clears the active
session's backup. Leaving with unsaved changes also requests the browser's usual
confirmation. Drafts remain local to this browser and depend on available storage;
custom font files still need their original local cache. Failed recovery keeps
both the accepted document and the recovery record.

The circular sun/moon button switches the studio between Rosé Pine Light and
Dark themes independently of the watch design. **Edit/Preview** switches between
the annotated canvas and a casing preview for the selected watch. **Day/Night**
changes the watch preview only. Casing artwork comes from the local Garmin SDK;
its screen placement never supplies native layout or exported coordinates.

In **Preview → Preview values**, choose a time and date, sample/large/unavailable
readings, and a weather condition, then **Apply preview**. **Reset** returns to the
standard samples. These viewing values stay outside the saved document and undo
history; normal Garmin exports always use live watch data.

In **Canvas → Target watch**, choose the 42, 47 or 51 mm Epix Pro. Conversion
rebuilds fonts for that watch and repositions element centres proportionally
within the usable circle. Typography size and fixed clipping boxes retain their
native-pixel dimensions; seconds rings follow the physical screen size. Grid
positions retain their normalised coordinates and spacing retains its native
pixel value. Conversion is one undoable document change. If any element does not
fit, the original design stays intact: move it towards the centre or reduce its
size before trying again.

## Dates

Open **Library** and choose **+ Date** to add an independent, centred date element.
Its display buttons offer DD/MM/YY, weekday, day of month, month or year.
Combine separate date elements to build other arrangements. The design preview uses 26 October 2026; the Garmin export uses the
watch's live local date, with English weekday and month abbreviations.
Changing the format keeps the same element and preserves its centre to the
nearest native pixel. Native glyph metrics reserve space for changing live
values, including different weekday and month names.

Dates start with a compact custom font and support the same typography, font
inheritance, text presets, day/night colours, copy, delete and dragging controls
as clocks. Included and uploaded fonts use their selected face for every date
character, including letters and slashes.
Font changes that cannot fit inside the clearance boundary are
rejected without replacing the accepted scene.

## Colours

Each selected element has independent **Day colour** and **Night colour**
controls, with a colour picker and RGB hex input. Build named **Colour presets**
in the left sidebar; the list starts empty and edits save automatically.
Choose a preset separately for either channel to link it. Preset edits update
all linked elements and copies. **Custom** detaches just that channel and keeps
its current colour. Deleting a preset detaches its users without changing their
colours. The seconds ring uses the chosen colour for its existing tick shades.

Canvas settings provide a separate watch background picker and hex input for
the Day appearance. Night/low-power background stays black. Supported text
layers also offer optional opaque Day and Night backgrounds; these fill their
native boxes behind the text and are included in Garmin output.

## Typography

Build your own named numeric typography presets in **Text presets**. The list
starts empty; **New preset** creates the first one. Preset names, size,
thickness, width and spacing save automatically and update all linked elements.
**Delete preset** detaches its elements, preserving their last appearance.

Choose a **Text preset** on an element to link it immediately. Choose **Custom**
to detach it and edit its numeric typography independently. Font inheritance or
custom family, clock mode, seconds sizing, divider symbol and position remain
independent of the numeric preset. New elements start custom. A preset change
that cannot fit every linked element is rejected as a whole.

Set the default family in **Styles → Watch font** on the left. Each clock offers
**Inherit watch font** or **Custom font** on the right. New clocks inherit;
custom clocks keep their family when the watch font changes. Size, thickness,
width and spacing remain independent for every element. A watch-wide change
updates all inheriting clocks together, or leaves the scene intact if any cannot fit.

Select a time element to edit its native text height (12–160 pixels),
thickness (−2 to +6 pixels), width (50–200%) and letter spacing (−4 to +24 pixels).
Choose the included JetBrains Mono Regular or NL Thin glyphs, or upload a TTF/OTF
font up to 5 MB. Thickness applies synthetic pixel erosion/dilation; width scales
glyphs horizontally. These controls do not select variable-font weight or width
axes. Uploaded fonts use their default face.

The local Python pipeline uses the existing ImageMagick/FreeType runtime to
rasterise the source TTF/OTF directly at the requested native size, using a shared
baseline. It chooses a vector point size to fit the native height, then crops and
pads the masks without vertical bitmap resizing. The width control deliberately
scales the resulting glyphs horizontally. Binary masks keep preview and Garmin
output identical; enlarging the preview still exposes individual native pixels.
The included JetBrains Mono Regular and NL Thin source fonts and their licence
are bundled in `garmin/fonts/`. Generated assets are cached by source-font content,
renderer version, character set, device and typography settings. The editor
prepares its editable text on startup; CLI export uses the same preparation. Edits
preserve the element's centre to the nearest native pixel. Text boxes fit their
visible content by default, including when fonts or display formats change;
entering a width or height creates a fixed box instead. Text also supports
top, middle and bottom alignment within its box. A change that cannot fit inside the current boundary
shows an error and leaves the last accepted scene intact. No browser text
measurement supplies layout or export coordinates.

Uploads and generated atlases are stored in the local temporary directory,
`deets-fonts-v1`, under content hashes. Scene records reference those hashes and
settings; they do not contain arbitrary font paths. Clearing that temporary
cache requires uploading or generating those fonts again. UI edits remain in
the current document until saved; the CLI still exports the scene definition
on disk. Preview and Garmin
export consume the same generated pixels. No new runtime dependencies are added.

## Core

- `shared/scene.ts`: typed scenes, draw operations and mapped areas.
- `src/watch/WatchEditor.tsx`: editor composition, sidebars and selection.
- `src/watch/useEditorHistory.ts` and `editor-document.ts`: current scene/grid document, undo/redo and saved-content checkpoints.
- `src/watch/design-file.ts` and `saved-designs.ts`: document validation and browser-local saves.
- `src/watch/WatchWorkspace.tsx`: canvas viewing controls, casing preview and toolbar export.
- `src/watch/WatchCanvas.tsx`: watch canvas and translated area information.
- `src/watch/raster.ts`: paints canonical glyph masks and integer draw operations.
- `src/watch/api.ts`: `mapWatch(scene)` and `exportGarmin(scene)`.
- `server/garmin.ts`: same-origin local TypeScript API, integrated with Vite.
- `garmin/tools/`: isolated, previously verified raster and Monkey C export core.
- `garmin/source/` and font/resources: only the native data providers and build
  inputs required by export. No signing keys are copied into this project.

The TypeScript server invokes the Python Garmin boundary with JSON. It has no
account or simulator-control layer. Saved designs are stored in browser-local
storage; the server does not persist them. **New design** starts an empty face on
the current watch and asks before discarding unsaved scene or grid changes.
Chart and activity elements use the
same canonical scene and native validation boundary. The Python boundary
retains shared bitmap masks, exact clipping, RGB565 conversion and live firmware
fallbacks rather than replacing verified rendering rules during migration.

## Garmin export

New Deets `.prg` exports include a compressed editable design resource. Use
**Import design** to restore the scene and grid from those files, or from an
existing `.deets.json` file. Older PRGs and other Garmin apps do not contain this
resource and cannot be imported. Custom fonts still need their original local
files. Imports validate the document and rebuild native font mappings before
replacing the current design; failed imports preserve the accepted document.

The compiler signs the complete PRG, including the metadata. No bytes are
appended or patched after compilation. The metadata adds file size and a small
resource-table overhead, but is never loaded by the watch code. Adding it leaves
the generated renderer, glyph resources, geometry, colours, layer order and power
behaviour unchanged. Grid settings are stored only for editing and are never
rendered on the watch. PRG imports are limited to 16 MB, with a 1 MB limit on the
expanded editable document.

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

## Native Garmin fonts

Text exports use Garmin `.fnt` resources generated from the same glyph masks and
metrics as the preview. Each font style is loaded once and shared across day/night
colours. See [native font export](docs/garmin-native-font-export.md) for the asset
contract, resource guards, verification and remaining visual-review limits.
