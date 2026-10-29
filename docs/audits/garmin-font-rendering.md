# Garmin font rendering audit

Historical comparison. The native font backend was subsequently enabled on
29 October 2026; see [production migration](../garmin-native-font-export.md).
Recorded measurements below describe the audit versions, not the current exporter.

Investigation: 28–29 October 2026. Status at the time of comparison: native font resources recommended, with pixel
and power acceptance open. The production renderer then retained glyph bitmaps;
its API 5.2 text-layout failure had been fixed.

## Recommendation

Make a device-specific Garmin font asset the shared output of font preparation.
For custom fonts, compile standard `.fnt` + coverage-image resources and load each
font once, independently of the text colour. The editor should preview those same
masks and metrics. Keep the existing integer layout initially, including ink bounds,
tracking, clipping and mixed-size seconds; replacing storage and replacing layout
are separate changes that need separate evidence.

The bundled TTF files remain valid build inputs. They are not uploaded to the watch:
the font compiler converts them into device resources. The issue is the exported
resource model and the absence of enough runtime validation, rather than the mere
presence of source-font files.

Garmin supports BMFont resource descriptors, character filtering, runtime text
colour and optional font anti-aliasing. Resource loading can be expensive, so the
SDK recommends avoiding it during screen updates. Preloading a finite font set is
a better migration target than discovering new glyph resources during a draw.
[Garmin resource documentation](https://developer.garmin.com/connect-iq/articles/core-topics/Resources.html#fonts)

## Target constraints

The installed device descriptors declare these capabilities. These are SDK model
values, not measurements of a physical watch.

| Target | Native display | Watch-face application memory | Graphics resource pool |
|---|---:|---:|---:|
| epix Pro 42 mm | 390 × 390 | 128 KiB | 3 MiB |
| epix Pro 47 mm | 416 × 416 | 128 KiB | 3 MiB |
| epix Pro 51 mm | 454 × 454 | 128 KiB | 3 MiB |

The manifest and installed target profiles use API 5.2.0. PRG file size,
application heap and graphics-pool allocation are distinct quantities. The
current 32 KiB export guard is a conservative project estimate, not a measured
memory limit or a predictor of total peak usage.

All three profiles expose system vector faces including BionicBold,
RobotoCondensedBold and RobotoCondensedRegular. These could support a separate
system-font mode. They do not provide arbitrary uploaded faces or guarantee that
a desktop renderer reproduces firmware glyphs. A target-aware preview would still
need validation. Garmin documents scalable fonts and the separate graphics pool
in its [graphics guide](https://developer.garmin.com/connect-iq/articles/core-topics/Graphics.html).

## Compile comparison

The experiment retains the same binary glyph masks, scene, clipping and custom
per-glyph layout in both variants. The existing backend draws coloured glyph
bitmaps. The prototype replaces them with native font resources and `drawText`
per positioned character. It does not assume that native whole-string measurement
matches our ink-bound layout.

All 18 final builds compiled without warnings: three scenes × two backends × three
targets. The table shows the 47 mm build; file sizes were identical across the
three targets in this run. Compiler options were the same for both backends.

| Scene | Existing PRG | Native-font PRG | Reduction | Existing resources | Native resources |
|---|---:|---:|---:|---:|---:|
| Clock, 70 px | 154,972 B | 140,780 B | 9.16% | 25 bitmaps | 1 fonts + launcher |
| Clock + weekday + numeric date | 181,548 B | 144,572 B | 20.37% | 123 bitmaps | 2 fonts + launcher |
| Eight clocks, four sizes, varied colours | 215,068 B | 145,772 B | 32.22% | 193 bitmaps | 4 fonts + launcher |

Resource counts include the launcher bitmap. The stress scene intentionally
stacks its elements centrally: it exercises font/style/colour multiplicity, not a
recommended visual design. PRG bytes can vary slightly with compiler/debug-path
metadata; these are measurements of the recorded builds, not universal sizes.

Native fonts avoid duplicating glyph resources for each day/night colour. They
also load an entire required character subset together, whereas the existing
backend loads glyphs lazily. Both storage and runtime behaviour need measuring.

## Simulator results

A clean 47 mm simulator run passed all six instrumented tests. Each creates an
offscreen native drawing context, invokes the generated `onUpdate` with 24 changing
sample values in day mode and 24 in night mode, and records `System.Stats.usedMemory`
after frames. This exercises real resource loading and drawing APIs without
capturing or inspecting pixels.

| Scene | Existing largest after-frame heap snapshot | Native-font largest after-frame heap snapshot |
|---|---:|---:|
| Clock, 70 px | 40,688 B | 34,448 B |
| Clock + weekday + numeric date | 72,152 B | 46,192 B |
| Eight clocks, four sizes, varied colours | 104,224 B | 50,784 B |

These totals include the unit-test harness and renderer. They are not production
peak-memory measurements: they omit within-frame peaks and graphics-pool usage.
The day/night mode is forced by instrumentation; this does not prove operating
system sleep/gesture scheduling or battery performance. Host elapsed times are
retained in the data file for diagnostics, with no device-speed claims.
[Garmin System.Stats](https://developer.garmin.com/connect-iq/api-docs/Toybox/System/Stats.html)

The SDK runner returned exit code 1 even for tests whose explicit summary was
`PASSED (passed=1, failed=0, errors=0)`. The audit parser requires both that summary
and the expected metrics. Neither an exit code nor printed metrics alone counts
as a pass.

Early simulator runs timed out, including a bitmap control that had previously
passed. The final clean run succeeded after restarting the simulator. The native
prototype also omits zero-area glyphs from resource descriptors: space advances
remain in canonical layout data, which emits no draw operation for an empty
glyph. Those changes were both present in the successful run, so the timeout's
cause is not attributed to either one alone.

## Runtime defect found and fixed

The original generated `layoutText` called `Math.max`. It compiled with SDK 9.3,
but the API 5.2 simulator raised `Symbol Not Found Error` when drawing generated
fonts. Garmin introduced that method in API 6.0.3. An ordinary integer comparison
now computes the same rightmost ink edge without the newer API. The simulator
rendering tests pass with that production fix.
[Garmin Math.max API level](https://developer.garmin.com/connect-iq/api-docs/Toybox/Math.html#max-instance_function)

## Acceptance before changing the production backend

- Compare native pixels with the canonical preview on all three targets, in both
  modes. Include odd/even dimensions, edge clipping, negative tracking, dividers,
  half-size seconds and uploaded fonts. No native raster comparison was performed
  in this audit; the project agreement reserves visual review for the user.
- Profile production builds on a watch for application-memory peaks, graphics-pool
  pressure and update cost. The simulator's host elapsed times are insufficient.
- Preserve power callbacks and validate the chosen always-on design. Garmin's
  AMOLED guidance specifies minute updates and a 10% lit-pixel limit, with burn-in
  protection on some devices. A dimmer colour alone does not establish coverage.
  This audit does not change the existing power behaviour.
  [Garmin watch-face guidance](https://developer.garmin.com/connect-iq/articles/user-experience-guidelines/Watch_Faces.html#always-on-amoled)
- Make the compiled font manifest the preview contract: glyph subset, baseline,
  advances, integer bounds, coverage depth, source fingerprint and target. Keep
  source assets reproducible and expose controls supported by that build path.

Changing the resource format alone will not smooth the current 1-bit masks.
Anti-aliased text is a subsequent target-format decision: retain coverage values,
compile a supported font format, and reproduce its colour conversion and blending
in the preview before claiming equivalence.

## Current validation commands

The historical two-backend comparison tool is preserved in commit `f6a8d3d`.
Current audit tools validate production native-font exports once per scene.

Use new output directory names; both tools refuse existing directories and leave
the production exporter and earlier audit outputs intact.

```sh
python3 garmin/tools/audit_font_rendering.py --out /tmp/deets-font-compare-new
# Start the SDK's Connect IQ simulator before the runtime command.
python3 garmin/tools/audit_font_runtime.py --out /tmp/deets-font-runtime-new --device epix2pro47mm
```

The tools use the existing local compiler configuration and pass only the signing
key path to Garmin's compiler. They do not read key contents or log the path.
Neither tool reads the simulator framebuffer.

Recorded data: [garmin-font-rendering-results.json](garmin-font-rendering-results.json).
Final compiled review projects are local at
`/tmp/deets-garmin-font-audit-final-v2/<device>/<scene>/<variant>/Audit.prg`;
the runtime logs are at `/tmp/deets-garmin-font-runtime-clean/`.
