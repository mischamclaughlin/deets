# Export pixel comparison

Run `npm run test:export` to compare the real editor canvas with the same design
compiled and rendered in Garmin's simulator. The command checks day and night.
It uses `src/watch/scene.ts` by default; unsaved edits in an existing browser tab
are not included. Use `--scene /absolute/path/design.json` for another typed scene.

```sh
npm run test:export
npm run test:export -- --mode day --out /tmp/deets-export-check
npm run test:export -- --scene tests/fixtures/my-design.json
```

The output directory must be new. The default is a dated directory under the
ignored `exports/` folder. Open its `index.html` to review the editor capture,
native capture and pink pixel diff. `results.json` records each result; each mode
also retains the scene, proof programme, simulator log and comparison details.

The command exits with `0` for matching images, `1` for pixel differences, and
`2` when capture, compilation or comparison could not complete. An unavailable
simulator or missing capture never counts as a pass.

## Requirements

- macOS with an unlocked desktop.
- Google Chrome, or its executable path in `CHROME_PATH`. The test launches an
  isolated headless profile and does not use personal browser tabs or settings.
- The existing Garmin export toolchain: Python, ImageMagick, Java 17, the Connect
  IQ SDK and a local signing key. Existing environment overrides still apply.
- Automation permission for the calling app to control System Events, and
  Accessibility access for that app. Enable these in System Settings → Privacy
  & Security if macOS blocks them. The test does not change permissions.

The test brings the Garmin simulator forward, loads a test programme and operates
**File → Save Screen Capture** and its save dialogue using AppleScript. Leave the
simulator and keyboard alone while capture runs. It does not close the simulator.

`npm run test:export -- --prepare-only` captures the browser and compiles proof
programmes without contacting the simulator. This checks preparation only and
does **not** establish export pixel parity.

## What is compared

An isolated Vite harness mounts the production `WatchCanvas` component using the
validated scene. The test waits for its actual asynchronous paint to finish and
saves the canvas backing image at native resolution. Editor guides, selection
labels, CSS scaling and device artwork do not enter that image.

The production compiler bridge exports the same scene with `proof` enabled,
freezing time, date and chart samples. A test-only wrapper prints a unique marker
after the generated view completes a frame. The drawing body stays unchanged;
the capture runner requires that exact marker before saving the screen. This
prevents a previous simulator image or a failed launch from satisfying the test.
These instrumented proof files are test artefacts; install a normal export on a
watch for live data and normal power behaviour.

The comparison requires matching native dimensions and exact RGB/alpha values at
every pixel centre inside the round display. It applies no resizing, alignment
correction or colour tolerance. Pixels outside the round display are excluded.
A one-pixel shift or one-level colour change fails the test. Fix the renderer or
investigate the mismatch instead of automatically accepting a new baseline.

This is canvas-to-export parity rather than an approved screenshot baseline:
intentional canvas changes pass when the native export changes identically. It
does not verify the export button's download interaction, changing live values,
physical-watch installation, battery behaviour or hardware execution limits.

To compare two existing native-resolution PNGs independently:

```sh
python3 garmin/tools/compare_export_pixels.py canvas.png native.png /tmp/new-diff
```

The comparator and capture-instrumentation checks run with the normal `npm test`
suite. The simulator comparison is a separate opt-in command because it operates
desktop UI and needs the native toolchain.
