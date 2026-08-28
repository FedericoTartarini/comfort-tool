# Repository Guidelines

## Scope

This repository contains the active product frontend at the repository root, which should be treated as the frontend root for work in this scope.

- Product code lives in `src/`.
- Do not introduce new backend dependencies or server assumptions unless a task explicitly requires that.
- Never commit generated artifacts such as `dist/`, `node_modules/`, coverage output, or cache directories.

## Architecture source of truth

- **Target:** [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md) is a **living** contract. Named Plan slices (`0c`, `0t`, `0q`, …) still follow that file. Figure-ownership and import-lane moves update the Plan in place in the same change as the code — do not treat older Plan/AGENTS sentences as a freeze.
- **Historical:** `26-06-29-architecture-brief.md` is not the next design. Do not implement from it or restore its authoring model.
- **This file** describes the **current** tree and execution rules. When a slice deletes or replaces something still named here (preset factories, the parallel `ChartInstanceId` tree, `spec: unknown`, “reusable chart geometry belongs in `engines/`”), **rewrite this file**. Do not put those back to “match AGENTS.md”.
- Slice discipline: do only the named Phase ID when executing a Phase ID. Figure-geometry moves that the Plan already describes in §3.2 / §4 / §5 do not need a new Phase ID. Do not add unrelated new models during the cutover.
- The product is not deployed. There is no share or URL compatibility requirement.
- After a slice lands, update this file, `CLAUDE.md`, `ARCHITECTURE-PLAN.md` current-tree sentences, and `docs/` in the same change so rules match the code.

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
  charts/                                             ChartType figure functions, draw/clone/export (native Plotly);
                           shared isoline root-finding in isolines.ts;
                           Psychrometric humidity curves and CBE isoline polygons in
                           psychrometric/ (assemble still only stacks traces)
  engines/
    comfort/               shared comfort helpers, request/axis adapters, chart binds
                           (ChartBuildResult, simulation chart declarations), modifiers
    units/                 SI <-> active-unit-system conversion helpers
    chartTheme.ts          Screen and publication chart theme (mm/pt/dpi, single/double column; zone palettes applied here)
    plotlyExport.ts        Publication PNG/SVG from a dedicated figure
  state/
    analysis/              point session (Standard+Explore): input/setting/output,
                           model configs, share state, projections
    timeSeries/            Time-series session (PHS); editor/chart view models
    workspace/             route / model / surface coordination
  testSupport/             Compare helper; golden inputs/control counts from the registry
```

Canonical Standard URLs are `/standard/{standard}/{model}/` (for example `/standard/ashrae-55/pmv-ashrae/`). Explore is `/explore/{model}/`. Time-series is `/time-series/{model}/`. Mixed-case and workspace-only aliases replace-redirect to that path.

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
- `declarations` -> `catalog`, `engines`, builder helpers from `state/analysis/modelConfigs`, and `charts/<ChartType>` geometry helpers (not Plotly assemble)
- `engines` -> `catalog`
- `charts` geometry helpers must not import models, quantities, or declarations
- Canonical shared domain state stays in SI units.
- Views compose pages.
- Components handle rendering and interaction.
- State orchestrates shared UI state, mode transitions, calculation context, and scheduling.
- `declarations` own model-specific zones, request mapping, calculations, result sections, and chart **wiring** (evaluate, bands, payload arrays).
- `src/charts/` owns ChartType figure geometry and Plotly assemble. `engines/` is shrinking (units, modifiers, field-chart bind, theme/export, leftover comfort helpers). Do not add new reusable ChartType geometry under `engines/`.

## Calculation Ownership

Model-specific thermal-comfort logic belongs in `src/declarations/**`.
Reusable ChartType geometry belongs in `src/charts/`. Remaining shared
comfort helpers still live in `src/engines/comfort/**` until that layer
moves.

- PMV / PPD, UTCI, adaptive, heat-index, humidex, and wind-chill model calculations live under `src/declarations/**`; larger shared families keep calculation and chart **wiring** in focused modules beside their declarations.
- Shared psychrometric helpers, stress-band derivation, reusable **field-chart** scaffolding, reference values, adapters, and cross-model utilities that have not yet moved belong in `src/engines/comfort/**`.
- Psychrometric isoline geometry (RH-parameterized T roots at ~0.001°C width, RH 0%/100% caps, shared band edges) lives in `src/charts/psychrometric/`. Shared Cartesian isoline root-finding and linear caps live in `src/charts/isolines.ts`. All 2-D Dynamic charts (PMV, Heat Index, Humidex, Wind Chill, UTCI Dynamic, PHS) fill bands with those polygons. PMV ASHRAE and ISO To×vr clip relative air speed after root-finding when occupants have no local control (CBE vel-top). PMV `psychrometricChart.ts` wires `evaluate(T, RH)` and band thresholds; it does not solve isoline roots. TemperatureMode Air keeps `tr` from input on that field; Operative uses `tr=tdb` per sample (psychtop) and labels x Operative temperature. `assemble.ts` only stacks traces. Hover is Plotly `hovermode: closest` on Compare markers and data lines (`hovertemplate`); band fills, RH curves, and masks use `hoverinfo: skip`. Do not add a 100² tooltip grid.
- State and components must stay free of raw formula implementations.
- If a helper is missing: model-specific → beside the declaration; reusable ChartType geometry → `src/charts/<type>/`; leftover shared comfort (units, modifiers, request adapters) → `src/engines/comfort/**` until removed. Do not add a parallel isoline/geometry module under `engines/` for a ChartType that already has a `src/charts/` folder.

All direct `jsthermalcomfort` imports must stay inside `src/declarations/**`, remaining `src/engines/comfort/**`, or `src/charts/psychrometric/humidity.ts` (humidity ratio only).

- Do not add new direct `jsthermalcomfort` imports in `src/state/**`, `src/ui/components/**`, `src/ui/views/**`, or top-level `src/engines/*.ts`. `src/charts/psychrometric/humidity.ts` may import `psy_ta_rh` for humidity ratio only; isolines and assemble must not import `jsthermalcomfort`.
- When touching shared helpers, prefer moving reusable **figure geometry** under `src/charts/` rather than adding more `engines/comfort/charts/` files. Leftover comfort logic may still land under `src/engines/comfort/**` until that layer is removed.

## Physical Quantity Rules

- `src/catalog/quantities.ts` is the **closed quantity catalog** for inputs and outputs. Models select ids; they do not own, extend, or invent them. Occupancy is Primary | Slot | Extra | output, derived from lists (`primaryInputOrder`, slot lists, `extraQuantityIds`, `exploreOutputs` / `complianceProfile.output`), not stamped on catalog rows. BodyWeight and Height are Extra catalog ids. Duplicate Extra selections, Extra ids that are not Extra, unknown ChartTypes, or a Time-series table without Time-series capability fail `defineModel` / `assembleCatalogs` (`validateModel`). There is no `validate.model` hook. There is no `ModelOutputKey`. Humidity ratio is one id (`hr`). Quantity meta has `step`, not `decimals`. Visible numbers use `formatDisplayValue` (max two decimal places, strip trailing zeros). Conversion does not round.
- A model declaration may select Extra catalog ids via `extraQuantities` (PHS uses `phsPersonQuantityIds`). Extra quantities **must not** enter `primaryInputOrder` or the global share primary record; they live in sparse `modelInputsByModel`. Do not add PHS weight/height to the Analysis input panel.
- All quantity conversion (fields, modifiers, Extra ids, chart axes) reads closed catalog SI units (`display.units.SI` / `SiUnit`) in `src/engines/units/` via `convertQuantityFromSi`. Control widgets stay generic and must not branch on quantity-id lists, `if (model === Phs)`, or PHS quantity ids. Canonical state remains SI. `display.units.SI` is the storage unit (for example `kg/kg`, `Pa`, `kg`, `m`, `degC`); SI/IP display labels such as g/kg and kPa live in `display.displayUnits`. New unit dimensions are frontend catalog work (`SiUnit` plus a converter), not declaration-only work.
- Request short names (`tdb`, `vr`, `rh`, …) are allowed only at the `jsthermalcomfort` boundary. Each model's `createFieldRequestAdapter()` mapping is the sole catalog→library connection point. Simple models keep that mapping in the declaration file (`heatIndex.ts`, `humidex.ts`, `windChill.ts`); larger families keep it in `calculation.ts`. Application request and chart-source types do not use a `Dto` suffix (`PmvRequest`, `ModelChartSource`, …). Cross-layer chart-source types live in `src/catalog/chartSource.ts`. Generic chart figure inputs live in `src/charts/types.ts`. Do not add application-layer `*Dto` types.
- `quantitiesByInput` stores base primary SI before modifiers; `effectiveQuantitiesByInput` in `ModelCalculationContext` is what calculations and request mapping read.
- Calculate each model once into `calculationCacheByModel`; chart builders read `resultsByInput` and `chartSource` from that cache. Presentation-only changes (mode, axes, bands) must rebuild charts without invalidating ready caches.
- Golden regression fixtures live in `src/testSupport/goldenFixtures.ts`. Compare/coverage golden **values** are derived from each registered model's `inputFields` plus the shared `standardPrimaryFixture`. Explicit SI overrides exist only when that fixture is outside a declared range — do not invent values from min/max or catalog `defaultSi`. Required control IDs and primary quantities are independently authored in `src/testSupport/requiredModelControls.ts` and pinned in focused model tests; do not derive that expected side from `inputFields`. Known-value calculation snapshots stay explicit numbers. Do not reintroduce ad-hoc `refactor*` baseline files or a per-model golden-input switch.
- Every Analysis model must pass `assertCompareContract` in `src/testSupport/assertCompareContract.ts`: 1/2/3 visible inputs, filled table columns, chart markers, and a baseline change that does not invalidate a ready cache. Three inputs must not fail silently. Golden values for that helper come from the registry, not a per-model switch. Focused model tests must pin required control IDs against `requiredModelControls.ts` so dropping a required field cannot stay green.
- ESLint restricted wire literals in `eslint.config.js` must stay aligned with `primaryInputOrder`; `src/catalog/catalogWireIds.test.ts` guards that sync.

## Conversion Ownership

- Canonical state remains unrounded SI float.
- All unit conversion should live in one conversion module family under `src/engines/units/`.
- Quantity SI ↔ display conversion reads `display.units.SI` from the closed quantity catalog (`convertQuantityFromSi` / `convertQuantityToSi`). Conversion does not round.
- Visible numbers use `formatDisplayValue` (max two decimal places, strip trailing zeros). Input commit uses `roundToDisplay` then converts to SI. Isoline geometry and `calculate` stay full precision.
- Do not scatter new temperature, speed, humidity-ratio, or vapor-pressure conversions across components or state helpers.

## State Rules

The controller uses generic keyed structures. New work must preserve that shape rather than adding parallel model-specific state.

Current risks to avoid extending:

- separate model-specific selected-chart fields at the top level
- separate model-specific result buckets at the top level
- separate chart result slots such as `psychrometricChart`, `relativeHumidityChart`, `utciStressChart`, and `utciTemperatureChart`
- separate derived per-input maps that grow one field at a time without a broader structure

Preferred direction for refactors and new model work:

- `selectedModel`, chart instance, Compare, unit system, and axes live in point-session `setting`
- `quantitiesByInput`, auxiliary slots, extras, and modifiers live in `input`
- calculation cache (`$state.raw`), loading, and error live in `output`
- chart builds resolved on demand from calculation cache + output settings

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
- quantity identifiers (`PhysicalQuantityId`, `ChartAxisQuantityId` for selectable chart axes). All ids live in `src/catalog/quantities.ts`. Models select Extra ids with `extraQuantities`; they do not contribute quantity metadata.
- chart types (`ChartType` in `src/catalog/chartTypes.ts` is the closed product set). Dropdown labels are `chartTypeLabel[type]` (Heat Loss, Body Temperature, SET). `defineModel` and family modules use `FrontendChartDeclaration` with `type: ChartType`; spec must match that type. There is no ModelId allowlist. Figure assemble in `src/charts/` takes generic arrays and must not import models or quantities. Psychrometric humidity curves and CBE isoline polygons live in `src/charts/psychrometric/`; those helpers take `evaluate(T, RH)` and humidity-ratio callbacks, not `ModelId` or `PhysicalQuantityId`. Chart ids live on each declaration’s `charts` entries (`id`); the builder maps them to runtime `instanceId`. One model registers each ChartType at most once. Heat Index / Humidex use a single Dynamic instance. Psychrometric is a ChartType currently used by PMV ASHRAE/ISO. Keep the eight ChartType product names.
- compare-input identifiers
- chart modes and model-output identifiers
- modifier identifiers (`ModifierId`, modifier `PhysicalQuantityId` slots)
- zone tokens (`ZoneToken` in `src/catalog/zoneTokens.ts`). Models select tokens; screen, publication, and colour-blind hex live in that table. `src/charts/draw.ts` remaps zone fills for print and colour-blind palettes. Sweeping leftover series/marker hex is not required.

Do not introduce new raw domain strings for those concepts, and do not recreate a parallel `ChartInstanceId` tree.

## Capability Declarations And Runtime Architecture

Current code already has Standard/Explore workspaces, the shared `FieldChartConfig` engine, per-model chart-setting memory, and generic input modifiers. Further architecture work follows the living [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md), not the June 2026 brief. When ownership moves, rewrite this file and the Plan in the same change.

- Product surfaces are Standard, Explore, and Time-series (`SurfaceId` in `src/catalog/surfaces.ts`). Point session (`PointSession` in `src/state/analysis/createAnalysisState.svelte.ts`) serves Standard+Explore. Time-series is a separate session. Analysis is not a fourth navigation item.
- Every model declaration must set `workspaceCapabilities` and `exploreOutputs`; Standard-capable models must also set `complianceProfile` with non-empty bands, a caption, legend title, and result feedback callback. Assemble with `defineModel`. Family modules (PMV, Adaptive) may still use `ComfortModelBuilder` internally. Do not branch in the controller.
- Explore/compliance output keys are `PhysicalQuantityId`. Capability types, surface/profile metadata, `bandsFromThermalZones()`, and `numericBandFromToken()` live in `src/catalog/modelCapabilities.ts`. Reuse them instead of inline strings or copied zone thresholds.
- `outputSettingsByModel` stores each model's x/y axes, baseline, and optional Explore working state. Explore z comes from `exploreOutputs`, and editable numeric bands are cloned from `defaultBands`; Standard workspace output and bands always come directly from `complianceProfile`.
- `primaryInputOrder` in `src/catalog/quantities.ts` is the exact persisted primary-key set. Derive `PrimaryQuantityId` and `PrimaryInputState` from it; chart-only and derived `PhysicalQuantityId` values must not enter primary records, share primary records, behavior patches, modifiers, or calculation context. Extra catalog ids selected via `extraQuantities` also stay out of that primary set and serialize only under `modelInputsByModel`.
- Every model owns chart output through `defineModel` `charts` (`type: ChartType`) or family `ComfortModelBuilder.setCharts()`. `defineModel` may use any ChartType whose spec matches. Tables are declared with `tables: { results, timeSeries? }` as row arrays (quantity id, `{ quantity }`, or custom `{ id, label, format }`). There is no `TableType` catalog. Every point-session model must declare non-empty `tables.results`. PHS also declares `tables.timeSeries` plus `simulation.charts` for Body Temperature / Water Loss. Time-series surface membership is that slot (`getModelsForSurface(TimeSeries)`). Chart ids live on each declaration’s `charts` entries (`id`); the builder maps them to runtime `instanceId` and the registry derives those (`getDeclaredChartInstanceIds`). Duplicate ids, Extra ids that are not Extra, unknown ChartTypes, duplicate ChartType on one model, or a Time-series table without Time-series capability fail `defineModel` / `assembleCatalogs`. Do not paste `chartTypeCapabilities` copies; leave meaningful overrides (Wind Chill `locksYAxis`). Presentation instances do not carry bind spec. Dropdown text is `chartTypeLabel[type]`. Heat Index / Humidex declare one Dynamic chart. Psychrometric is a ChartType currently used by PMV ASHRAE/ISO. Heat-loss vs temperature and SET series builders live in `heatLossSeries.ts` / `setSeries.ts`. PMV Analysis tables include SET, cooling effect, relative air speed, and dynamic clothing as Compare-matrix rows. Explore still colours PMV and PPD; do not add a SET explore output key. UTCI and PHS binds live in `utci/charts.ts` and `phs/charts.ts`.
- 2-D Dynamic charts fill bands with isoline polygons from `src/charts/isolines.ts` (121 sweep points, scan-then-bisect to ~0.001 °C, skip missing roots, no vertex `toFixed(3)`). Hover is Plotly closest on Compare markers and data lines (`hovertemplate` / `customdata`); fills skip. UTCI 1-D stress may keep high sampling along one axis (for example 450 x-points). `src/charts/draw.ts` clones Plotly-owned data arrays (`x`, `y`, `z`, `text`) and nested records Plotly mutates, applies axis lines/ticks via `layout.template`, and maps non-finite grid `z` to `null` locally. Do not `JSON.parse(JSON.stringify(figure))`. Screen and publication figures share `src/engines/chartTheme.ts`. Export builds a separate publication figure (explicit mm/pt/dpi, PNG ~300 DPI equivalent, SVG of the same geometry, no mode bar) and must not `downloadImage` the on-screen DOM. Publication widths are journal single- and double-column profiles on that same theme; Compare legends stay readable at both widths. Zone fills remap through `src/catalog/zoneTokens.ts` (models select tokens; print and colour-blind updates happen in that table).
- Standard workspace models must provide `complianceProfile.legendTitle` in addition to fixed output, bands, caption, and feedback. Explore legends come from the selected `ModelOutput` via `ChartBuildResult.legend`.
- `setInputFields()` / `defineModel` `inputFields` declare visible inputs; `fieldInputBehaviors.ts` resolves each `InputFieldSpec` into shared control behaviors. Assembled runtime definitions keep `inputFields` so tests can derive Compare golden values from the registry. Required control IDs are independently authored and pinned in focused model tests; do not derive that expected side from `inputFields`. Model `optionHandlersByKey` is the sole option-change path. Models must provide complete defaults and exact parsers; invalid internal options are invariants, not occasions to fill defaults. Extra catalog quantities use `extraQuantities` plus `{ kind: "quantity", … }` only when they should appear on a panel; `build()` checks that every `quantity` field is listed in that declaration’s `extraQuantities`. Do not add PHS weight/height to the Analysis input panel. Control metadata is read from the closed catalog at view-model time. Analysis input-panel UI is presentational, matching chart controls: `buildInputPanelViewModel` / `getInputPanelViewModel` in `src/state/analysis/inputPresentation.ts` project tool controls, Compare toggles, field rows, clothing-builder bindings, and modifiers. Components must not receive the Analysis controller or implement conversion, clamp, or modifier-draft merge.
- Use `createFieldRequestAdapter()` to derive request mapping and ordinary chart-axis get/set behavior from one canonical field declaration.
- Compose `createRequestAxisAdapter()` for chart-only aliases and explicit Operative Temperature behavior; keep coupled temperature solving in the shared dynamic-axis solver.
- Mode, axis, baseline, Explore output, band, and chart changes are presentation-only. They must rebuild from a ready cache without invalidating or scheduling calculations.
- Share snapshots retain strict `version: 1`, store chart settings inside each model snapshot, serialize `quantitiesByInput`, sparse `auxiliaryQuantitiesByInput`, sparse `modelInputsByModel`, and `activeModifiersByInput`, serialize only Explore working bands plus exact modifier state, and use explicit wire sentinels for unbounded numeric edges. The `models` map is sparse: default model slices are omitted, missing known keys seed defaults, and unknown keys are rejected. Adding a model must not require every existing URL to list that model. Do not keep exact `comfortModelOrder` matching. Reject legacy `inputsByInput`, `derivedByInput`, and `modifierInputsByInput` payloads. Do not add old-v1 migration behavior.
- Band assignment is array-ordered and half-open (`min <= value < max`); numeric values, functional-edge X values, and band inputs are canonical SI.
- PMV ASHRAE and PMV ISO are separate registered models with explicit serialized IDs (`"pmv-ashrae"` and `"pmv-iso"`) and declaration files (`ashrae.ts` and `iso.ts`). ISO is explicitly ISO 7730 Category B; its Neutral `[-0.5, 0.5)` range intentionally matches ASHRAE numerically, while each declaration derives an independent band array from the Neutral zone. `shared.ts` owns only shared contracts/declaration data/builder assembly, `calculation.ts` owns formulas/results, and `charts.ts` owns psychrometric/dynamic chart **wiring** (evaluate, bands, payloads; psychrometric isoline geometry is in `src/charts/psychrometric/`; Cartesian Dynamic isolines are in `src/charts/isolines.ts`). Heat-loss vs temperature and SET `ParametricLine` series live in `heatLossSeries.ts` and `setSeries.ts`; ASHRAE and ISO declarations each register those instances. PMV Analysis tables include SET, cooling effect, relative air speed, and dynamic clothing; Explore outputs remain PMV and PPD. Adaptive uses the corresponding `shared.ts`, `calculation.ts`, and `charts.ts` split. PHS uses `phs.ts` plus `calculation.ts`, `charts.ts`, `timeSeries.ts`, `timeSeries.worker.ts`, and `timeSeriesCharts.ts`. Do not merge standards behind a runtime toggle.
- `ModifierId`, `PhysicalQuantityId` modifier slots, and the tuple-generic `InputModifier` contract live in `src/catalog/inputModifiers.ts` and `src/catalog/quantities.ts`; do not inline modifier strings.
- Builder `.setModifiers()` / `defineModel` `modifiers` receive executable model-owned declarations. The global catalogue contains only stable UI/share IDs and extra-input schema.
- Modifier execution order is Measured Air Speed → Morning Clothing Estimate → Dynamic Clothing → Solar Gain. PMV ASHRAE and PMV ISO each bind Dynamic Clothing to their own standard; other models do not declare it.
- Input sub-tools keep base SI input separate from modifier configuration. Each model declares its supported subset in the fixed global order, and the controller derives effective SI input through those executable definitions before supplying `ModelCalculationContext` (`effectiveQuantitiesByInput`, `auxiliaryQuantitiesByInput`, `modelInputs`, `options`); modifiers must never write effective values back to base state.
- Keep Time-series out of the point session. It uses its own session. Membership comes from `tables.timeSeries` (`getModelsForSurface(TimeSeries)`). Declaring the table does not create a simulator. Do not add it to point-session caches or share snapshots.

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
- no new direct `jsthermalcomfort` imports were added outside `src/declarations/**`, `src/engines/comfort/**`, or `src/charts/psychrometric/humidity.ts`
- no new scattered conversion helpers were added outside the chosen conversion module family
- model or chart additions do not expand the controller with more hardcoded parallel properties unless explicitly approved
- module boundaries remain clear
- planned architecture slices match [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md) Done when for that ID, and do not reintroduce deleted wrappers to satisfy older sentences in this file. When ownership moves without a new Phase ID, update the Plan’s current-tree sentences in the same change.

## Output Registry

Workspace membership is `SurfaceId` in `src/catalog/surfaces.ts` (Standard, Explore, Time-series). Point session serves Standard+Explore; Time-series is a separate session. Canonical app URLs are lowercase kebab-case. Standard calculation routes are `/standard/{standard}/{model}/` (for example `/standard/ashrae-55/pmv-ashrae/`). Explore is `/explore/{model}/`. Time-series is `/time-series/{model}/`. Mixed-case and workspace-only aliases replace-redirect to that path. Closed catalogs are quantities (`src/catalog/quantities.ts`, inputs and outputs) and ChartType (`src/catalog/chartTypes.ts`). Table row types live in `src/catalog/tableTypes.ts` with no TableType enum. Every point-session model declares `tables.results`. PHS also declares `tables.timeSeries`. Native Plotly recipes live in `src/charts/`. Chart ids are derived from `charts` on each model declaration. ASHRAE and ISO PMV register Heat Loss and SET instances. Field-chart profile metadata lives under `src/catalog/output/`:

- `fieldChartProfile.ts` — shared Compliance/Explore field-chart profile inputs

`ChartBuildResult` (including legend view-models) and Time-series `simulation.charts` declarations live in `src/engines/comfort/charts/` (`chartBuildResult.ts`, `simulationCharts.ts`). Time-series editor and Plotly-typed chart view models live in `src/state/timeSeries/viewModels.ts`; pure Time-series declaration contracts stay in `src/catalog/timeSeries.ts`. Site shell branding/links live in `src/ui/components/siteShellConfig.ts`.

Runtime models expose `buildTable()` and `buildChart()` through `src/state/analysis/modelConfigs/`. Shared table assembly helpers live in `src/engines/comfort/output/`. Time-series exposure summaries render through `src/ui/components/output/MetricSummaryPanel.svelte`.

Share snapshots store `selectedChartInstanceId` per model. Instance ids are derived from declarations only; there is no parallel `ChartInstanceId` tree.

## Documentation

- Keep this file focused on execution rules for the **live** tree. Target architecture lives in `ARCHITECTURE-PLAN.md` and is updated when that target moves.
- If a task materially changes state flow, model registration, layer boundaries, or figure ownership, update this file, `CLAUDE.md`, `ARCHITECTURE-PLAN.md`, and `docs/` in the same work. Do not leave a stale rule that blocks the next slice.
- Authoring a model: [docs/adding-a-model.md](docs/adding-a-model.md). Copy `heatIndex.ts`, add a `ModelId` member, register once. Hard stops: new ChartType, new primary, new modifier, new Time-series controller, new SI unit dimension. Do not solve ChartType isoline roots in a declaration.
- Do not add a documentation generator, deployment step, or product UI route for these internal files unless a later task explicitly requests one.

## Code Quality

- Code should be high quality, easy to read, maintainable over time, and suitable for collaborative development by multiple contributors.
