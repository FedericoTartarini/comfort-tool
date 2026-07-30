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
  comfortModels/          one file per comfort model; model-specific config, zones, calculations, charts
  components/
    chart/                 chart rendering and export UI
    input-panel/           comfort-tool input subcomponents
  models/                  centralized domain constants and metadata
  services/
    comfort/               shared comfort helpers, psychrometrics, chart scaffolding, adapters
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

- Keep cross-layer imports constrained to these lanes:
  - `views` -> `components`, `state`
  - `components` -> `state`, `models`, lightweight `services`
  - `state` -> `models`, `services`; the model registry imports registered configs from `comfortModels`
  - `comfortModels` -> `models`, `services`, and builder helpers from `state/comfortTool/modelConfigs`
  - `services` -> `models`
- Canonical shared domain state stays in SI units.
- Views compose pages.
- Components handle rendering and interaction.
- State orchestrates shared UI state, mode transitions, request building, and calculation scheduling.
- `comfortModels` own model-specific zones, request mapping, calculations, result sections, and chart builders.
- Services own reusable calculations, derived-domain logic, unit conversion, and shared chart generation helpers.

## Calculation Ownership

Model-specific thermal-comfort logic belongs in `src/comfortModels/**`. Shared helpers belong in `src/services/comfort/**`.

- PMV / PPD, UTCI, adaptive, heat-index, humidex, and wind-chill model calculations may live in their model files under `src/comfortModels/**`.
- Shared psychrometric helpers, stress-band derivation, reusable chart scaffolding, reference values, adapters, and cross-model utilities belong in `src/services/comfort/**`.
- State and components must stay free of raw formula implementations.
- If a helper is missing upstream, keep a thin local adapter beside the model when it is model-specific, or in `src/services/comfort/**` when it is reusable.

All direct `jsthermalcomfort` imports must stay inside `src/comfortModels/**` or `src/services/comfort/**`.

- Do not add new direct `jsthermalcomfort` imports in `src/state/**`, `src/components/**`, `src/views/**`, or top-level `src/services/*.ts`.
- When touching legacy wrappers or shared helpers, prefer moving reusable comfort logic under `src/services/comfort/**` rather than adding more top-level service files.

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

New models should be added through config-driven registration, not by hardcoding another controller slice. Model definitions live in `src/comfortModels/**`; the builder and registry live in `src/state/comfortTool/modelConfigs/**`.

A model definition should own:

- stable `id` and label metadata
- input field list
- default inputs
- derived-input synchronization
- request builders
- calculation execution
- chart list and chart builders
- comfort zone definitions (as `ThermalZone` instances — see below)
- supported `modes`, `chartableOutputs`, and an optional fixed `complianceSpec`

Use centralized constants and typed metadata from `src/models/` for:

- model identifiers
- field identifiers
- chart identifiers
- compare-input identifiers
- chart modes and model-output identifiers

Do not introduce new raw domain strings for those concepts.

## Capability Declarations And Next Architecture Direction

`26-06-29-architecture-brief.md` describes the broader target architecture; §9.4 Explore controls and the shared `FieldChartConfig` grid path are implemented. Compliance mode UI, full per-model mode memory, and input modifiers remain future work.

- Compliance and Explore should share one chart engine, with Compliance as the constrained version.
- Every model declaration must set `modes` and `chartableOutputs`; Compliance models must also set a non-empty `complianceSpec`. Use the builder rather than controller branches.
- `ChartMode`, `ModelOutputKey`, capability types, and `bandsFromThermalZones()` live in `src/models/modelCapabilities.ts`. Reuse them instead of inline strings or copied zone thresholds.
- Explore state is transient and generic: x/y come from declared dynamic fields, z comes from `chartableOutputs`, and editable numeric bands are cloned from `defaultBands`. Keep output conversion in `src/services/units/` and raw-output extraction in model files.
- Band assignment is array-ordered and half-open (`min <= value < max`); numeric values, functional-edge X values, and band inputs are canonical SI.
- PMV ASHRAE and PMV ISO are separate registered models with explicit serialized IDs (`"PMV_ASHRAE"` and `"PMV_ISO"`) and declaration files (`pmvAshrae.ts` and `pmvIso.ts`). ISO is explicitly ISO 7730 Category B; its Neutral `[-0.5, 0.5)` range intentionally matches ASHRAE numerically, while each declaration derives an independent band array from the Neutral zone. Shared PMV mechanics live in `pmvShared.ts`; do not merge the standards behind a runtime toggle.
- Future constants such as `ModifierId` should be added under `src/models/` before use; do not inline raw strings.
- Future input sub-tools should use an `InputModifier` pattern: keep base SI input separate from effective SI input, apply reversible modifier patches, and declare supported modifiers per model.
- Keep Time-series out of Analysis state until it is explicitly implemented.

## Comfort Zone Design

Comfort zones are defined using the `ThermalZone` class in `src/models/thermalZone.ts`:

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

Zone boundaries appear **once** — as `min` / `max` values in the zone config. Do not also define them as separate named constants. `id`, `textColor`, `cssClass`, and `category` are optional; `id` and `cssClass` can be derived from the label by `ThermalZone`.

## Generic Calculation Cache

Use the generic `ModelCalculationCache<R, C>` type for all model caches. Do not add new named per-model cache types (`PmvCalculationCache`, etc.). At the state controller level, store caches as `Record<ComfortModelType, ModelCalculationCache<unknown, unknown>>` — the controller does not need to know what `R` and `C` are.

## Branching And Duplication

There is already repeated PMV mode branching pressure in places like:

- `src/comfortModels/pmvAshrae.ts`, `pmvIso.ts`, and `pmvShared.ts`
- `src/comfortModels/adaptive.ts`
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
- no new direct `jsthermalcomfort` imports were added outside `src/comfortModels/**` or `src/services/comfort/**`
- no new scattered conversion helpers were added outside the chosen conversion module family
- model or chart additions do not expand the controller with more hardcoded parallel properties unless explicitly approved
- module boundaries remain clear

## Documentation

- Keep this file focused on execution rules.
- If a task materially changes state flow, model registration, or service boundaries, update architecture documentation in this repo as part of the same work.

## Code Quality
- Code should be high quality, easy to read, maintainable over time, and suitable for collaborative development by multiple contributors.
