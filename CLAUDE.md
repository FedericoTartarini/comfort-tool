# CLAUDE.md

Guidance for Claude Code when working in this repository.

> **This branch (`rewrite/v1`) is a rewrite in progress.** The previous
> application was deleted; `src/` is being rebuilt from scratch against a new
> architecture. The old code is checked out read-only at `../comfort-tool-old/`
> (a `git worktree` on `refactor-draft`) and is a **behaviour reference only —
> do not copy code from it**.
>
> - Architecture decision record: [docs/adr-0001-architecture.md](docs/adr-0001-architecture.md)
> - Phased rewrite plan: [docs/rewrite-plan.md](docs/rewrite-plan.md)
> - Code quality checklist: [docs/code-quality-checklist.md](docs/code-quality-checklist.md)
>
> Current position: Phase 3.5 done, plus an unplanned round that brought the
> library into line with the current pythermalcomfort (rewrite plan, "Library
> alignment"). Phase 3.6 is underway; its two open decisions were taken on
> 2026-09-07 and are recorded in the rewrite plan, items 3 and 4. **Phases
> 3.5 – 3.7 freeze the contracts before the Phase 4 acceptance** — every known
> change to `RegisteredModel`,
> `ChartDeclaration` or `ChartSpec` lands there, so that "adding a model touches
> two files" means something when it is tested.
>
> Read both before making structural changes. This file is the summary; the ADR wins on conflicts.

## Commands

```bash
npm run dev         # Vite dev server
npm test            # Vitest
npm run check       # svelte-check + TypeScript
npm run lint        # ESLint (architecture boundaries are enforced here)
npm run build       # Production build
```

Single test file: `npx vitest run src/core/numberFormat.test.ts`

## Stack

Svelte 5 (runes only), TypeScript 6, Vite 8, Tailwind 4 + shadcn-svelte,
sv-router 0.18, Plotly.js 4 (`plotly.js-cartesian-dist-min`), Comlink,
Vitest. Frontend-only, static SPA, no backend.

`jsthermalcomfort` is symlinked to a local fork
(`../../forked repo/jsthermalcomfort`, branch `typescript`). The app consumes
its **build output** (`lib/esm/`), so a library change needs `npm run build`
**in the fork** before this app sees it.

## The one rule

**Adding a model = one declaration file + one registry line. Zero other files change.**

Everything below exists to make that true. If a change would make adding the
next model touch a third file, the change is wrong — fix the architecture
instead of working around it.

## Source layout

```
src/
  core/           plain TypeScript, runnable under node — no svelte, no state, no ui
    workspace.ts chartType.ts unitSystem.ts entryModes.ts    closed sets: as const objects + plain functions
    standard.ts           library reference.standards object -> route path segment
    modelDeclaration.ts   defineModel + RegisteredModel
    libraryInputs.ts      toLibraryInputs(slot, model, environment): Map -> library init, v -> vr, operative_tmp -> tdb = tr
    numberFormat.ts       the only number formatter
    units.ts              display units: symbol, step, SI <-> IP conversion (the one formula exception)
    bandPalette.ts        the one band palette: colour by position in a library IntervalScale
    shareLink.ts          encode / decode — the only place wire strings appear
    charts/               chartSpec.ts psychrometricChart.ts dynamicChart.ts
  models/         one declaration file per model + index.ts (the registry);
                  the only main-thread code that may import library model functions
  state/          session.svelte.ts  compute.svelte.ts
  workers/        compute.worker.ts — the only place library model functions are called
  routes/         page composition; navigation.ts is the only sv-router usage
  ui/
    primitives/   shadcn-svelte generated — do not hand-edit
    layout/       Stack / Grid / Inline (gap via props)
    inputs/ outputs/ charts/ dialogs/   business components, no Tailwind utilities
  text/           UI copy dictionary (English only for v1)
  app.css         Tailwind @theme tokens
```

`$lib` is aliased to `src/`. shadcn-svelte writes into `src/ui/primitives/`
(configured in `components.json`); its `cn()` helper lives at
`src/ui/primitives/cn.ts`.

## Architecture rules

**Import direction** (enforced by `eslint.config.js`)

- `core/` must not import `svelte`, `state/`, `ui/` or `routes/`
- `ui/charts/` must not import models, state, or `jsthermalcomfort` — it consumes a `ChartSpec`
- library **model functions** (`jsthermalcomfort` root, `jsthermalcomfort/models`)
  are importable only from `src/models/` (to bind `run` and read metadata) and
  `src/workers/` (the only caller); `io`, `psychrometrics`, `reference` and
  `charts` subpaths are fine anywhere because `io.quantities` is the one
  quantity definition. The `io` model wrappers are *called* only in the worker;
  lint cannot check that, so it is a convention
- Tailwind utility classes are allowed only in `ui/primitives/` and `ui/layout/`

**Canonical state is always SI.** The library is always called with
`units: "SI"`, even though it supports IP — one path only. Conversion happens
at the display boundary in `core/units.ts`; the stored value keeps full
precision, only the rendered text is formatted. The app's IP display units
(fpm for air speed) differ from the library's IP calling units (fps), so the
library's `ipUnit` strings and `units_converter` are never read.

**No duplicated definitions.** Quantities, models, standards, units, workspaces
and chart types are objects referenced by identity
(`io.quantities.tdb`, `workspace.explore`), never string keys and
never `Record<string, …>` dictionaries. Wire strings appear in exactly two
places: inside the library, and in `core/shareLink.ts`. `Quantity.kind` is a
library string union used as a typed discriminant (`core/units.ts` looks up
display units by kind with an exhaustive `satisfies Record<QuantityKind, …>`).

**Calculation ownership.** All thermal-comfort maths, applicability limits,
classification bands and comfort-zone geometry come from `jsthermalcomfort`.
The app never implements a formula, never transcribes a threshold number, and
never writes its own root finder — `charts.psychrometricZone` and
`charts.adaptiveAshraeZone` already do that, faithfully ported from the
deployed CBE tool. The one exception is unit conversion for display
(°C↔°F, m/s↔fpm), which is a presentation concern and lives in `core/units.ts`.

**Library boundary.** The library carries only what any consumer would need:
model functions, labels, standard membership (`model.standard`), scales,
applicability limits (single source, read by the compliance checks), chart
geometry including the operative-mode `trFollowsDb` option. UI defaults,
input steps, option copy, route path segments and the result-table column
list belong to the model declaration file or `core/`, never to the library.
Test: "would pythermalcomfort ship it?" (ADR §3).

**The library follows pythermalcomfort.** The fork adopts upstream's logic *and*
its naming by default; deviate only where TypeScript requires it, and write the
reason at the site (kwargs objects, no `_` prefixes, `edition` rather than
upstream's `model`). Never keep jsthermalcomfort 1.4.0's vocabulary out of
inertia — it tracks an older upstream, which is how `clo_dynamic(…, "ISO")` came
to compute neither standard's equation. A change here needs `npm run build` in
the fork and then this app's four scripts, in the same pass.

## Coding conventions

- **Runes only.** No `export let`, `$:`, `on:`, `<slot>`, `<svelte:component>`.
  Cross-component shared state is a class with `$state` fields; **`$effect` is
  for external synchronisation only and never assigns to state** — anything
  computed from state is `$derived`, per Svelte's own
  [Best practices](https://svelte.dev/docs/svelte/best-practices). `untrack` is
  banned: reaching for it means an effect is fighting a loop it created. Lint
  enforces both, and `state/compute.svelte.ts` carries the one recorded
  exemption until Phase 3.7 redesigns it.
- **Identity survives state.** Objects compared by identity (models, quantities,
  closed-set members, `Measure`s) are held in `$state.raw`, never a deep `$state`
  proxy, and are replaced rather than mutated. A proxy breaks `===` against the
  library's objects (`session.unitSystem === unitSystem.si` silently false).
- **Erasable syntax only.** No `enum`, no `namespace`, no constructor parameter
  properties (`erasableSyntaxOnly` is on). Closed sets are `as const` objects of
  plain data objects with a derived union type, the same shape as the library's
  `io.quantities` (`workspace.explore`, `temperatureMode.operative`). Behaviour
  is a plain function (`isWorkspaceAvailable(workspace, model)`), never a class
  hierarchy; id lookups are a `xxxFromId()` function used only by shareLink and
  navigation. State containers (`Session`, `InputSlot`) stay runes classes.
- **Naming.** Components `PascalCase.svelte`, modules `camelCase.ts`, functions
  start with a verb. Module constants split two ways: a scalar literal is
  `CONSTANT_CASE` (`GRID`, `ZONE_RH_STEP`), a closed-set table or palette is
  `camelCase` (`chartType`, `sensationPalette`) so it reads like the library's
  `io.quantities`. Lint enforces the first half. Never `engine` / `manager` / `helper` / `utils` as a
  filename. No abbreviations except library quantity keys. Quantity display
  names always come from `Quantity.label`; the app never writes one. The old
  tool's "Air temperature" was wrong and is not carried over; the library says
  "Dry-bulb air temperature". `temperatureMode` decides which quantity is shown
  and which is the temperature axis (`tdb` or `operative_tmp`), so axis labels switch
  with it for free.
- **Granularity.** One concept per file, 100–400 lines is normal. Plain functions
  over class hierarchies. Do not abstract for a second caller that does not exist.
- Declare component props as a named `interface Props` above the `$props()`
  destructuring. Complex `{#if}` conditions go in a `$derived`.
- Use shadcn-svelte primitives first; Tailwind for layout inside `ui/layout/`.
- Run generated `.svelte` through `svelte-autofixer` (Svelte MCP is configured).

## Number display

One formatter, `core/numberFormat.ts`: at most two decimals, trailing zeros
stripped (`26.0 → 26`, `0.51 → 0.51`, `78.80 → 78.8`). Input step comes from
the currently displayed unit, not the SI one.

## Done criteria

A change is complete when `npm test`, `npm run check`, `npm run lint` and
`npm run build` all pass; the human half of
[docs/code-quality-checklist.md](docs/code-quality-checklist.md) has been read
against the diff; SI remains the canonical stored state; library model
functions are called only in the worker; conversion stays in `core/units.ts`;
and the layout above still matches the live tree.
