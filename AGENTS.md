# Repository Guidelines

## Scope

This repository contains the active product frontend at the repository root, which should be treated as the frontend root for work in this scope.

- Product code lives in `src/`.
- Do not introduce new backend dependencies or server assumptions unless a task explicitly requires that.
- Never commit generated artifacts such as `dist/`, `node_modules/`, coverage output, or cache directories.

## Source Tree

Primary source layout:

```text
src/
  components/
    chart/                 chart rendering and export UI
    input-panel/           comfort-tool input subcomponents
  models/                  centralized domain constants and metadata
  services/
    comfort/               thermal-comfort calculations, adapters, chart builders
    units/                 SI <-> active-unit-system conversion helpers
  state/
    comfortTool/           controller, model configs, derived state, share state
  views/                   page composition only
```

Key entrypoints:

```text
src/App.svelte
src/views/ComfortDashboard.svelte
src/state/comfortTool/createComfortToolState.svelte.ts
src/state/comfortTool/types.ts
```

## Architecture Priorities

- Keep imports moving in one direction:
  - `views` -> `components`, `state`
  - `components` -> `state`, `models`, lightweight `services`
  - `state` -> `models`, `services`
  - `services` -> `models`
- Canonical shared domain state stays in SI units.
- Views compose pages.
- Components handle rendering and interaction.
- State orchestrates shared UI state, mode transitions, request building, and calculation scheduling.
- Services own calculations, derived-domain logic, and chart generation.

## Calculation Ownership

Thermal-comfort and psychrometric logic belongs in `src/services/comfort/**`.

- All PMV / PPD computation belongs in `src/services/comfort/**`.
- All UTCI computation belongs in `src/services/comfort/**`.
- All comfort-zone solving belongs in `src/services/comfort/**`.
- All psychrometric and stress-band derivation belongs in `src/services/comfort/**`.
- All chart-building logic belongs in `src/services/comfort/**`.
- State and components must stay free of raw formula implementations.

Use `jsthermalcomfort` where it cleanly covers the need. If a helper is missing upstream, keep a thin local adapter and place it in `src/services/comfort/**`.

All direct `jsthermalcomfort` imports must stay inside `src/services/comfort/**`.

- Do not add new `jsthermalcomfort` imports in `src/state/**`, `src/components/**`, or top-level `src/services/*.ts`.
- `src/services/advancedPmvInputs.ts` is a legacy exception today, not a pattern to extend.
- When touching legacy wrappers, prefer moving them under `src/services/comfort/**` rather than adding more service code beside the boundary.

## Conversion Ownership

- Canonical state remains SI.
- All unit conversion should live in one conversion module family under `src/services/`.
- Do not scatter new temperature, speed, humidity-ratio, or vapor-pressure conversions across components or state helpers.
- Components may format values for display, but conversion rules should come from centralized helpers and metadata.

## State Rules

The current controller works, but it is still model-specific in several places. New work should move the state shape toward generic, keyed structures rather than expanding the existing parallel PMV/UTCI pattern.

Current risks to avoid extending:

- separate model-specific selected-chart fields at the top level
- separate model-specific result buckets at the top level
- separate chart result slots such as `psychrometricChart`, `relativeHumidityChart`, `utciStressChart`, and `utciTemperatureChart`
- separate derived per-input maps that grow one field at a time without a broader structure

Preferred direction for refactors and new model work:

- `selectedModel`
- `selectedChartByModel: Record<ModelId, ChartId>`
- `inputsByInput` in canonical SI
- `derivedByInput`
- `resultsByModel`
- `chartResultsByModel: Record<ModelId, Record<ChartId, ChartResult | null>>`
- shared UI flags for loading, errors, compare settings, and unit system

When touching `src/state/comfortTool/types.ts`, `src/state/comfortTool/createComfortToolState.svelte.ts`, `src/state/comfortTool/shareState.ts`, or `src/state/comfortTool/modelConfigs/**`, prefer extracting keyed records and generic helpers instead of copying another PMV/UTCI-specific property or branch.

## Model Extension Strategy

New models should be added through config-driven registration, not by hardcoding another controller slice.

A model definition should own:

- stable `id` and label metadata
- input field list
- default inputs
- derived-input synchronization
- request builders
- calculation execution
- chart list and chart builders
- comfort zone definitions (as `ThermalZone` instances — see below)
- tone-to-CSS-class map derived from those zones

Use centralized constants and typed metadata from `src/models/` for:

- model identifiers
- field identifiers
- chart identifiers
- compare-input identifiers

Do not introduce new raw domain strings for those concepts.

## Comfort Zone Design

Comfort zones are defined using the `ThermalZone` class in `src/models/thermalZone.ts`:

```ts
export class ThermalZone {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly min: number,
    public readonly max: number,
    public readonly color: string,   // Plotly / hex color
    public readonly cssClass: string, // Tailwind class for UI
  ) {}
  contains(value: number): boolean {
    return value >= this.min && value < this.max;
  }
}
```

Zone boundaries appear **once** — as constructor arguments. Do not also define them as separate named constants. The `toneToClass` map for a model is derived from its zones:

```ts
const toneToClass = Object.fromEntries(zones.map(z => [z.id, z.cssClass]));
```

## Generic Calculation Cache

Use the generic `ModelCalculationCache<R, C>` type for all model caches. Do not add new named per-model cache types (`PmvCalculationCache`, etc.). At the state controller level, store caches as `Record<ComfortModelType, ModelCalculationCache<unknown, unknown>>` — the controller does not need to know what `R` and `C` are.

## ResultTone

`ResultTone` must live in `src/models/` (not `src/state/`) so that services can import it without breaking the import direction rule. Each model defines its own tone type (e.g. `PmvTone`), and `ResultTone` is a union of all of them.

## Branching And Duplication

There is already repeated PMV mode branching pressure in places like:

- `src/state/comfortTool/modelConfigs/pmv.ts`
- `src/components/input-panel/InputFieldRow.svelte`
- share/import-export synchronization paths

Do not add more repeated `if/else` chains per mode if a config table, model descriptor, or shared helper can express the rule once.

Component helpers should not become hidden domain engines. If a helper is deciding labels, units, display values, ranges, steps, and derivations based on multiple modes, that logic likely belongs in metadata or a service adapter.

Do not reintroduce pure comfort-tool barrel files unless they provide a real stable public API boundary.

## UI Rules

- Prefer Flowbite Svelte components first.
- Prefer Tailwind utilities for layout, spacing, typography, and state styling.
- Add handwritten CSS only when there is a clear need.
- Preserve the current UI language unless a task explicitly asks for a redesign.
- Components should remain presentational or interaction-focused.
- If a component combines layout, modal state, domain branching, and data shaping, split it.
- New shared components should usually have at least two real call sites. Otherwise keep them feature-local first.

## Svelte And TypeScript Style

- Use Svelte 5 conventions for new code.
- Use TypeScript for new logic-bearing modules.
- Use 2-space indentation.
- Use `camelCase` for variables and functions.
- Use `PascalCase` for component filenames.
- Prefer clear names and straightforward types over clever or overly abstract type patterns.
- Declare component props using a named `interface Props` above the destructuring — do not write the type inline in `$props()`. This separates the shape definition from the destructuring and makes both easier to read:

```svelte
interface Props {
  title: string;
  isLoading: boolean;
}
let { title, isLoading }: Props = $props();
```

- Use `$derived` to name complex template conditions before using them in `{#if}`. Inline boolean expressions with more than one operator belong in a derived variable.
- Use semantic HTML correctly: `<div>` for layout-only wrappers, `<section>` and `<article>` only when the content is genuinely a landmark section or self-contained article. Do not place a `<header>` inside a `<footer>`.
- Use Flowbite Svelte components (e.g. `DropdownHeader`, `DropdownDivider`) instead of raw `<div>` markup that replicates their appearance.
- Use icon components from `flowbite-svelte-icons` instead of Unicode arrow/chevron characters.
- Extract repeated markup blocks to Svelte snippets (`{#snippet}` / `{@render}`) rather than copy-pasting them.
- Extract the "close dropdown on click outside" pattern to a Svelte action (`use:clickOutside`) instead of duplicating the `onMount` + `document.addEventListener` block in each component.

## Testing And Done Criteria

Validation commands:

```bash
npm test
npm run build
```

A change in this frontend is done when:

- tests pass
- production build passes
- SI remains the canonical shared state
- no new raw domain strings were introduced
- no new `jsthermalcomfort` imports were added outside `src/services/comfort/**`
- no new scattered conversion helpers were added outside the chosen conversion module family
- model or chart additions do not expand the controller with more hardcoded parallel properties unless explicitly approved
- module boundaries remain clear

## Documentation

- Keep this file focused on execution rules.
- If a task materially changes state flow, model registration, or service boundaries, update architecture documentation in this repo as part of the same work.

## Code Quality
- Code should be high quality, easy to read, maintainable over time, and suitable for collaborative development by multiple contributors.
