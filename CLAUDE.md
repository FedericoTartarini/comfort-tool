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
  components/       rendering and interaction (input-panel/, chart/, shared UI)
  models/           centralized domain constants and metadata (field keys, model IDs, units, etc.)
  services/
    comfort/        all thermal-comfort calculations, chart builders, clothing tools
    units/          SI <-> IP conversion helpers
  state/
    comfortTool/    controller, model configs, derived state, URL share state
  views/            page composition only (ComfortDashboard.svelte)
  App.svelte        root component
```

## Architecture Rules

**Import direction** — one-way only:
- `views` → `components`, `state`
- `components` → `state`, `models`, lightweight `services`
- `state` → `models`, `services`
- `services` → `models`

**Canonical state is always SI.** All user input is converted to SI on entry; all calculations run in SI; display converts from SI via `src/services/units/`.

**Calculation ownership:** All thermal-comfort and psychrometric logic (PMV, UTCI, adaptive, stress bands, chart builders) belongs in `src/services/comfort/**`. State and components must not contain raw formula implementations.

**`jsthermalcomfort` imports** are restricted to `src/services/comfort/**`. Do not add them to `src/state/**`, `src/components/**`, or top-level service files.

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

Models are registered through config objects in `src/state/comfortTool/modelConfigs/`. Each config owns: input field list, default inputs, derived-input sync, request builder, calculation function, chart list, and chart builders. New models must follow this config-driven pattern — do not add another hardcoded controller slice.

Use constants from `src/models/` for model identifiers, field identifiers, chart identifiers, and compare-input identifiers. Do not introduce new raw domain strings for these concepts.

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
- `strict` mode is off in tsconfig — don't rely on it.
- Declare component props using a named `interface Props` above the destructuring — not inline in `$props()`:
  ```svelte
  interface Props { title: string; isLoading: boolean; }
  let { title, isLoading }: Props = $props();
  ```
- Complex `{#if}` conditions (more than one operator) should be moved to a `$derived` variable with a descriptive name before use in the template.
- Extract repeated markup blocks to Svelte snippets (`{#snippet}` / `{@render}`).
- Extract "close on click outside" to a shared Svelte action (`use:clickOutside`) rather than duplicating the `onMount` + `document.addEventListener` pattern.

## Comfort Zone Design

Zones use the `ThermalZone` class in `src/models/thermalZone.ts`. Each boundary value appears exactly once, as a constructor argument. The `toneToClass` map is derived from the zones array:
```ts
const toneToClass = Object.fromEntries(zones.map(z => [z.id, z.cssClass]));
```
Do not define threshold constants separately and then repeat the same number in the zone array.

## Planned Architecture: comfortModels/

The intended target architecture places one file per model in `src/comfortModels/` (e.g. `src/comfortModels/pmv.ts`). Each file is the single source of truth for that model: zones, tones, calculation, chart builders, input controls. See `26-05-11-review-federico.md` for the implementation plan. New model work should follow this structure once it is in place.

## Done Criteria

A change is complete when:
- `npm test` passes
- `npm run build` passes
- SI remains the canonical shared state
- No new raw domain strings were introduced for model/field/chart IDs
- No new `jsthermalcomfort` imports outside `src/services/comfort/**`
- No new scattered conversion helpers outside `src/services/units/`
- Model or chart additions do not expand the controller with more hardcoded parallel properties (unless explicitly approved)
