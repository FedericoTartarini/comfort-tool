# Repository Guidelines

## Scope

This repository contains the active product frontend at the repository root, which should be treated as the frontend root for work in this scope.

- Product code lives in `src/`.
- Do not introduce new backend dependencies or server assumptions unless a task explicitly requires that.
- Never commit generated artifacts such as `dist/`, `node_modules/`, coverage output, or cache directories.

## Architecture source of truth

- **Target:** [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md). Named Plan slices (`0c`, `0t`, `0q`, …) follow that file, including registry contribution, `defineModel`, and allowed deletions.
- **Historical:** `26-06-29-architecture-brief.md` is not the next design. Do not implement from it or restore its authoring model.
- **This file** describes the **current** tree and execution rules. When a Plan slice deletes or replaces something still named here (preset factories, the parallel `ChartInstanceId` tree, `spec: unknown`, exact `comfortModelOrder` share maps), **the Plan wins**. Do not put those back to “match AGENTS.md”.
- Slice discipline: do only the named Phase ID. Do not add unrelated new models during the cutover.
- The product is not deployed. There is no share or URL compatibility requirement.
- After a slice lands, update this file, `CLAUDE.md`, and `docs/` in the same change so current-state rules match the code.

## Source Tree

Primary source layout:

```text
src/
  declarations/          model declarations plus family folders (pmv/, adaptive/, phs/, utci/)
  ui/
    components/
      chart/               chart rendering and export UI
      input-panel/         presentational Analysis input UI
      siteShellConfig.ts   site branding and footer/header links
    routes/                client router
    views/                 page composition only
    utils/                 UI actions (`clickOutside`)
  catalog/                 centralized domain constants and metadata (including zone tokens)
  engines/
    comfort/               shared comfort helpers, request/axis adapters, charts
                           (ChartBuildResult, simulation chart declarations), modifiers
    units/                 SI <-> active-unit-system conversion helpers
    chartTheme.ts          Screen and publication chart theme (mm/pt/dpi, single/double column; zone palettes applied here)
    plotlyTypes.ts         Plotly-compatible, theme-ready adapter types (PlotlyChartSpec)
    plotlyFigure.ts        Plotly adapter (clone boundary; screen vs publication theme)
    plotlyExport.ts        Publication PNG/SVG from a dedicated figure
  state/
    analysis/              controller, model configs, share state, pure
                           projections (chartPresentation, inputPresentation)
    timeSeries/            separate PHS controller; editor/chart view models
    workspace/             route / model / mode coordination
  testSupport/             Compare helper; golden inputs/control counts from the registry
```

Key entrypoints:

```text
src/App.svelte
src/ui/views/ComfortDashboard.svelte
src/state/analysis/createAnalysisState.svelte.ts
src/state/analysis/types.ts
```

## Architecture Priorities

- Keep cross-layer imports constrained to these lanes:
  - `ui/views` -> `ui/components`, `state`
  - `ui/components` -> `state`, `catalog`, lightweight `engines`
  - `state` -> `catalog`, `engines`; the model registry imports registered configs from `declarations`
  - `declarations` -> `catalog`, `engines`, and builder helpers from `state/analysis/modelConfigs`
  - `engines` -> `catalog`
- Canonical shared domain state stays in SI units.
- Views compose pages.
- Components handle rendering and interaction.
- State orchestrates shared UI state, mode transitions, calculation context, and scheduling.
- `declarations` own model-specific zones, request mapping, calculations, result sections, and chart builders.
- Engines own reusable calculations, derived-domain logic, unit conversion, and shared chart generation helpers.

## Calculation Ownership

Model-specific thermal-comfort logic belongs in `src/declarations/**`. Shared helpers belong in `src/engines/comfort/**`.

- PMV / PPD, UTCI, adaptive, heat-index, humidex, and wind-chill model calculations live under `src/declarations/**`; larger shared families keep calculation and chart construction in focused modules beside their declarations.
- Shared psychrometric helpers, stress-band derivation, reusable chart scaffolding, reference values, adapters, and cross-model utilities belong in `src/engines/comfort/**`.
- State and components must stay free of raw formula implementations.
- If a helper is missing upstream, keep a thin local adapter beside the model when it is model-specific, or in `src/engines/comfort/**` when it is reusable.

All direct `jsthermalcomfort` imports must stay inside `src/declarations/**` or `src/engines/comfort/**`.

- Do not add new direct `jsthermalcomfort` imports in `src/state/**`, `src/ui/components/**`, `src/ui/views/**`, or top-level `src/engines/*.ts`.
- When touching shared helpers, prefer moving reusable comfort logic under `src/engines/comfort/**` rather than adding more top-level engine files.

## Physical Quantity Rules

- `src/catalog/quantities.ts` is the **system seed**. Runtime code reads the assembled catalog `system seed ∪ declarations[].quantities.extend`. Duplicate ids, wrong owners, or an extend id in `primaryInputOrder` fail builder / registry assemble. `assembleCatalogs` merges those extensions from the models it is given. Registry assemble exposes optional `assembledCatalogs.validate.model` for those catalog checks (not a second authoring API); `assembleCatalogs` installs the hook on the returned instance.
- A model declaration may contribute `{ id, owner: this model, scope: model, SI meta }` via `quantities.extend`. Extended quantities **must not** enter `primaryInputOrder` or the global share primary record; they live in sparse `modelInputsByModel`.
- PHS body weight/height SI meta live on the PHS declaration. All quantity conversion (fields, modifiers, model-scoped extensions, chart axes) reads assembled catalog SI units (`display.units.SI` / `SiUnit`) in `src/engines/units/` via `convertQuantityFromSi`. Control widgets stay generic and must not branch on quantity-id lists, `if (model === Phs)`, or PHS quantity ids. Canonical state remains SI. `display.units.SI` is the storage unit (for example `kg/kg`, `Pa`, `kg`, `m`, `degC`); SI/IP display labels such as g/kg and kPa live in `display.displayUnits`. New unit dimensions are frontend catalog work (`SiUnit` plus a converter), not declaration-only work.
- Request short names (`tdb`, `vr`, `rh`, …) are allowed only at the `jsthermalcomfort` boundary. Each model's `createFieldRequestAdapter()` mapping is the sole catalog→library connection point. Simple models keep that mapping in the declaration file (`heatIndex.ts`, `humidex.ts`, `windChill.ts`); larger families keep it in `calculation.ts`. Application request and chart-source types do not use a `Dto` suffix (`PmvRequest`, `ModelChartSource`, …). Cross-layer chart-source types live in `src/catalog/chartSource.ts`. Plotly-compatible, theme-ready adapter types live in `src/engines/plotlyTypes.ts` (`PlotlyChartSpec`, `PlotTrace`, …). Do not add application-layer `*Dto` types.
- `quantitiesByInput` stores base primary SI before modifiers; `effectiveQuantitiesByInput` in `ModelCalculationContext` is what calculations and request mapping read.
- Calculate each model once into `calculationCacheByModel`; chart builders read `resultsByInput` and `chartSource` from that cache. Presentation-only changes (mode, axes, bands) must rebuild charts without invalidating ready caches.
- Golden regression fixtures live in `src/testSupport/goldenFixtures.ts`. Compare/coverage golden **values** are derived from each registered model's `inputFields` plus the shared `standardPrimaryFixture`. Explicit SI overrides exist only when that fixture is outside a declared range — do not invent values from min/max or catalog `defaultSi`. Required control IDs and primary quantities are independently authored in `src/testSupport/requiredModelControls.ts` and pinned in focused model tests; do not derive that expected side from `inputFields`. Known-value calculation snapshots stay explicit numbers. Do not reintroduce ad-hoc `refactor*` baseline files or a per-model golden-input switch.
- Every Analysis model must pass `assertCompareContract` in `src/testSupport/assertCompareContract.ts`: 1/2/3 visible inputs, filled table columns, chart markers, and a baseline change that does not invalidate a ready cache. Three inputs must not fail silently. Golden values for that helper come from the registry, not a per-model switch. Focused model tests must pin required control IDs against `requiredModelControls.ts` so dropping a required field cannot stay green.
- ESLint restricted wire literals in `eslint.config.js` must stay aligned with `primaryInputOrder`; `src/catalog/catalogWireIds.test.ts` guards that sync.

## Conversion Ownership

- Canonical state remains SI.
- All unit conversion should live in one conversion module family under `src/engines/units/`.
- Quantity SI ↔ display conversion reads `display.units.SI` from the assembled catalog (`convertQuantityFromSi`). Do not add quantity-id lists in control widgets.
- Do not scatter new temperature, speed, humidity-ratio, or vapor-pressure conversions across components or state helpers.
- Components may format values for display, but conversion rules should come from centralized helpers and catalog metadata.

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

When touching `src/state/analysis/types.ts`, `src/state/analysis/createAnalysisState.svelte.ts`, `src/state/analysis/shareState.ts`, or `src/state/analysis/modelConfigs/**`, prefer extracting keyed records and generic helpers instead of copying another PMV/UTCI-specific property or branch.

## Model Extension Strategy

New models should be added through config-driven registration, not by hardcoding another controller slice. Model definitions live in `src/declarations/**`; `defineModel` and the registry live in `src/state/analysis/modelConfigs/**`. During the Plan cutover, do not add unrelated models. Copy a full `defineModel` declaration (`heatIndex.ts` is the template; see [docs/adding-a-model.md](docs/adding-a-model.md)). Do not add `defineIndexModel()` or restore `src/declarations/presets/`. After registration, `assertCompareContract` must pass for the new Analysis model.

Each registered model has one focused declaration entry that exposes its product decisions. This is not a one-physical-file rule: stable IDs remain centralized, registration remains explicit, and tests remain separate. Simple models may keep their implementation in the declaration file; larger standard families may use focused calculation/chart modules beside complete standard declarations.

A model definition should own:

- stable `id` and label metadata
- input controls, option handlers, complete defaults, and an exact parser
- request mapping and derived-input synchronization hooks
- calculation execution
- result builders, chart definitions/builders, and dynamic-axis defaults
- declaration-local comfort zone definitions (as `ThermalZone` instances — see below), used to derive bands but not stored on the runtime definition
- `workspaceCapabilities`, `exploreOutputs`, and an optional fixed `complianceProfile`
- supported input modifiers, using an explicit empty list when none apply

Use centralized constants and typed metadata from `src/catalog/` for:

- model identifiers (`ModelId` in `src/catalog/modelIds.ts`)
- quantity identifiers (`PhysicalQuantityId`, `ChartAxisQuantityId` for selectable chart axes). System quantities are seeded in `src/catalog/quantities.ts`; model-scoped ids are contributed with `quantities.extend` and assembled into the same catalog.
- chart engines (`ChartEngine` in `src/catalog/chartEngines.ts` is the closed engine set). `defineModel` charts are `ModelChartDeclaration`: a data-only union discriminated on `engine:` over existing engines (`DynamicField`, `BoundaryRegion`, `ParametricLine`, `BandScalar`, `TimeSeriesLine`) in `src/engines/comfort/charts/kinds/types.ts`. Specs never include Plotly `build`. `Custom` is omitted from `defineModel`. An optional `type` names a built-in or extended chart type, is preserved on the presentation instance, and must stay on that same engine/spec pair. Family modules use `FrontendChartDeclaration` / `ComfortModelBuilder`. Chart ids live on each declaration’s `charts` entries (`id`); the builder maps them to runtime `instanceId`. Do not use `spec: unknown`. `ParametricLine` interchange is polylines and optional limit bands.
- compare-input identifiers
- chart modes and model-output identifiers
- modifier identifiers (`ModifierId`, modifier `PhysicalQuantityId` slots)
- zone tokens (`ZoneToken` in `src/catalog/zoneTokens.ts`). Models select tokens; screen, publication, and colour-blind hex live in that table. `toPlotlyFigure` remaps zone fills for print and colour-blind palettes. Sweeping leftover series/marker hex is not required.

Do not introduce new raw domain strings for those concepts, and do not recreate a parallel `ChartInstanceId` tree.

## Capability Declarations And Runtime Architecture

Current code already has Standard/Explore workspaces, the shared `FieldChartConfig` engine, per-model chart-setting memory, and generic input modifiers. The **target** for further architecture work is [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md), not the June 2026 brief.

- Compliance and Explore share one chart engine, with Compliance as the constrained version.
- Every model declaration must set `workspaceCapabilities` and `exploreOutputs`; Standard-capable models must also set `complianceProfile` with non-empty bands, a caption, legend title, and result feedback callback. Assemble with `defineModel`. Family modules (PMV, Adaptive) may still use `ComfortModelBuilder` internally. Do not branch in the controller.
- `ModelOutputKey`, capability types, workspace/profile metadata, `bandsFromThermalZones()`, and `numericBandFromToken()` live in `src/catalog/modelCapabilities.ts`. Reuse them instead of inline strings or copied zone thresholds.
- `outputSettingsByModel` stores each model's x/y axes, baseline, and optional Explore working state. Explore z comes from `exploreOutputs`, and editable numeric bands are cloned from `defaultBands`; Standard workspace output and bands always come directly from `complianceProfile`.
- `primaryInputOrder` in `src/catalog/quantities.ts` is the exact persisted primary-key set. Derive `PrimaryQuantityId` and `PrimaryInputState` from it; chart-only and derived `PhysicalQuantityId` values must not enter primary records, share primary records, behavior patches, modifiers, or calculation context. Model-scoped extensions from `quantities.extend` also stay out of that primary set and serialize only under `modelInputsByModel`.
- Every model owns chart output through `defineModel` `charts` (data-only `ModelChartDeclaration` union over existing engines) or family `ComfortModelBuilder.setCharts()`. Tables are declared with `tables: { analysis, timeSeries? }` using `TableType.Analysis` / `TableType.TimeSeries`. Every Analysis model must declare `tables.analysis`. PHS also declares `tables.timeSeries` plus `simulation.charts` for Time-series line charts. Chart ids live on each declaration’s `charts` entries (`id`); the builder maps them to runtime `instanceId` and the registry derives those (`getDeclaredChartInstanceIds`). Duplicate ids, wrong owners, unknown engines, or a TimeSeries table without Time-series capability fail `defineModel` / registry assemble. Optional `assembledCatalogs.validate.model` covers those checks; `assembleCatalogs` installs the hook on the returned instance. Do not treat `validate.model` as a second authoring API. Presentation instances do not carry engine spec. Do not recreate a parallel `ChartInstanceId` tree or a second legend/lock array beside `charts`. Heat Index / Humidex fixed-axis maps are `ChartEngine.DynamicField` with `lockedAxes`, not `Custom`. `Custom` is frontend-only for PMV ASHRAE/ISO psychrometric charts declared on those models; `defineModel` must not use `Custom spec.build` or teach Plotly. A model declaration may name an extended chart type with `type`; assemble preserves it on the presentation instance and rejects empty or duplicate types. PMV Dynamic and PHS Analysis exposure history are `DynamicField` and `TimeSeriesLine` respectively. `ParametricLine` is implemented (polylines and optional limit bands). Heat-loss vs temperature and SET series builders live in `heatLossSeries.ts` / `setSeries.ts`; ASHRAE and ISO PMV declarations each register those ParametricLine instances. PMV Analysis tables include SET, cooling effect, relative air speed, and dynamic clothing as Compare-matrix rows. Explore still colours PMV and PPD; do not add a SET explore output key. UTCI BandScalar/DynamicField specs live in `utci/charts.ts`. PHS DynamicField and TimeSeriesLine specs live in `phs/charts.ts`.
- Interactive Dynamic 2-D field charts are capped near 100² (`INTERACTIVE_DYNAMIC_GRID_POINTS` in `src/engines/comfort/charts/types.ts`, including UTCI Dynamic). BandScalar / 1-D charts may keep high sampling along one axis (for example UTCI stress at 450 x-points). `ParametricLine` interchange is polylines and optional limit bands, not a dense grid. Hover overlays use display `z` for the primary output and do not attach per-cell `customdata` unless extra hover fields exist. Do not LRU / faster-clone a 200k-cell DTO — shrink the DTO. `toPlotlyFigure` clones Plotly-owned data arrays (`x`, `y`, `z`, `text`) and nested records Plotly mutates (trace/layout/axis/margin/legend/annotation/style objects). Non-finite grid `z` cells become `null` locally. Hover `customdata` is shared. Do not `JSON.parse(JSON.stringify(figure))`. Screen and publication figures share `src/engines/chartTheme.ts`. Export builds a separate publication figure (explicit mm/pt/dpi, PNG ~300 DPI equivalent, SVG of the same geometry, no mode bar) and must not `downloadImage` the on-screen DOM. Publication widths are journal single- and double-column profiles on that same theme; Compare legends stay readable at both widths. Zone fills remap through `src/catalog/zoneTokens.ts` (models select tokens; print and colour-blind updates happen in that table).
- Standard workspace models must provide `complianceProfile.legendTitle` in addition to fixed output, bands, caption, and feedback. Explore legends come from the selected `ModelOutput` via `ChartBuildResult.legend`.
- `setInputFields()` / `defineModel` `inputFields` declare visible inputs; `fieldInputBehaviors.ts` resolves each `InputFieldSpec` into shared control behaviors. Assembled runtime definitions keep `inputFields` so tests can derive Compare golden values from the registry. Required control IDs are independently authored and pinned in focused model tests; do not derive that expected side from `inputFields`. Model `optionHandlersByKey` is the sole option-change path. Models must provide complete defaults and exact parsers; invalid internal options are invariants, not occasions to fill defaults. Model-scoped quantities use `quantities.extend` plus `{ kind: "modelQuantity", … }` when they appear on the Analysis panel. `build()` checks that every `modelQuantity` field is an extend entry owned by that declaration; control metadata is read from the assembled catalog at view-model time. Analysis input-panel UI is presentational, matching chart controls: `buildInputPanelViewModel` / `getInputPanelViewModel` in `src/state/analysis/inputPresentation.ts` project tool controls, Compare toggles, field rows, clothing-builder bindings, and modifiers. Components must not receive the Analysis controller or implement conversion, clamp, or modifier-draft merge.
- Use `createFieldRequestAdapter()` to derive request mapping and ordinary chart-axis get/set behavior from one canonical field declaration.
- Compose `createRequestAxisAdapter()` for chart-only aliases and explicit Operative Temperature behavior; keep coupled temperature solving in the shared dynamic-axis solver.
- Mode, axis, baseline, Explore output, band, and chart changes are presentation-only. They must rebuild from a ready cache without invalidating or scheduling calculations.
- Share snapshots retain strict `version: 1`, store chart settings inside each model snapshot, serialize `quantitiesByInput`, sparse `auxiliaryQuantitiesByInput`, sparse `modelInputsByModel`, and `activeModifiersByInput`, serialize only Explore working bands plus exact modifier state, and use explicit wire sentinels for unbounded numeric edges. The `models` map is sparse: default model slices are omitted, missing known keys seed defaults, and unknown keys are rejected. Adding a model must not require every existing URL to list that model. Do not keep exact `comfortModelOrder` matching. Reject legacy `inputsByInput`, `derivedByInput`, and `modifierInputsByInput` payloads. Do not add old-v1 migration behavior.
- Band assignment is array-ordered and half-open (`min <= value < max`); numeric values, functional-edge X values, and band inputs are canonical SI.
- PMV ASHRAE and PMV ISO are separate registered models with explicit serialized IDs (`"pmv-ashrae"` and `"pmv-iso"`) and declaration files (`ashrae.ts` and `iso.ts`). ISO is explicitly ISO 7730 Category B; its Neutral `[-0.5, 0.5)` range intentionally matches ASHRAE numerically, while each declaration derives an independent band array from the Neutral zone. `shared.ts` owns only shared contracts/declaration data/builder assembly, `calculation.ts` owns formulas/results, and `charts.ts` owns psychrometric/dynamic chart construction. Heat-loss vs temperature and SET `ParametricLine` series live in `heatLossSeries.ts` and `setSeries.ts`; ASHRAE and ISO declarations each register those instances. PMV Analysis tables include SET, cooling effect, relative air speed, and dynamic clothing; Explore outputs remain PMV and PPD. Adaptive uses the corresponding `shared.ts`, `calculation.ts`, and `charts.ts` split. PHS uses `phs.ts` plus `calculation.ts`, `charts.ts`, `timeSeries.ts`, `timeSeries.worker.ts`, and `timeSeriesCharts.ts`. Do not merge standards behind a runtime toggle.
- `ModifierId`, `PhysicalQuantityId` modifier slots, and the tuple-generic `InputModifier` contract live in `src/catalog/inputModifiers.ts` and `src/catalog/quantities.ts`; do not inline modifier strings.
- Builder `.setModifiers()` / `defineModel` `modifiers` receive executable model-owned declarations. The global catalogue contains only stable UI/share IDs and extra-input schema.
- Modifier execution order is Measured Air Speed → Morning Clothing Estimate → Dynamic Clothing → Solar Gain. PMV ASHRAE and PMV ISO each bind Dynamic Clothing to their own standard; other models do not declare it.
- Input sub-tools keep base SI input separate from modifier configuration. Each model declares its supported subset in the fixed global order, and the controller derives effective SI input through those executable definitions before supplying `ModelCalculationContext` (`effectiveQuantitiesByInput`, `auxiliaryQuantitiesByInput`, `modelInputs`, `options`); modifiers must never write effective values back to base state.
- Keep Time-series out of Analysis state. It uses its own controller. Membership comes from the PHS declaration’s `tables.timeSeries`; `state/timeSeries/modelConfigs.ts` reads that declaration instead of listing models as a second product registry. Declaring the table does not create a simulator. Do not add it to Analysis caches or Analysis share snapshots.

## Comfort Zone Design

Comfort zones are defined using the `ThermalZone` class in `src/catalog/thermalZone.ts`. Models select a `ZoneToken`; fill and text colours come from `src/catalog/zoneTokens.ts` (screen, publication, and colour-blind columns). Hex may remain as a test/custom fallback.

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

Zone boundaries appear **once** — as `min` / `max` values in the zone config. Do not also define them as separate named constants. `id`, `textColor`, `cssClass`, and `category` are optional; `id` and `cssClass` can be derived from the label or token by `ThermalZone`. Explore/Compliance bands that are not `ThermalZone` instances use `numericBandFromToken()`. Print and colour-blind updates happen in the token table, not in model files.

## Generic Calculation Cache

Use the generic `ModelCalculationCache<R, C>` type for all model caches. Do not add new named per-model cache types (`PmvCalculationCache`, etc.). At the state controller level, store caches as `Record<ModelIdType, ModelCalculationCache<unknown, unknown>>` — the controller does not need to know what `R` and `C` are.

## Branching And Duplication

Avoid repeated model-mode branching across files such as:

- `src/declarations/pmv/` (`ashrae.ts`, `iso.ts`, `shared.ts`, and focused calculation/chart modules)
- `src/declarations/adaptive/` (`ashrae.ts`, `en.ts`, `shared.ts`, and focused calculation/chart modules)
- `src/ui/components/input-panel/` (presentational; field/option branching belongs in control behaviors and `inputPresentation.ts`)
- share/import-export synchronization paths

Do not add more repeated `if/else` chains per mode if a config table, model descriptor, or shared helper can express the rule once.

Component helpers should not become hidden domain engines. If a helper is deciding labels, units, display values, ranges, steps, and derivations based on multiple modes, that logic likely belongs in metadata or an engine adapter.

Do not reintroduce pure comfort-tool barrel files unless they provide a real stable public API boundary.

## UI Rules

- Prefer Flowbite Svelte components first.
- Prefer Tailwind utilities for layout, spacing, typography, and state styling.
- Add handwritten CSS only when there is a clear need.
- Preserve the current UI language unless a task explicitly asks for a redesign.
- Components should remain presentational or interaction-focused.
- Analysis input-panel components consume `InputPanelViewModel` the same way chart controls consume `ChartControlsViewModel`. Do not put formula implementations, unit conversion, display-range clamp, or modifier-draft merge in those components.
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
- no new direct `jsthermalcomfort` imports were added outside `src/declarations/**` or `src/engines/comfort/**`
- no new scattered conversion helpers were added outside the chosen conversion module family
- model or chart additions do not expand the controller with more hardcoded parallel properties unless explicitly approved
- module boundaries remain clear
- planned architecture slices match [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md) Done when for that ID, and do not reintroduce deleted wrappers to satisfy older sentences in this file

## Output Registry

Workspace membership is `WorkspaceId` in `src/catalog/workspaces.ts` (Standard, Explore, Time-series). Closed chart engines live in `src/catalog/chartEngines.ts` (`ChartEngine`, instance presentation types, and capability defaults). Table types live in `src/catalog/tableTypes.ts` (`TableType.Analysis` / `TimeSeries`). Every Analysis model declares `tables.analysis`. PHS also declares `tables.timeSeries`. Discriminated engine specs live in `src/engines/comfort/charts/kinds/types.ts`. Chart ids are derived from `charts` on each model declaration. `ParametricLine` is implemented (polylines and optional limit bands). ASHRAE and ISO PMV register heat-loss and SET instances. Field-chart profile metadata lives under `src/catalog/output/`:

- `fieldChartProfile.ts` — shared Compliance/Explore field-chart profile inputs

`ChartBuildResult` (including legend view-models) and Time-series `simulation.charts` declarations live in `src/engines/comfort/charts/` (`chartBuildResult.ts`, `simulationCharts.ts`). Time-series editor and Plotly-typed chart view models live in `src/state/timeSeries/viewModels.ts`; pure Time-series declaration contracts stay in `src/catalog/timeSeries.ts`. Site shell branding/links live in `src/ui/components/siteShellConfig.ts`.

Runtime models expose `buildTable()` and `buildChart()` through `src/state/analysis/modelConfigs/`. Shared table assembly helpers live in `src/engines/comfort/output/`. Time-series exposure summaries render through `src/ui/components/output/MetricSummaryPanel.svelte`.

Share snapshots store `selectedChartInstanceId` per model. Instance ids are derived from declarations only; there is no parallel `ChartInstanceId` tree.

## Documentation

- Keep this file focused on execution rules. Target architecture lives in `ARCHITECTURE-PLAN.md`.
- If a task materially changes state flow, model registration, or layer boundaries, update this file and `docs/` in the same work.
- Authoring a model: [docs/adding-a-model.md](docs/adding-a-model.md). Copy `heatIndex.ts`, add a `ModelId` member, register once. Hard stops: new chart engine, new primary, new modifier, new Time-series controller, new SI unit dimension.
- Do not add a documentation generator, deployment step, or product UI route for these internal files unless a later task explicitly requests one.

## Code Quality

- Code should be high quality, easy to read, maintainable over time, and suitable for collaborative development by multiple contributors.
