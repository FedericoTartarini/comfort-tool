# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Production build (must pass before a change is done)
npm test         # Run Vitest tests (must pass before a change is done)
npm run preview  # Preview production build
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
  comfortModels/    one file per comfort model; model-specific config, zones, calculations, charts
  components/       rendering and interaction (input-panel/, chart/, shared UI)
  models/           centralized domain constants and metadata (field keys, model IDs, units, etc.)
  services/
    comfort/        shared comfort helpers, psychrometrics, chart scaffolding, clothing tools
    units/          SI <-> IP conversion helpers
  state/
    comfortTool/    controller, model configs, derived state, URL share state
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

Model definitions live in `src/comfortModels/`. The builder and registry live in `src/state/comfortTool/modelConfigs/`. Each model config owns: input field list, default inputs, derived-input sync, request builder, calculation function, chart list, and chart builders. New models must follow this config-driven pattern — do not add another hardcoded controller slice.

Use constants from `src/models/` for model identifiers, field identifiers, chart identifiers, and compare-input identifiers. Do not introduce new raw domain strings for these concepts.

## Next Architecture Direction

`26-06-29-architecture-brief.md` describes the target architecture for upcoming work; these concepts are not all implemented today.

- Compliance and Explore should share one chart engine, with Compliance as the constrained version.
- Future model declarations should add `modes`, `chartableOutputs`, and optional `complianceSpec` through the builder instead of controller branches.
- Future constants such as `ModelOutputKey`, `ModifierId`, and `ChartMode` should be added under `src/models/` before use; do not inline raw strings.
- Future input sub-tools should use an `InputModifier` pattern: keep base SI input separate from effective SI input, apply reversible modifier patches, and declare supported modifiers per model.
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

Each model lives in one file in `src/comfortModels/` (e.g. `src/comfortModels/pmv.ts`) and is the single source of truth for that model: zones, calculation, request mapping, chart builders, result sections, and input controls. New model work must follow this structure. The next phase of work (shared chart engine, Compliance/Explore modes, input sub-tools) is specified in `26-06-29-architecture-brief.md`.

## Done Criteria

A change is complete when:
- `npm test` passes
- `npm run build` passes
- SI remains the canonical shared state
- No new raw domain strings were introduced for model/field/chart IDs
- No new direct `jsthermalcomfort` imports outside `src/comfortModels/**` or `src/services/comfort/**`
- No new scattered conversion helpers outside `src/services/units/`
- Model or chart additions do not expand the controller with more hardcoded parallel properties (unless explicitly approved)
