# Native Garmin font export

Enabled on 29 October 2026. Garmin `.fnt` resources are the production text backend;
the temporary coloured-glyph bitmap exporter and prototype adapter are removed.

## Shared assets and layout

Included TTF files and uploaded TTF/OTF files are build inputs. Native-size font
preparation produces canonical binary masks and integer glyph metrics. The canvas
mapping and Garmin resource writer both consume those assets; browser text
measurement does not determine watch coordinates.

The exporter writes `resources/designer-fonts/font-N.fnt` and a greyscale coverage
PNG for each used font style, plus `resources/designer-fonts.xml`. Only required
visible glyphs enter each resource. Spaces retain their canonical advance but do
not create zero-area font bitmaps. Half-size seconds use the same private glyph
codes and masks as the preview.

Garmin loads each font once during view initialisation. Drawing uses the shared
per-glyph positions, native `drawText`, transparent backgrounds and runtime colour
selection. Day/night colours share the same font resource. Text colours are
normalised to the preview's RGB565 values before code generation; ring colours
retain the existing shade-before-quantisation path.

Resource glyph `yoffset` is zero because canonical layout already supplies the
visible glyph origin. Punctuation baselines, divider positions, negative tracking,
clipping, layer order and power callbacks keep their existing layout rules. This
migration does not replace layout with Garmin whole-string measurement.

The native resource writer participates in mapping and application fingerprints,
so old preview tokens and cached native resources cannot silently cross rendering
versions.

## Resource guards

The 32 KiB application-heap allowance now estimates font metadata, font references,
cached glyph positions, proof rectangles, ring tables and scene elements. It does
not charge duplicate font data for different colours.

A separate 2 MiB font-coverage allowance reserves one byte per visible glyph pixel
plus per-glyph overhead within the targets' declared 3 MiB graphics pool. Font
styles are preloaded, so all used styles count towards that allowance. These are
conservative rejection estimates, not measured allocation peaks or hardware limits.

## Verification

- Build, lint and the full test suite pass.
- Representative production exports compile without warnings for 42, 47 and
  51 mm targets: a clock, mixed date/time and multiple styles/colours.
- Additional all-target builds cover full/half seconds, divider positions,
  negative spacing, width/thickness changes, all date sources, a blank scene and
  uploaded Arial text. Final representative builds include RGB565 normalisation;
  the font resource format is identical in both sets.
- Six 47 mm simulator cases pass explicit test summaries, each exercising day
  and night frames: the three representative cases plus edge formats, blank and
  uploaded-font scenes. Fonts are loaded through the production initialiser.
- Tests decode emitted coverage images and check glyph coordinates and advances
  against canonical masks, including half seconds and zero-area spacing. They also
  check colour-independent resources, palette normalisation, unchanged input
  scenes and fingerprint invalidation.
- The normal `npm run export:garmin` command compiled an installable 47 mm
  programme from the scene definition on disk.

No screenshots, rendered UI inspection or native raster comparisons were performed.
Visual pixel parity, physical-watch memory peaks and battery behaviour remain
unverified. The masks remain binary; this migration alone does not add smoothing.

Measured data: [production results](audits/garmin-native-font-production-results.json).
The earlier [font-rendering audit](audits/garmin-font-rendering.md) and its data
remain historical comparison evidence.

## Repeat checks

Use fresh output directory names. The audit commands now exercise production
native-font output once per scene; they do not rebuild the retired bitmap backend.

```sh
npm run build
npm run lint
npm test
python3 garmin/tools/audit_font_rendering.py --out /tmp/deets-production-font-builds-new
# Start the Garmin simulator before running its CLI tests.
python3 garmin/tools/audit_font_runtime.py --out /tmp/deets-production-font-runtime-new
npm run export:garmin -- --out /tmp/Deets-native-fonts-new.prg
```

Both audit tools refuse existing output directories. Generated projects remain
isolated. Signing-key contents are never read; only the path goes to Garmin's
compiler. The runtime audit reads test output and heap snapshots, not pixels.
