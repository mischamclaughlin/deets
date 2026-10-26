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

Keep this project limited to the watch canvas, translated native-pixel area
information and exact Garmin export. Do not add editor chrome, navigation,
sidebars, account/storage features or simulator controls without user direction.

- The typed scene in `src/watch/scene.ts` supplies canvas and export.
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
- Preserve the pre-existing `src/App.tsx` changes and local `.venv`; the current
  entry mounts `WatchCanvas` directly.
