# Repository Guidelines

## Scope

This repository contains the active product frontend at the repository root, which should be treated as the frontend root for work in this scope.

- Product code lives in `src/`.
- Do not introduce new backend dependencies or server assumptions unless a task explicitly requires that.
- Never commit generated artifacts such as `dist/`, `node_modules/`, coverage output, or cache directories.

## Architecture source of truth

- **Target:** [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md). Named Plan slices (`0c`, `0t`, `0q`, …) follow that file, including registry contribution, `defineModel`, and allowed deletions.
- **Historical:** `26-06-29-architecture-brief.md` is not the next design. Do not implement from it or restore its authoring model.
- **This file** describes the **current** tree and execution rules. When a Plan slice deletes or replaces something still named here (preset factories, the parallel `ChartInstanceId` tree, `spec: unknown`, application-layer `*Dto` types, exact `comfortModelOrder` share maps), **the Plan wins**. Do not put those back to “match AGENTS.md”.
- Slice discipline: do only the named Phase ID. Do not migrate the Plan §4 target tree (`catalog/`, `declarations/`, `state/analysis/`) unless the task is that slice (`3n` or an ID that names the rename). Do not add unrelated new models during the cutover.
- The product is not deployed. There is no share or URL compatibility requirement.
- After a slice lands, update this file, `CLAUDE.md`, and `docs/` in the same change so current-state rules match the code.

## Source Tree

Primary source layout:

```text
src/
  comfortModels/          model declarations plus family folders (pmv/, adaptive/, phs/, utci/)
  components/
    chart/                 chart rendering and export UI
    input-panel/           comfort-tool input subcomponents
  models/                  centralized domain constants and metadata
  services/
    comfort/               shared comfort helpers, request/axis adapters, charts, modifiers
    units/                 SI <-> active-unit-system conversion helpers
  state/
    comfortTool/           controller, model configs, pure projections, share state
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
- State orchestrates shared UI state, mode transitions, calculation context, and scheduling.
- `comfortModels` own model-specific zones, request mapping, calculations, result sections, and chart builders.
- Services own reusable calculations, derived-domain logic, unit conversion, and shared chart generation helpers.

## Calculation Ownership

Model-specific thermal-comfort logic belongs in `src/comfortModels/**`. Shared helpers belong in `src/services/comfort/**`.

- PMV / PPD, UTCI, adaptive, heat-index, humidex, and wind-chill model calculations live under `src/comfortModels/**`; larger shared families keep calculation and chart construction in focused modules beside their declarations.
- Shared psychrometric helpers, stress-band derivation, reusable chart scaffolding, reference values, adapters, and cross-model utilities belong in `src/services/comfort/**`.
- State and components must stay free of raw formula implementations.
- If a helper is missing upstream, keep a thin local adapter beside the model when it is model-specific, or in `src/services/comfort/**` when it is reusable.

All direct `jsthermalcomfort` imports must stay inside `src/comfortModels/**` or `src/services/comfort/**`.

- Do not add new direct `jsthermalcomfort` imports in `src/state/**`, `src/components/**`, `src/views/**`, or top-level `src/services/*.ts`.
- When touching shared helpers, prefer moving reusable comfort logic under `src/services/comfort/**` rather than adding more top-level service files.

## Physical Quantity Rules

- `PhysicalQuantityId` in `src/models/physicalQuantities.ts` is the single application-layer catalog; state, share snapshots, and UI use these IDs exclusively.
- Request short names (`tdb`, `vr`, `rh`, …) are allowed only at the `jsthermalcomfort` boundary. Each model's `createFieldRequestAdapter()` mapping in `*Calculation.ts` is the sole catalog→library connection point. Do not add new application-layer `*Dto` types; Plan retires that suffix outside the library boundary.
- `quantitiesByInput` stores base primary SI before modifiers; `effectiveQuantitiesByInput` in `ModelCalculationContext` is what calculations and request mapping read.
- Calculate each model once into `calculationCacheByModel`; chart builders read `resultsByInput` and `chartSource` from that cache. Presentation-only changes (mode, axes, bands) must rebuild charts without invalidating ready caches.
- Golden regression fixtures live in `src/testSupport/goldenFixtures.ts`; do not reintroduce ad-hoc `refactor*` baseline files.
- ESLint restricted wire literals in `eslint.config.js` must stay aligned with `primaryInputOrder`; `src/models/catalogWireIds.test.ts` guards that sync.

## Conversion Ownership

- Canonical state remains SI.
- All unit conversion should live in one conversion module family under `src/services/`.
- Do not scatter new temperature, speed, humidity-ratio, or vapor-pressure conversions across components or state helpers.
- Components may format values for display, but conversion rules should come from centralized helpers and metadata.

## State Rules

The controller uses generic keyed structures. New work must preserve that shape rather than adding parallel model-specific state.

Current risks to avoid extending:

- separate model-specific selected-chart fields at the top level
- separate model-specific result buckets at the top level
- separate chart result slots such as `psychrometricChart`, `relativeHumidityChart`, `utciStressChart`, and `utciTemperatureChart`
- separate derived per-input maps that grow one field at a time without a broader structure

Preferred direction for refactors and new model work:

- `selectedModel`
- `selectedChartInstanceId` inside each model snapshot
- `quantitiesByInput` — base primary SI per input slot
- `auxiliaryQuantitiesByInput` — sparse slot quantities (modifiers and derived psychrometrics)
- `modelInputsByModel` — sparse model-scoped SI values
- `resultsByModel`
- chart builds resolved on demand from calculation cache + output settings
- shared UI flags for loading, errors, compare settings, and unit system

When touching `src/state/comfortTool/types.ts`, `src/state/comfortTool/createComfortToolState.svelte.ts`, `src/state/comfortTool/shareState.ts`, or `src/state/comfortTool/modelConfigs/**`, prefer extracting keyed records and generic helpers instead of copying another PMV/UTCI-specific property or branch.

## Model Extension Strategy

New models should be added through config-driven registration, not by hardcoding another controller slice. Model definitions live in `src/comfortModels/**`; the builder and registry live in `src/state/comfortTool/modelConfigs/**`. During the Plan cutover, do not add unrelated models. Do not add new index models through `src/comfortModels/presets/` — Plan **0p** deletes those factories; copy a full declaration (Heat Index style after 0p) instead.

Each registered model has one focused declaration entry that exposes its product decisions. This is not a one-physical-file rule: stable IDs remain centralized, registration remains explicit, and tests remain separate. Simple models may keep their implementation in the declaration file; larger standard families may use focused calculation/chart modules beside complete standard declarations.

A model definition should own:

- stable `id` and label metadata
- input controls, option handlers, complete defaults, and an exact parser
- request mapping and derived-input synchronization hooks
- calculation execution
- result builders, chart definitions/builders, and dynamic-axis defaults
- declaration-local comfort zone definitions (as `ThermalZone` instances — see below), used to derive bands but not stored on the runtime definition
- `workspaceCapabilities`, `exploreOutputs`, and an optional fixed `complianceProfile` via `setComplianceProfile()`
- supported input modifiers, using an explicit empty list when none apply

Use centralized constants and typed metadata from `src/models/` for:

- model identifiers
- quantity identifiers (`PhysicalQuantityId`, `ChartAxisQuantityId` for selectable chart axes)
- chart kinds (`ChartKind` in `src/models/output/chartKinds.ts`); instance ids live on each declaration’s `setOutputCharts()` entries
- compare-input identifiers
- chart modes and model-output identifiers
- modifier identifiers (`ModifierId`, modifier `PhysicalQuantityId` slots)

Do not introduce new raw domain strings for those concepts, and do not recreate a parallel `ChartInstanceId` tree.

## Capability Declarations And Runtime Architecture

Current code already has Standard/Explore workspaces, the shared `FieldChartConfig` engine, per-model chart-setting memory, and generic input modifiers. The **target** for further architecture work is [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md), not the June 2026 brief.

- Compliance and Explore share one chart engine, with Compliance as the constrained version.
- Every model declaration must set `workspaceCapabilities` and `setExploreOutputs()`; Standard-capable models must also set `setComplianceProfile()` with non-empty bands, a caption, legend title, and result feedback callback. Use the builder rather than controller branches.
- `ModelOutputKey`, capability types, workspace/profile metadata, and `bandsFromThermalZones()` live in `src/models/modelCapabilities.ts`. Reuse them instead of inline strings or copied zone thresholds.
- `outputSettingsByModel` stores each model's x/y axes, baseline, and optional Explore working state. Explore z comes from `exploreOutputs`, and editable numeric bands are cloned from `defaultBands`; Standard workspace output and bands always come directly from `complianceProfile`.
- `primaryInputOrder` in `src/models/physicalQuantities.ts` is the exact persisted primary-key set. Derive `PrimaryQuantityId` and `PrimaryInputState` from it; chart-only and derived `PhysicalQuantityId` values must not enter primary records, share primary records, behavior patches, modifiers, or calculation context.
- Every model owns chart output through `setOutputCharts([...], { defaultInstanceId })` with typed `ChartKind` specs. Instance ids live only on the declaration; the registry derives them (`getDeclaredChartInstanceIds`). Do not recreate a parallel `ChartInstanceId` tree or a second legend/lock array beside `setOutputCharts()`. Heat Index / Humidex fixed-axis maps are `ChartKind.DynamicField` with `lockedAxes`, not `Custom`.
- Standard workspace models must provide `complianceProfile.legendTitle` in addition to fixed output, bands, caption, and feedback. Explore legends come from the selected `ModelOutput` via `ChartBuildResult.legend`.
- `setInputFields()` declares visible inputs; `fieldInputBehaviors.ts` resolves each `InputFieldSpec` into shared control behaviors. Model `optionHandlersByKey` is the sole option-change path. Models must provide complete defaults and exact parsers; invalid internal options are invariants, not occasions to fill defaults.
- Use `createFieldRequestAdapter()` to derive request mapping and ordinary chart-axis get/set behavior from one canonical field declaration.
- Compose `createRequestAxisAdapter()` for chart-only aliases and explicit Operative Temperature behavior; keep coupled temperature solving in the shared dynamic-axis solver.
- Mode, axis, baseline, Explore output, band, and chart changes are presentation-only. They must rebuild from a ready cache without invalidating or scheduling calculations.
- Share snapshots retain strict `version: 1`, store chart settings inside each model snapshot, serialize `quantitiesByInput`, sparse `auxiliaryQuantitiesByInput`, sparse `modelInputsByModel`, and `activeModifiersByInput`, serialize only Explore bands plus exact modifier state, and use explicit wire sentinels for unbounded numeric edges. Reject legacy `inputsByInput`, `derivedByInput`, and `modifierInputsByInput` payloads. Do not add old-v1 migration behavior. Plan **0b** makes `models` sparse (missing known keys seed; unknown keys reject); implement that when doing 0b, and do not keep exact `comfortModelOrder` matching for compatibility.
- Band assignment is array-ordered and half-open (`min <= value < max`); numeric values, functional-edge X values, and band inputs are canonical SI.
- PMV ASHRAE and PMV ISO are separate registered models with explicit serialized IDs (`"PMV_ASHRAE"` and `"PMV_ISO"`) and declaration files (`pmvAshrae.ts` and `pmvIso.ts`). ISO is explicitly ISO 7730 Category B; its Neutral `[-0.5, 0.5)` range intentionally matches ASHRAE numerically, while each declaration derives an independent band array from the Neutral zone. `pmvShared.ts` owns only shared contracts/declaration data/builder assembly, `pmvCalculation.ts` owns formulas/results, and `pmvCharts.ts` owns chart construction. Adaptive uses the corresponding `adaptiveShared.ts`, `adaptiveCalculation.ts`, and `adaptiveCharts.ts` split. Do not merge standards behind a runtime toggle.
- `ModifierId`, `PhysicalQuantityId` modifier slots, and the tuple-generic `InputModifier` contract live in `src/models/inputModifiers.ts` and `src/models/physicalQuantities.ts`; do not inline modifier strings.
- Builder `.setModifiers()` receives executable model-owned declarations. The global catalogue contains only stable UI/share IDs and extra-input schema.
- Modifier execution order is Measured Air Speed → Morning Clothing Estimate → Dynamic Clothing → Solar Gain. PMV ASHRAE and PMV ISO each bind Dynamic Clothing to their own standard; other models do not declare it.
- Input sub-tools keep base SI input separate from modifier configuration. Each model declares its supported subset in the fixed global order, and the controller derives effective SI input through those executable definitions before supplying `ModelCalculationContext` (`effectiveQuantitiesByInput`, `auxiliaryQuantitiesByInput`, `modelInputs`, `options`); modifiers must never write effective values back to base state.
- Keep Time-series out of Analysis state. It uses its own capability registry and controller;
  do not add it to Analysis caches or Analysis share snapshots.

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

Avoid repeated model-mode branching across files such as:

- `src/comfortModels/pmv/` (`pmvAshrae.ts`, `pmvIso.ts`, `pmvShared.ts`, and focused calculation/chart modules)
- `src/comfortModels/adaptive/` (`adaptiveAshrae.ts`, `adaptiveEn.ts`, `adaptiveShared.ts`, and focused calculation/chart modules)
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
npm run check
npm run lint
npm run build
npm run test:visual
git diff --check
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
- planned architecture slices match [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md) Done when for that ID, and do not reintroduce deleted wrappers to satisfy older sentences in this file

## Output Registry

Analysis and Time-series output metadata lives under `src/models/output/`:

- `workspaceCapabilities.ts` — Standard, Explore, and Time-series workspace membership
- `tableLayouts.ts` — compare-matrix and metric-summary layouts (Plan **0t**: `TableType.Analysis` / `TimeSeries`)
- `chartKinds.ts` — chart engines/kinds, instance declaration types, and capability defaults. Instance ids are derived from `setOutputCharts()` on each model declaration.
- `fieldChartProfile.ts` — shared Compliance/Explore field-chart profile inputs

Runtime models expose `buildTable()` and `buildChart()` through `src/state/comfortTool/modelConfigs/`. Shared table assembly helpers live in `src/services/comfort/output/`. Time-series exposure summaries render through `src/components/output/MetricSummaryPanel.svelte`.

Share snapshots store `selectedChartInstanceId` per model. Instance ids are derived from declarations only; there is no parallel `ChartInstanceId` tree.

## Documentation

- Keep this file focused on execution rules. Target architecture lives in `ARCHITECTURE-PLAN.md`.
- If a task materially changes state flow, model registration, or service boundaries, update this file and `docs/` in the same work.
- Keep `docs/adding-a-thermal-model.md` and `docs/frontend-structure-summary.md` current until Plan **0d** replaces them with a single `docs/adding-a-model.md`.
- Do not add a documentation generator, deployment step, or product UI route for these internal files unless a later task explicitly requests one.

## Code Quality

- Code should be high quality, easy to read, maintainable over time, and suitable for collaborative development by multiple contributors.
