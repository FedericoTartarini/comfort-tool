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
npx vitest run src/engines/comfort/comfort.test.ts
```

## Stack

Svelte 5 (runes), TypeScript, Vite 5, Tailwind CSS + Flowbite Svelte, Plotly.js, `jsthermalcomfort` (thermal comfort engine), Vitest.

Frontend-only — no backend in this repo.

## Architecture source of truth

- **Target:** [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md) is a **living** contract. Named Plan slices follow that file. Figure-ownership and import-lane moves update the Plan in place in the same change as the code — do not treat older Plan/CLAUDE sentences as a freeze.
- **Historical:** `26-06-29-architecture-brief.md` is not the next design. It may stay in the repo as history; do not implement from it, and do not treat “leave the brief unchanged” as a reason to block Plan work.
- **This file** describes **current** code. When a slice deletes presets, the parallel `ChartInstanceId` tree, `spec: unknown`, or “reusable chart geometry belongs in `engines/`”, rewrite this file. Do not restore application-layer `*Dto` types or `comfortDtos.ts` to match older sentences here.
- Do only the named Phase ID when executing a Phase ID. Figure-geometry moves already described in the Plan do not need a new Phase ID. Do not add unrelated new models during the cutover.

## Source Layout

```
src/
  declarations/    declarations plus focused model-family calculation/chart modules
  ui/
    components/     rendering and interaction (input-panel/, chart/, shared UI);
                    site shell branding/links (`siteShellConfig.ts`)
    routes/         client router
    views/          page composition only (ComfortDashboard.svelte)
    utils/          UI actions (`clickOutside`)
  catalog/          centralized domain constants and metadata (physical quantities, zone tokens, model IDs, units, etc.)
  charts/                               ChartType figure functions, draw/clone/export (native Plotly);
                    shared isoline root-finding in isolines.ts;
                    Psychrometric humidity curves and CBE isoline polygons in
                    psychrometric/ (assemble still only stacks traces)
  engines/
    comfort/        shared comfort helpers, request/axis adapters, chart binds
                    (ChartBuildResult, simulation chart declarations), modifiers
    units/          SI <-> IP conversion helpers
    chartTheme.ts   Screen and publication chart theme (mm/pt/dpi, single/double column; zone palettes applied here)
    plotlyExport.ts Publication PNG/SVG from a dedicated figure
  state/
    analysis/       point session (Standard+Explore): input/setting/output,
                    model definitions/registry, share codec, projections
    timeSeries/     Time-series session (PHS); editor/chart view models
    workspace/      route / model / surface coordination
  testSupport/      Compare helper; golden inputs/control counts from the registry
  App.svelte        root component
```

Canonical Standard URLs are `/standard/{standard}/{model}/` (for example `/standard/ashrae-55/pmv-ashrae/`). Explore is `/explore/{model}/`. Time-series is `/time-series/{model}/`. Mixed-case and workspace-only aliases replace-redirect to that path.

## Architecture Rules

**Import direction** — keep cross-layer imports constrained to these lanes:

- `ui/views` → `ui/components`, `state`
- `ui/components` → `state`, `catalog`, lightweight `engines`
- `state` → `catalog`, `engines`; the model registry imports registered configs from `declarations`
- `declarations` → `catalog`, `engines`, builder helpers from `state/analysis/modelConfigs`, and `charts/<ChartType>` geometry helpers (not Plotly assemble)
- `engines` → `catalog`
- `charts` geometry helpers must not import models, quantities, or declarations

**Canonical state is always SI.** All user input is converted to SI on entry; all calculations run in SI; display converts from SI via `src/engines/units/`.

**Calculation ownership:** Model-specific thermal-comfort logic belongs in `src/declarations/**`. Reusable ChartType geometry belongs in `src/charts/`. Remaining shared psychrometric helpers, stress-band derivation, field-chart scaffolding, adapters, reference values, and cross-model utilities still live in `src/engines/comfort/**` until that layer moves. Shared Cartesian isoline root-finding lives in `src/charts/isolines.ts`. Psychrometric isoline geometry lives in `src/charts/psychrometric/` (T roots at ~0.001°C width, RH-curve caps). All 2-D Dynamic charts fill bands with isoline polygons. PMV declarations pass `evaluate` and band thresholds and do not solve isoline roots. TemperatureMode Air keeps `tr` from input on the Psychrometric field; Operative uses `tr=tdb` per sample and labels x Operative temperature. Hover is Plotly closest on markers and data lines. State and components must not contain raw formula implementations. Do not add a parallel geometry module under `engines/` for a ChartType that already has a `src/charts/` folder.

**`jsthermalcomfort` imports** are restricted to `src/declarations/**`, remaining `src/engines/comfort/**`, and `src/charts/psychrometric/humidity.ts` (humidity ratio only). Do not add them to `src/state/**`, `src/ui/components/**`, `src/ui/views/**`, or top-level engine files.

**Unit conversion** belongs in `src/engines/units/`. Quantity conversion reads `display.units.SI` from the closed quantity catalog (`convertQuantityFromSi`). Control widgets stay generic. Do not scatter temperature, speed, humidity-ratio, or vapor-pressure conversions across components or state helpers. Canonical state remains SI.

## State Shape

The controller is `PointSession` (`createAnalysisState` in `createAnalysisState.svelte.ts`). State is three buckets:

- `input` — `quantitiesByInput`, `auxiliaryQuantitiesByInput`, `modelInputsByModel`, `activeModifiersByInput`
- `setting` — selected model, chart instance, options, Compare, unit system, active surface, axes/baseline/Explore bands
- `output` — `calculationCacheByModel` (`$state.raw`), loading, error

Time-series is a separate session with the same three bucket names. Do not merge the two sessions. When touching state or types, prefer keyed generic records over adding more model-specific parallel properties.

## Model Configuration

Model declarations live in `src/declarations/`. The generic authoring/runtime
contract is in `src/state/analysis/modelConfigs/definition.ts`. `defineModel`
is the assembly function for a complete declaration; it uses `ComfortModelBuilder`
internally. The registry only registers built runtime definitions. Generics
preserve model-specific result and chart-source types until `build()` erases
them once for the controller. Declaration-local zones derive chart bands and
are not runtime-definition state.

Each declaration owns inputs, strict options, request mapping, calculation,
result rows, charts, modes, outputs, executable modifiers, and any fixed
Compliance specification. New models must follow this config-driven pattern—do
not add another hardcoded controller slice. Copy `heatIndex.ts`; do not add
`defineIndexModel()` or restore preset factories.

Each registered model has one focused declaration entry. That entry makes the
model's product decisions readable in one place, but stable IDs, the explicit
registry entry, shared metadata, and tests remain separate files. Simple models
may keep all implementation in the declaration; larger standard families may
use focused calculation/chart modules beside complete declarations. PMV and
Adaptive family modules (two standards, one calculation/chart core) are not
presets; they may still assemble with `ComfortModelBuilder`.

Use constants from `src/catalog/` for `ModelId` model identifiers (`src/catalog/modelIds.ts`), `PhysicalQuantityId` / `ChartAxisQuantityId` values, `ChartType` values (`src/catalog/chartTypes.ts`), `SurfaceId` (`src/catalog/surfaces.ts`), compare-input identifiers, and `ZoneToken` values. `defineModel` and family modules use `FrontendChartDeclaration` with `type: ChartType`; spec must match that type. There is no ModelId allowlist. Dropdown labels are `chartTypeLabel[type]`. Chart ids live on each declaration’s `charts` entries (`id`); the builder maps them to runtime `instanceId`. Figure assemble in `src/charts/` takes generic arrays and must not import models or quantities. Psychrometric humidity/isoline helpers live in `src/charts/psychrometric/` and take evaluate callbacks, not model or quantity ids. Do not introduce new raw domain strings for those concepts.

## Capabilities, axes, and modifiers

- Compliance and Explore share the Field Chart engine, with Compliance as the constrained profile.
- Every declaration sets `workspaceCapabilities` and `exploreOutputs`; Standard-capable models also set `complianceProfile` with fixed output, non-empty bands, caption, legend title, and feedback. Assemble with `defineModel` (`type: ChartType`, `tables`, optional PHS `simulation`). Family modules may still use `ComfortModelBuilder` internally (`setCharts()`, `setTables()`, `setSimulation()`). Chart ids (`id`) are declared on the model’s `charts` entries; the builder maps them to runtime `instanceId` and the registry derives those. Duplicate ids, Extra ids that are not Extra, unknown ChartTypes, duplicate ChartType on one model, or a Time-series table without Time-series capability fail `defineModel` / `assembleCatalogs`. There is no `validate.model` hook. Heat Index / Humidex declare one Dynamic chart. Psychrometric is a ChartType currently used by PMV ASHRAE/ISO. Heat-loss vs temperature and SET series builders live in `heatLossSeries.ts` / `setSeries.ts`. PMV Analysis tables include SET, cooling effect, relative air speed, and dynamic clothing as Compare-matrix rows. Explore still colours PMV and PPD; do not add a SET explore output key. UTCI and PHS binds live in `utci/charts.ts` and `phs/charts.ts`. Do not restore `src/declarations/presets/` or add `defineIndexModel()`.
- 2-D Dynamic charts fill bands with isoline polygons from `src/charts/isolines.ts` (121 sweep points, scan-then-bisect to ~0.001 °C, skip missing roots, no vertex rounding). Hover is Plotly closest on Compare markers and data lines (`hovertemplate`). UTCI 1-D may keep high sampling (for example 450 x-points). Fills do not attach per-cell `customdata`. `src/charts/draw.ts` clones Plotly-owned `x`/`y`/`z`/`text` arrays and nested records Plotly mutates, applies axis lines/ticks via `layout.template`, and maps non-finite grid `z` to `null` gaps; it must not stringify the figure. Screen and publication figures share `src/engines/chartTheme.ts`. Export builds a separate publication figure (explicit mm/pt/dpi, PNG ~300 DPI equivalent, SVG of the same geometry, no mode bar) and must not capture the on-screen plot. Publication widths are journal single- and double-column profiles on that same theme; Compare legends stay readable at both widths. Zone fills remap through `src/catalog/zoneTokens.ts` (models select tokens; print and colour-blind updates happen in that table).
- `outputSettingsByModel` stores per-model axes, baseline, and optional Explore working state. Presentation-only changes rebuild from a ready cache without scheduling calculation. `assertCompareContract` covers 1/2/3 Compare inputs, filled table columns, chart markers, and a baseline change that keeps a ready cache. Compare/coverage golden **values** are derived from each registered model's `inputFields` plus `standardPrimaryFixture` in `src/testSupport/goldenFixtures.ts`. Required control IDs and primary quantities are independently authored in `src/testSupport/requiredModelControls.ts` and pinned in focused model tests; do not derive that expected side from `inputFields`. Explicit SI overrides exist only when that fixture is outside a declared range; do not invent values from min/max or catalog `defaultSi`. Known-value calculation snapshots stay explicit numbers.
- Strict share snapshots remain exact `version: 1`; input state uses `quantitiesByInput`, sparse `auxiliaryQuantitiesByInput`, sparse `modelInputsByModel`, and `activeModifiersByInput`; `models` is sparse (omit default slices; missing known keys seed defaults; unknown keys reject); only Explore working bands are serialized, and modifier records contain the complete stable key set. Do not keep exact `comfortModelOrder` matching.
- Bands resolve in array order with half-open membership (`min <= value < max`), and all numeric band/input values are canonical SI.
- Use `createFieldRequestAdapter()` for canonical request mapping and `createRequestAxisAdapter()` for chart-only aliases and explicit Operative Temperature behavior. Coupled temperature axes stay in the dynamic-axis solver. Application request and chart-source types do not use a `Dto` suffix. Generic chart figure inputs live in `src/charts/types.ts`.
- `primaryInputOrder` in `src/catalog/quantities.ts` is the exact persisted primary-key set (`PrimaryQuantityId` / `PrimaryInputState`). Chart-only and derived quantities stay in the `PhysicalQuantityId` catalog but never enter primary records or share primary records. Extra catalog ids selected via `extraQuantities` stay out of `primaryInputOrder` and live in sparse `modelInputsByModel`. BodyWeight and Height are Extra catalog ids; PHS selects them with `phsPersonQuantityIds`. Do not add them to the Analysis input panel. All quantity conversion reads catalog SI units (`SiUnit` / `display.units.SI`) through `convertQuantityFromSi`; field behaviors must not branch on PHS or quantity-id lists. `{ kind: "quantity", … }` fields must be listed in that declaration’s `extraQuantities`.
- Analysis input-panel UI is presentational, matching chart controls. `buildInputPanelViewModel` / `getInputPanelViewModel` in `src/state/analysis/inputPresentation.ts` project tool controls, Compare toggles, field rows, clothing-builder bindings, and modifiers. Components must not receive the Analysis controller or implement conversion, clamp, or modifier-draft merge.
- `defineModel` `modifiers` (or builder `.setModifiers()`) receive executable declarations. The global catalogue contains only stable IDs and UI/share input schema. Effective SI input runs in the fixed order Measured Air Speed → Morning Clothing Estimate → Dynamic Clothing → Solar Gain without overwriting base input. Calculations receive `ModelCalculationContext` with `effectiveQuantitiesByInput` (modifier-adjusted primary SI), not raw `quantitiesByInput`.
- Dynamic Clothing is declared only by PMV ASHRAE and PMV ISO; each declaration binds its own `clo_dynamic` standard.
- Keep Time-series out of point-session caches and share snapshots. Time-series is a separate session (PHS only). Membership is `tables.timeSeries` (`getModelsForSurface(TimeSeries)`). Declaring the table does not create a simulator.

## UI Conventions

- Use Flowbite Svelte components first; Tailwind utilities for layout/spacing/styling.
- Use Flowbite components for UI patterns they cover: `DropdownHeader`, `DropdownDivider` for dropdown sections; icon components from `flowbite-svelte-icons` instead of Unicode characters.
- Add handwritten CSS only when necessary.
- Components should be presentational or interaction-focused. If a component mixes layout, modal state, domain branching, and data shaping, split it.
- Analysis input-panel components consume `InputPanelViewModel` the same way chart controls consume `ChartControlsViewModel`. Do not put formula implementations, unit conversion, display-range clamp, or modifier-draft merge in those components.
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

Zones use the `ThermalZone` class in `src/catalog/thermalZone.ts`. Models select a `ZoneToken`; fill and text colours come from `src/catalog/zoneTokens.ts` (screen, publication, and colour-blind columns). Hex may remain as a test/custom fallback. Each boundary value appears exactly once, as `min` / `max` values in the config object:

```ts
new ThermalZone({
  label: "Neutral",
  min: -0.5,
  max: 0.5,
  token: ZoneToken.Neutral,
  cssClass: "neutral",
  category: "no thermal stress",
});
```

Do not define threshold constants separately and then repeat the same number in the zone array. `id`, `textColor`, `cssClass`, and `category` are optional; `id` and `cssClass` can be derived from the label or token by `ThermalZone`. Explore/Compliance bands that are not `ThermalZone` instances use `numericBandFromToken()`. Print and colour-blind updates happen in the token table, not in model files.

## Architecture: declarations/

Each registered model has one focused declaration entry. PMV uses
`ashrae.ts` and `iso.ts` for complete standard decisions,
`calculation.ts` for formulas/results, `charts.ts` for psychrometric
and dynamic chart wiring (psychrometric isoline geometry in `src/charts/psychrometric/`, Cartesian Dynamic isolines in `src/charts/isolines.ts`), `heatLossSeries.ts` / `setSeries.ts`
for ParametricLine series (registered on both ASHRAE and ISO declarations),
and `shared.ts` only for cross-standard
contracts and builder assembly. PMV Analysis tables include SET, cooling
effect, relative air speed, and dynamic clothing; Explore outputs remain
PMV and PPD.
Adaptive follows the same shape with ASHRAE/EN declarations plus
`calculation.ts`, `charts.ts`, and `shared.ts`. PHS uses `phs.ts` plus
`calculation.ts`, `charts.ts`, `timeSeries.ts`, `timeSeries.worker.ts`,
and `timeSeriesCharts.ts`. Never
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
- No new direct `jsthermalcomfort` imports outside `src/declarations/**`, `src/engines/comfort/**`, or `src/charts/psychrometric/humidity.ts`
- No new scattered conversion helpers outside `src/engines/units/`
- Model or chart additions do not expand the controller with more hardcoded parallel properties (unless explicitly approved)
- Internal documentation remains in `docs/` Markdown (`docs/adding-a-model.md`); it is not part of the application build. Do not add a docs generator, deploy step, or product UI route for these files.
- Target architecture is `ARCHITECTURE-PLAN.md` (living). Do not treat `26-06-29-architecture-brief.md` as a freeze that blocks Plan work. When ownership moves, rewrite this file and the Plan in the same change.
- A named Plan slice is done when that ID’s **Done when** in `ARCHITECTURE-PLAN.md` is met, without reintroducing deleted wrappers. Figure-geometry moves already described in the Plan do not need a new Phase ID.
- Every Analysis model must pass `assertCompareContract` (1/2/3 visible inputs, filled table columns, chart markers, baseline change keeps a ready cache). Three inputs must not fail silently. Compare golden values are registry-derived from `inputFields`; do not add a per-model golden-input switch. Focused model tests must pin required control IDs independently so dropping a required field fails.
