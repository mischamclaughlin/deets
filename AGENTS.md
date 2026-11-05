# deets

## Working agreement

- Use British English in responses, project prose and comments.
- Prefer correctness, maintainability, sound architecture and the user outcome.
  Do not treat estimated human implementation time as a major disadvantage.
- The user handles visual review. Do not take screenshots, inspect rendered UI,
  or spend credits on visual verification unless the user explicitly asks.
  Opening the local app beside the chat is allowed and does not authorise
  visual inspection. Report visual behaviour as unverified by the agent.
- Use CLI tools, APIs and deterministic checks for verification. Use Computer
  Use only for desktop UI state that cannot be accessed reliably another way;
  prefer browser-control tools for web interfaces when explicitly requested.
- After code changes, run the cheapest relevant deterministic checks. Keep
  proposed, statically checked, automatically tested, visually verified,
  deployed and confirmed-current claims distinct.
- Use the minimum number of subagents for substantial independent tasks or
  noisy exploration that benefits the main context. Keep simple or sequential
  work in the main agent and avoid concurrent edits to overlapping code.

## Local development

- Run `npm run dev` at `http://127.0.0.1:5173`. Reuse an existing server when
  available. When asked, open that address in a browser tab beside the chat
  without inspecting its rendered contents.

## Project boundaries

Keep this project focused on the watch-face editor, translated native-pixel area
information and exact Garmin export. The existing settings sidebar, canvas
workspace, element inspector, library and Saved designs page are part of the
agreed scope, including browser-local saves and design-file import/download.
Do not add unrelated navigation, accounts, cloud storage or simulator controls
without user direction.

## Design ethos

- Keep the studio calm, compact and precise: restrained colour, clear hierarchy,
  subtle borders, consistent rounded controls and useful spacing. Prefer concise
  labels and grouped controls over explanatory clutter or additional chrome.
- Use Rosé Pine Dawn for **Light** mode and a customised Rosé Pine Moon palette
  for **Dark** mode. Dark base is `#24273A`; sidebar surfaces are `#282B40` and
  overlays `#32364D`. Keep sidebars close to the workspace colour, with rose,
  iris and foam accents used sparingly for selection, focus and actions.
- Apply the selected app theme consistently to both sidebars, the workspace,
  library dialogue, inputs and feedback. Maintain contrast in hover, selected,
  disabled, invalid and keyboard-focus states. Reuse the semantic tokens in
  `src/watch/rose-pine.css` rather than adding unrelated hard-coded colours.
- Switch Light/Dark with the single circular sun/moon button beside the brand.
  Give it an accessible action label and keyboard support. Use smooth colour
  and icon transitions, respecting `prefers-reduced-motion`.
- App appearance is independent of the watch's Day/Night preview. Changing the
  studio theme must never change scene colours, glyphs, geometry or export.
  Preserve the watch face itself unless the user explicitly edits its design.

## Editor behaviour

- Every slider must have an editable numeric value beside it. Users can type a
  number or an arithmetic expression using `+`, `-`, `*`, `/` and parentheses
  (for example, `260 / 2` or `88 + 12`). Apply on Enter or blur; Escape cancels.
  Use the shared bounded arithmetic parser, round to the control's supported
  step, and enforce the same limits and disabled state as the slider. Invalid
  calculations must show an accessible error without changing the saved value.
  Keep units visible and use the shared `SliderValue` control consistently.

- Keep Grid settings compact: paired horizontal/vertical additions with their
  curved toggles, followed by ring count, starting edge and spacing. Adding a
  guide must preserve existing guides and select the new line.
- For selected grid lines, Stretch sets the band width independently of Mirror.
  With Mirror off, grey out the inside of the selected stretched band. With
  Mirror on, retain the two clear boundary edges without the grey fill. Toggling
  Mirror must preserve stretch width and position; dragging moves both edges
  together. Keep straight, curved and ring bands inside the content boundary.
- Grid shading, selection, guides and area labels are browser-only annotations;
  they must never change the native watch pixels or enter Garmin output.
- Canvas settings include a watch background colour picker and hex input using
  the existing colour-control design. This edits `scene.background` for the
  watch's day appearance through the existing native mapping and export path.
  Night/low-power background remains black. Keep this independent of app themes
  and preserve device colour quantisation and stale-mapping rejection.

## Documents and editor state

- `useEditorHistory` owns the current scene and grid as a document, with bounded
  undo/redo. Keep theme, preview appearance, selection and other workspace
  viewing preferences outside document history. Preserve generation/revision
  guards so imports and history navigation reject stale asynchronous edits.
- Saved designs use browser-local storage; `.deets.json` files contain the scene
  and grid, not uploaded font binaries. Validate document structure and grid
  bounds, then prepare fonts and validate the scene through the native boundary
  before applying an import. Preserve the accepted document on failure.
- Preserve multi-selection, layer ordering and batch operations. Validate scene
  batches atomically; a rejected member must not leave partial changes behind.
- Grid-area selection can combine neighbouring areas into a valid rectangle.
  Placement uses that rectangle as the element box without resizing its text;
  validate the result canonically and reject results if the scene or area changed.
- Text layers can have independent optional Day/Night opaque backgrounds and
  vertical alignment. These are scene properties that affect native pixels and
  export, unlike browser-only grid shading and selection.
- Custom icons use `SceneElement.icon`: a portable name, width/height (1–64) and
  row-major MSB-first binary coverage encoded as lowercase hex. `import-icon.ts`
  decodes local PNG/SVG artwork; `icon-mask.ts` trims and packs it. Original SVG
  markup never enters scenes. Canonical Python validation/rendering and the icon
  font exporter own final pixels, including resizing and Day/Night colours.
- SDK-backed watch casing artwork and screen rectangles are presentation only.
  Keep them outside scene geometry, native mapping and Garmin export coordinates.

## Rendering and verification

- `src/watch/scene.ts` supplies the initial scene and CLI export. The editor
  canvas and toolbar export use the current in-memory scene; toolbar export must
  retain the clicked scene snapshot and its validated mapping token.
- `shared/scene.ts` owns the TypeScript protocol. `garmin/tools/designer_model.py`
  owns validation, glyph metrics and native layout. Never measure browser text
  or derive exported coordinates from CSS.
- `server/garmin.ts` is a local Vite API. Preserve host/origin validation, request
  bounds, compile serialisation and the stale-mapping rejection.
- `garmin/tools/designer_export.py` generates only temporary Monkey C projects.
  Keep exact glyph masks, layer order, integer clipping and power behaviour.
  Browser area labels are annotations and must never enter the Garmin output.
- Pass the local signing-key path only to Garmin's compiler. Do not read, copy,
  log or commit key contents. Add no dependencies/permissions without approval.
- Check code changes with `npm run build` and `npm test`. Export changes also
  require native builds. Native raster comparisons require an explicit user
  request; otherwise leave that verification to the user and report the gap.
  Compilation alone is not visual verification.
- Preserve pre-existing work, including `src/App.tsx` changes and local `.venv`.
  The current entry in `src/main.tsx` mounts `WatchEditor`; `WatchWorkspace` hosts
  the canvas and its browser-only viewing controls.
