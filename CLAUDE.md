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
- Add handwritten CSS only when necessary.
- Components should be presentational or interaction-focused. If a component mixes layout, modal state, domain branching, and data shaping, split it.
- New shared components should have at least two real call sites; otherwise keep them feature-local.

## TypeScript & Svelte Style

- Use Svelte 5 rune conventions (`$state`, `$derived`, `$derived.by`) for new code.
- 2-space indentation; `camelCase` for variables/functions; `PascalCase` for component filenames.
- Prefer clear names and straightforward types over abstract type patterns.
- `strict` mode is off in tsconfig — don't rely on it.

## Done Criteria

A change is complete when:
- `npm test` passes
- `npm run build` passes
- SI remains the canonical shared state
- No new raw domain strings were introduced for model/field/chart IDs
- No new `jsthermalcomfort` imports outside `src/services/comfort/**`
- No new scattered conversion helpers outside `src/services/units/`
- Model or chart additions do not expand the controller with more hardcoded parallel properties (unless explicitly approved)
