# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # Start the application dev server
npm test            # Run Vitest tests
npm run check       # Run Svelte and TypeScript checks
npm run lint        # Run ESLint
npm run build       # Build the application
npm run test:visual # Run Playwright visual tests
npm run preview     # Preview the application build
```

To run a single test file:

```bash
npx vitest run src/services/comfort/comfort.test.ts
```

## Stack

Svelte 5 (runes), TypeScript, Vite 5, Tailwind CSS + Flowbite Svelte, Plotly.js, `jsthermalcomfort` (thermal comfort engine), Vitest.

Frontend-only — no backend in this repo.

## Architecture source of truth

- **Target:** [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md). Named Plan slices follow that file.
- **Historical:** `26-06-29-architecture-brief.md` is not the next design. It may stay in the repo as history; do not implement from it, and do not treat “leave the brief unchanged” as a reason to block Plan work.
- **This file** describes **current** code. When a Plan slice deletes presets, the parallel `ChartInstanceId` tree, `spec: unknown`, or application-layer `*Dto` types, the Plan wins. Do not restore them to match older sentences here.
- Do only the named Phase ID. Do not migrate the Plan §4 folder tree unless the task is that slice. Do not add unrelated new models during the cutover.

## Source Layout

```
src/
  comfortModels/    declarations plus focused model-family calculation/chart modules
  components/       rendering and interaction (input-panel/, chart/, shared UI)
  models/           centralized domain constants and metadata (physical quantities, model IDs, units, etc.)
  services/
    comfort/        shared comfort helpers, request/axis adapters, charts, modifiers
    units/          SI <-> IP conversion helpers
  state/
    comfortTool/    controller, model definitions/registry, pure projections, URL share state
  views/            page composition only (ComfortDashboard.svelte)
  App.svelte        root component
```

## Architecture Rules

**Import direction** — keep cross-layer imports constrained to these lanes:

- `views` → `components`, `state`
- `components` → `state`, `models`, lightweight `services`
- `state` → `models`, `services`; the model registry imports registered configs from `comfortModels`
- `comfortModels` → `models`, `services`, and builder helpers from `state/comfortTool/modelConfigs`
- `services` → `models`

**Canonical state is always SI.** All user input is converted to SI on entry; all calculations run in SI; display converts from SI via `src/services/units/`.

**Calculation ownership:** Model-specific thermal-comfort logic belongs in `src/comfortModels/**`. Shared psychrometric helpers, stress-band derivation, chart scaffolding, adapters, reference values, and cross-model utilities belong in `src/services/comfort/**`. State and components must not contain raw formula implementations.

**`jsthermalcomfort` imports** are restricted to `src/comfortModels/**` and `src/services/comfort/**`. Do not add them to `src/state/**`, `src/components/**`, `src/views/**`, or top-level service files.

**Unit conversion** belongs in `src/services/units/`. Do not scatter temperature, speed, humidity-ratio, or vapor-pressure conversions across components or state helpers.

## State Shape

The controller exposes `{ state, actions, selectors }` via `createComfortToolState.svelte.ts`. Key state fields:

- `selectedModel` — active comfort model
- `selectedChartInstanceByModel: Record<ModelId, string>` — per-model chart instance selection
- `quantitiesByInput` — base primary SI per input slot
- `auxiliaryQuantitiesByInput` — sparse slot quantities (modifiers and derived psychrometrics)
- `modelInputsByModel` — sparse model-scoped SI values
- `calculationCacheByModel` — async calculation results per model
- `ui` — loading flags, unit system (SI/IP), compare mode, errors

When touching state or types, prefer keyed generic records over adding more model-specific parallel properties. Avoid expanding the controller with hardcoded PMV/UTCI branches.

## Model Configuration

Model declarations live in `src/comfortModels/`. The generic authoring/runtime
contract is in `src/state/comfortTool/modelConfigs/definition.ts`. The builder
depends on that contract rather than the registry, and the registry only
registers built runtime definitions. Builder generics preserve model-specific result and chart-source
types until `build()` erases them once for the controller. Declaration-local
zones derive chart bands and are not runtime-definition state.

Each declaration owns inputs, strict options, request mapping, calculation,
result rows, charts, modes, outputs, executable modifiers, and any fixed
Compliance specification. New models must follow this config-driven pattern—do
not add another hardcoded controller slice.

Each registered model has one focused declaration entry. That entry makes the
model's product decisions readable in one place, but stable IDs, the explicit
registry entry, shared metadata, and tests remain separate files. Simple models
may keep all implementation in the declaration; larger standard families may
use focused calculation/chart modules beside complete declarations.

Use constants from `src/models/` for model identifiers, `PhysicalQuantityId` / `ChartAxisQuantityId` values, `ChartKind` values, and compare-input identifiers. Chart instance ids live on each declaration’s `setOutputCharts()` entries; do not recreate a parallel `ChartInstanceId` tree. Do not introduce new raw domain strings for those concepts.

## Capabilities, axes, and modifiers

- Compliance and Explore share the Field Chart engine, with Compliance as the constrained profile.
- Every declaration calls `setWorkspaceCapabilities()` and `setExploreOutputs()`; Standard-capable models also call `setComplianceProfile()` with fixed output, non-empty bands, caption, legend title, and feedback. Charts are declared via `setOutputCharts()`. Tables are declared via `setTables({ analysis, timeSeries? })` with `TableType.Analysis` / `TableType.TimeSeries`. PHS Time-series charts stay on `setSimulation({ charts })`. Instance ids are declared on `setOutputCharts()` and derived by the registry. Heat Index / Humidex maps are `ChartKind.DynamicField`. Plan **0p** replaces preset factories with `defineModel` when that slice runs.
- `outputSettingsByModel` stores per-model axes, baseline, and optional Explore working state. Presentation-only changes rebuild from a ready cache without scheduling calculation.
- Strict share snapshots remain exact `version: 1`; input state uses `quantitiesByInput`, sparse `auxiliaryQuantitiesByInput`, sparse `modelInputsByModel`, and `activeModifiersByInput`; only Explore working bands are serialized, and modifier records contain the complete stable key set.
- Bands resolve in array order with half-open membership (`min <= value < max`), and all numeric band/input values are canonical SI.
- Use `createFieldRequestAdapter()` for canonical request mapping and `createRequestAxisAdapter()` for chart-only aliases and explicit Operative Temperature behavior. Coupled temperature axes stay in the dynamic-axis solver.
- `primaryInputOrder` in `src/models/physicalQuantities.ts` is the exact persisted primary-key set (`PrimaryQuantityId` / `PrimaryInputState`). Chart-only and derived quantities stay in the `PhysicalQuantityId` catalog but never enter primary records or share primary records.
- Model `.setModifiers()` receives executable declarations. The global catalogue contains only stable IDs and UI/share input schema. Effective SI input runs in the fixed order Measured Air Speed → Morning Clothing Estimate → Dynamic Clothing → Solar Gain without overwriting base input. Calculations receive `ModelCalculationContext` with `effectiveQuantitiesByInput` (modifier-adjusted primary SI), not raw `quantitiesByInput`.
- Dynamic Clothing is declared only by PMV ASHRAE and PMV ISO; each declaration binds its own `clo_dynamic` standard.
- Keep Time-series out of Analysis caches and Analysis share snapshots. Time-series is a separate controller (PHS only). `state/timeSeries/modelConfigs.ts` reads the PHS declaration’s `tables.timeSeries`; declaring the table does not create a simulator.

## UI Conventions

- Use Flowbite Svelte components first; Tailwind utilities for layout/spacing/styling.
- Use Flowbite components for UI patterns they cover: `DropdownHeader`, `DropdownDivider` for dropdown sections; icon components from `flowbite-svelte-icons` instead of Unicode characters.
- Add handwritten CSS only when necessary.
- Components should be presentational or interaction-focused. If a component mixes layout, modal state, domain branching, and data shaping, split it.
- New shared components should have at least two real call sites; otherwise keep them feature-local.
- Semantic HTML: use `<div>` for layout-only wrappers. Only use `<section>` / `<article>` for genuine landmark/self-contained content. Never place `<header>` inside `<footer>`.

## TypeScript & Svelte Style

- Use Svelte 5 rune conventions (`$state`, `$derived`, `$derived.by`) for new code.
- 2-space indentation; `camelCase` for variables/functions; `PascalCase` for component filenames.
- Prefer clear names and straightforward types over abstract type patterns.
- `strict` mode is on in `tsconfig.json`; keep new code compatible with it.
- Declare component props using a named `interface Props` above the destructuring — not inline in `$props()`:
  ```svelte
  interface Props { title: string; isLoading: boolean; }
  let { title, isLoading }: Props = $props();
  ```
- Complex `{#if}` conditions (more than one operator) should be moved to a `$derived` variable with a descriptive name before use in the template.
- Extract repeated markup blocks to Svelte snippets (`{#snippet}` / `{@render}`).
- Extract "close on click outside" to a shared Svelte action (`use:clickOutside`) rather than duplicating the `onMount` + `document.addEventListener` pattern.

## Comfort Zone Design

Zones use the `ThermalZone` class in `src/models/thermalZone.ts`. Each boundary value appears exactly once, as `min` / `max` values in the config object:

```ts
new ThermalZone({
  label: "Neutral",
  min: -0.5,
  max: 0.5,
  color: "#f2f2f2",
  textColor: "#475569",
  cssClass: "neutral",
  category: "no thermal stress",
});
```

Do not define threshold constants separately and then repeat the same number in the zone array. `id`, `textColor`, `cssClass`, and `category` are optional; `id` and `cssClass` can be derived from the label by `ThermalZone`.

## Architecture: comfortModels/

Each registered model has one focused declaration entry. PMV uses
`pmvAshrae.ts` and `pmvIso.ts` for complete standard decisions,
`pmvCalculation.ts` for formulas/results, `pmvCharts.ts` for chart construction,
and `pmvShared.ts` only for cross-standard contracts and builder assembly.
Adaptive follows the same shape with ASHRAE/EN declarations plus
`adaptiveCalculation.ts`, `adaptiveCharts.ts`, and `adaptiveShared.ts`. Never
merge separate standards behind a runtime toggle.

## Done Criteria

A change is complete when:

- `npm test` passes
- `npm run check` passes
- `npm run lint` passes
- `npm run build` passes
- `npm run test:visual` passes
- `git diff --check` passes
- SI remains the canonical shared state
- No new raw domain strings were introduced for model/field/chart IDs
- No new direct `jsthermalcomfort` imports outside `src/comfortModels/**` or `src/services/comfort/**`
- No new scattered conversion helpers outside `src/services/units/`
- Model or chart additions do not expand the controller with more hardcoded parallel properties (unless explicitly approved)
- Internal documentation remains in `docs/` Markdown (today `adding-a-thermal-model.md` and `frontend-structure-summary.md`); it is not part of the application build. Plan **0d** consolidates authoring docs.
- Target architecture is `ARCHITECTURE-PLAN.md`. Do not treat `26-06-29-architecture-brief.md` as a freeze that blocks Plan slices.
- A named Plan slice is done when that ID’s **Done when** in `ARCHITECTURE-PLAN.md` is met, without reintroducing deleted wrappers.
