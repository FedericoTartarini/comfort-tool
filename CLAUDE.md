# CLAUDE.md

Guidance for Claude Code when working in this repository.

> **This branch (`rewrite/v1`) is a rewrite in progress.** The previous
> application was deleted; `src/` is being rebuilt from scratch against a new
> architecture. The old code is checked out read-only at `../comfort-tool-old/`
> (a `git worktree` on `refactor-draft`) and is a **behaviour reference only —
> do not copy code from it**.
>
> - Architecture decision record: [docs/adr-0001-architecture.md](docs/adr-0001-architecture.md)
> - Phased rewrite plan: [REWRITE-PLAN.md](REWRITE-PLAN.md)
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
    workspace.ts chartType.ts unitSystem.ts entryModes.ts    enum classes
    modelDeclaration.ts   defineModel + RegisteredModel
    libraryInputs.ts      toLibraryInputs(slot, model, environment)
    numberFormat.ts       the only number formatter
    units.ts              the only SI <-> display conversion
    shareLink.ts          encode / decode — the only place wire strings appear
    charts/               chartSpec.ts psychrometricChart.ts dynamicChart.ts
  models/         one declaration file per model + index.ts (the registry)
  state/          session.svelte.ts  compute.svelte.ts
  workers/        compute.worker.ts — the only importer of library model functions
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
- library **model functions** (`jsthermalcomfort`, `jsthermalcomfort/models`) are
  importable only from `src/workers/`; `io`, `psychrometrics`, `reference` and
  `charts` subpaths are fine on the main thread
- Tailwind utility classes are allowed only in `ui/primitives/` and `ui/layout/`

**Canonical state is always SI.** The library is always called with
`units: "SI"`, even though it supports IP — one path only. Conversion happens
at the display boundary in `core/units.ts`; the stored value keeps full
precision, only the rendered text is formatted.

**No duplicated definitions.** Quantities, models, standards, units, workspaces
and chart types are objects referenced by identity
(`quantity.dryBulbTemperature`, `Workspace.explore`), never string keys and
never `Record<string, …>` dictionaries. Wire strings appear in exactly two
places: inside the library, and in `core/shareLink.ts`.

**Calculation ownership.** All thermal-comfort maths, applicability limits,
classification bands and comfort-zone geometry come from `jsthermalcomfort`.
The app never implements a formula, never transcribes a threshold number, and
never writes its own root finder — `charts.psychrometricZone` and
`charts.adaptiveAshraeZone` already do that, faithfully ported from the
deployed CBE tool.

## Coding conventions

- **Runes only.** No `export let`, `$:`, `on:`, `<slot>`, `<svelte:component>`.
  Cross-component shared state is a class with `$state` fields; `$effect` is
  for external synchronisation only.
- **Erasable syntax only.** No `enum`, no `namespace`, no constructor parameter
  properties (`erasableSyntaxOnly` is on). Closed sets are ordinary classes with
  `static readonly` instances and a `fromId()`; put behaviour on methods rather
  than switching on the value in a dozen places.
- **Naming.** Components `PascalCase.svelte`, modules `camelCase.ts`, functions
  start with a verb. Never `engine` / `manager` / `helper` / `utils` as a
  filename. No abbreviations except library quantity keys.
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
`npm run build` all pass; SI remains the canonical stored state; library model
functions stay behind the worker; conversion stays in `core/units.ts`; and the
layout above still matches the live tree.
