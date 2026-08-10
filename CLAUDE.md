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

## Source Layout

```
src/
  comfortModels/    declarations plus focused model-family calculation/chart modules
  components/       rendering and interaction (input-panel/, chart/, shared UI)
  models/           centralized domain constants and metadata (field keys, model IDs, units, etc.)
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
- `selectedChartByModel: Record<ModelId, ChartId>` — per-model chart selection
- `inputsByInput` — canonical SI-unit inputs keyed by input slot ID
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

Use constants from `src/models/` for model identifiers, field identifiers, chart identifiers, and compare-input identifiers. Do not introduce new raw domain strings for these concepts.

## Capabilities, axes, and modifiers

- Compliance and Explore share the Field Chart engine, with Compliance as the constrained mode.
- Every declaration calls `setModes()` and `setChartableOutputs()`; Compliance models also provide fixed output, non-empty bands, caption, legend title, and feedback.
- `chartSettingsByModel` stores per-model mode, axes, baseline, and optional Explore working state. Presentation-only changes rebuild from a ready cache without scheduling calculation.
- Strict share snapshots remain exact `version: 1`; only Explore working bands are serialized, and modifier records contain the complete stable key set.
- Bands resolve in array order with half-open membership (`min <= value < max`), and all numeric band/input values are canonical SI.
- Use `createFieldRequestAdapter()` for canonical request mapping and `createRequestAxisAdapter()` for chart-only aliases and explicit Operative Temperature behavior. Coupled temperature axes stay in the dynamic-axis solver.
- Model `.setModifiers()` receives executable declarations. The global catalogue contains only stable IDs and UI/share input schema. Effective SI input runs in the fixed order Measured Air Speed → Morning Clothing Estimate → Dynamic Clothing → Solar Gain without overwriting base input.
- Dynamic Clothing is declared only by PMV ASHRAE and PMV ISO; each declaration binds its own `clo_dynamic` standard.
- Keep Time-series out of Analysis state until it is explicitly implemented.

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
- Internal documentation remains in `docs/adding-a-thermal-model.md` and `docs/frontend-structure-summary.md`; it is not part of the application build
- `26-06-29-architecture-brief.md` remains unchanged
