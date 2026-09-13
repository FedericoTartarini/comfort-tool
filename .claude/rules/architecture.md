---
paths:
  - "src/**"
---

# Architecture rules

**Import direction** (enforced by `eslint.config.js`)

- `core/` must not import `svelte`, `state/`, `ui/` or `routes/`
- `ui/charts/` must not import models, state, or `jsthermalcomfort` — it consumes a `ChartSpec`
- library **model functions** (`jsthermalcomfort` root, `jsthermalcomfort/models`) are importable only from `src/models/` (to bind `run` and read metadata) and `src/workers/` (the only caller); `io`, `psychrometrics`, `reference` and `charts` subpaths are fine anywhere because `io.quantities` is the one quantity definition. The `io` model wrappers are *called* only in the worker; lint cannot check that, so it is a convention
- Tailwind utility classes are allowed only in `ui/primitives/` and `ui/layout/`
- `routes/navigation.ts` is the only sv-router usage; `ui/primitives/` is shadcn-svelte generated, do not hand-edit; `$lib` is aliased to `src/`

**Canonical state is always SI.** The library is always called with `units: "SI"`, even though it supports IP — one path only. Conversion happens at the display boundary in `core/units.ts`; the stored value keeps full precision, only the rendered text is formatted. The app's IP display units (fpm for air speed) differ from the library's IP calling units (fps), so the library's `ipUnit` strings and `units_converter` are never read.

**No duplicated definitions.** Quantities, models, standards, units, workspaces and chart types are objects referenced by identity (`io.quantities.tdb`, `workspace.explore`), never string keys and never `Record<string, …>` dictionaries. Wire strings appear in exactly two places: inside the library, and in `core/shareLink.ts`. `Quantity.kind` is a library string union used as a typed discriminant (`core/units.ts` looks up display units by kind with an exhaustive `satisfies Record<QuantityKind, …>`).

**Calculation ownership.** All thermal-comfort maths, applicability limits, classification bands and comfort-zone geometry come from `jsthermalcomfort`. The app never implements a formula, never transcribes a threshold number, and never writes its own root finder — `charts.psychrometricZone` and `charts.adaptiveAshraeZone` already do that, faithfully ported from the deployed CBE tool. The one exception is unit conversion for display (°C↔°F, m/s↔fpm), which is a presentation concern and lives in `core/units.ts`.

**Library boundary.** The library carries only what any consumer would need: model functions, labels, standard membership (`model.standard`), scales, applicability limits (single source, read by the compliance checks), chart geometry including the operative-mode `trFollowsDb` option. UI defaults, input steps, option copy, route path segments and the result-table column list belong to the model declaration file or `core/`, never to the library. Test: "would pythermalcomfort ship it?" (ADR §3).

**The library follows pythermalcomfort.** The fork adopts upstream's logic *and* its naming by default; deviate only where TypeScript requires it, and write the reason at the site (kwargs objects, no `_` prefixes, `edition` rather than upstream's `model`). Never keep jsthermalcomfort 1.4.0's vocabulary out of inertia — it tracks an older upstream, which is how `clo_dynamic(…, "ISO")` came to compute neither standard's equation. A change here needs `npm run build` in the fork and then this app's four scripts, in the same pass.

**Number display.** One formatter, `core/numberFormat.ts`: at most two decimals, trailing zeros stripped (`26.0 → 26`, `0.51 → 0.51`, `78.80 → 78.8`). Input step comes from the currently displayed unit, not the SI one.
