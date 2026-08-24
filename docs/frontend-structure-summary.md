# Frontend structure summary

This is an internal developer reference for the Svelte 5 frontend. Product code lives under `src/`; calculations run locally, canonical state is SI, and no backend or documentation deployment is part of the application build.

See [Adding a thermal model](adding-a-thermal-model.md) for the model-authoring checklist and [AGENTS.md](../AGENTS.md) for repository execution rules.

## Source ownership

| Layer               | Owns                                                                                                               | May depend on                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `views`             | Page composition                                                                                                   | components, state                                |
| `components`        | Rendering and interaction                                                                                          | state, models, lightweight services              |
| `routes`            | Explicit Browser History table, route hooks, and route-bound page adapters                                         | views, workspace state                           |
| `state/workspace`   | Typed Workspace metadata, route/model/mode/share coordination, and pending navigation replay                       | models, comfort-tool controller/registry         |
| `state/comfortTool` | Rune state, keyed model memory, cache scheduling, pure projections, strict share snapshots                         | models, services, registered runtime definitions |
| `state/timeSeries`  | Independent keyed scenario state and simulation lifecycle; membership from the PHS `tables.timeSeries` declaration | models, units, PHS Time-series simulator         |
| `comfortModels`     | Model declarations, calculations, results, chart evaluators, declaration-local zones                               | models, comfort/unit services, `defineModel`     |
| `services/comfort`  | Reusable comfort logic, modifiers, controls, psychrometrics, request/axis adapters, chart engines                  | models                                           |
| `services/units`    | SI/display conversion and presentation precision                                                                   | models                                           |

The model registry is the intentional exception that imports registered definitions from `comfortModels`. `jsthermalcomfort` imports are restricted to `comfortModels` and `services/comfort`.

Primary entrypoints are:

```text
src/App.svelte
src/routes/router.ts
src/state/workspace/routeDefinitions.ts
src/views/ComfortDashboard.svelte
src/state/workspace/createWorkspaceNavigation.ts
src/state/comfortTool/createComfortToolState.svelte.ts
src/state/comfortTool/types.ts
```

## Workspace routing and controller lifetime

The runtime topology is:

```text
sv-router Browser History
  -> persistent SiteShell (Header + Sidebar/Drawer + Footer)
    -> route outlet (Standard/Explore dashboard, Time-series workspace, or 404)
```

`App.svelte` constructs one `ComfortToolController` and one independent
`TimeSeriesController` above the route outlet. Dashboard routes share canonical SI input,
per-model chart memory, and calculation caches. Time-series retains its own per-model drafts
and successful results across navigation but neither reads nor schedules the Analysis
controller.

`state/workspace/routeDefinitions.ts` is the stable navigation source of truth. Standard membership is
derived from each model's `standardIds`; Explore membership is derived from
`supportsExploreWorkspace()`. Standard routes force Compliance profiles, Explore forces
Explore, and the chart exposes only a read-only mode summary.

The Workspace coordinator applies share snapshots without scheduling, resolves model/mode
constraints from the pathname, and then schedules the final target model once. Route
constraints win over conflicting snapshot model/mode values while the strict version-1 wire
schema remains unchanged. Boundary-warning navigation is held pending until confirmation;
cancellation leaves URL, model, and mode unchanged.

Public paths use clean trailing-slash URLs. Production static hosting must return
`index.html` for non-asset application paths so direct visits and refreshes reach the client
router; no backend or host-specific deployment dependency is introduced here.

## Model authoring and runtime definitions

Each registered model has one focused declaration entry under `src/comfortModels/`. “One declaration entry” means that its identity and product decisions are readable in one place; it does not remove the centralized stable-ID sets, explicit registry, or separate tests.

Simple models may keep calculation and chart code in the declaration file. Larger standard families use focused modules beside their declarations so formulas and chart construction are implemented once without hiding standard-specific decisions:

- PMV: ASHRAE/ISO declarations, shared builder assembly, calculation/results, and charts;
- Adaptive: ASHRAE/EN declarations, shared builder assembly, calculation/results, and charts;
- PHS: Analysis declaration, one ISO 7933:2023 stateful simulator, exposure-history and
  field charts, and the Time-series capability declaration.

`ComfortModelDefinition<Result, ChartSource, ComplianceBand = NumericBand>` is the typed authoring contract in `modelConfigs/definition.ts`. Builder setters preserve the model's result, chart-source, and Compliance-band types. Numeric-band models normally omit the third argument; models with functional band edges use `Band`. `build()` validates semantic invariants and erases those generics exactly once into `RuntimeComfortModelDefinition`.

The explicit registry is:

```ts
Record<ComfortModel, RuntimeComfortModelDefinition>;
```

It owns registration and ordering only. The controller consumes runtime definitions without importing model implementations, double-casting definitions, or adding model-specific state.

Declaration-local `ThermalZone[]` values derive Explore or Compliance bands. Zones are not copied into the runtime definition, and each numeric boundary has one source.

## Canonical inputs and quantity catalog

`src/models/physicalQuantities.ts` is the **system seed**. The runtime catalog is `system seed ∪ declarations[].quantities.extend`, assembled once by the model registry. Duplicate ids, wrong owners, or an extend id in `primaryInputOrder` fail assemble. `primaryInputOrder` defines the nine shared primary SI values persisted for every input slot. `ChartAxisQuantityId` covers selectable chart-axis coordinates, including operative temperature and humidity ratio. Extended quantities (today PHS body weight/height, declared on the PHS file) serialize only under sparse `modelInputsByModel`.

Controller state splits quantities three ways:

```text
quantitiesByInput          — base primary SI per InputId (Input1–Input3)
auxiliaryQuantitiesByInput — sparse slot quantities (derived psychrometrics + modifier configuration)
modelInputsByModel         — sparse model-scoped SI values (e.g. PHS body weight/height)
```

Derived slot values (dew point, wet bulb, vapor pressure, derived humidity ratio) live in `auxiliaryQuantitiesByInput` and are recomputed from primary values. Modifier extra inputs use `PhysicalQuantityId` keys from the same catalog.

Models declare visible fields with `setInputFields()` and model-scoped quantities with `.extendQuantities()`. Those two calls may happen in either order; `build()` checks that every `modelQuantity` field is an extend entry owned by that declaration. Control metadata is read from the assembled catalog at view-model time. `fieldInputBehaviors.ts` resolves `InputFieldSpec` kinds into shared control behaviors in `numericControl.ts`, `temperatureControl.ts`, and `humidityControl.ts`. Model-scoped mass/length conversion reads catalog SI units; it does not branch on model id.

Every model supplies complete default options and an exact parser. Missing, extra, or invalid external options are rejected; invalid internal option state is an invariant error.

## Requests, axes, and calculations

`createFieldRequestAdapter()` accepts one mapping from numeric request properties to canonical fields and returns calculation mapping plus ordinary chart-axis get/set behavior.

`createRequestAxisAdapter()` composes that mapping when charts need aliases or explicit operative-temperature behavior. PMV aliases Wind Speed to Relative Air Speed; UTCI aliases Relative Air Speed to Wind Speed. Each supplies its standard-relevant operative get/set/range rules through the adapter.

The shared dynamic-axis solver applies two coordinates as one physical constraint. For Air/Radiant/Operative pairs, it preserves the explicitly selected component and solves the coupled component instead of allowing a later write to overwrite the earlier coordinate.

Calculations receive `ModelCalculationContext`, containing `effectiveQuantitiesByInput` (modifier-adjusted primary SI), sparse `auxiliaryQuantitiesByInput`, sparse `modelInputs`, and only the active model's options after exact parsing. Base primary SI remains in `quantitiesByInput` and is not passed directly to calculations. The keyed `modelOptionsByModel` record remains in controller/share state. Each definition returns typed results and a typed chart source. At controller level they are stored in generic `ModelCalculationCache<unknown, unknown>` records keyed by model ID.

Compare is three input slots, a results matrix, overlay markers, and a baseline selector. `assertCompareContract` in `src/testSupport/assertCompareContract.ts` is the Analysis-model helper for that contract: 1/2/3 visible inputs, filled table columns, chart markers, and a baseline change that does not invalidate a ready cache. Three inputs must not fail silently. Do not add a third table engine.

## Generic input modifiers

The controller stores three separate concepts:

```text
base primary SI (quantitiesByInput)
modifier enabled/configuration state (activeModifiersByInput + auxiliaryQuantitiesByInput)
derived effective SI input (calculation context)
```

`defineInputModifier()` uses tuple generics for `extraInputs` (`PhysicalQuantityId[]`) and `affectedFields`. A callback receives complete effective input and exact complete extra inputs, and may return only a patch of its declared canonical fields. Incomplete configuration is handled at the parser/application boundary; non-finite or undeclared output is rejected.

Executable modifier definitions belong to model declarations. The global catalogue contains only stable UI/share IDs and extra-input schema. Supported definitions execute in this fixed order:

```text
Measured Air Speed -> Morning Clothing Estimate -> Dynamic Clothing -> Solar Gain
```

PMV ASHRAE and PMV ISO each declare Dynamic Clothing with their own `clo_dynamic` standard. Other models do not declare it. Dynamic Clothing has no additional user input and consumes the current effective clothing/metabolic values, so it follows Morning Clothing when both are enabled.

Modifier output never writes back to base state. Disabling any modifier therefore recomputes the effective values from base input through the remaining chain.

The input panel exposes one **Input modifiers** button below its fields when the active model declares support. Its modal clones only the current visible-input/model-modifier matrix into a canonical-SI draft. Draft controls project the complete effective chain for preview, while **Apply** validates and commits the matrix atomically with at most one calculation refresh. **Cancel**, dismissal, or a model/unit/visible-input context change discards the draft. Disabled-but-configured values remain persistable without invalidating a ready calculation because they do not affect effective input.

## Controller composition

`createComfortToolState.svelte.ts` owns rune initialization, cache invalidation, calculation scheduling, and action/selector composition. Pure logic lives beside it:

- `chartPresentation.ts` projects controls, captions, feedback, legends, and chart presentation;
- `modifierState.ts` derives effective input and handles modifier control transitions;
- `modelSwitch.ts` detects invalid target-model values and builds canonical-SI clamp patches.

These modules receive ordinary state/config/context values. There is no dependency-injection container, service class, forwarding wrapper, or model-specific controller branch.

State stays keyed by model ID: selected charts, options, chart settings, caches, results, and chart results do not grow parallel PMV/UTCI slots. Input quantities use `quantitiesByInput`, `auxiliaryQuantitiesByInput`, and `modelInputsByModel` rather than model-specific parallel maps.

## Charts and presentation cache

Each model declares charts through discriminated `ChartKind` specs (no `spec: unknown`). `defineModel` uses `ModelChartDeclaration`: a data-only union over existing engines (`DynamicField`, `BoundaryRegion`, `BandScalar`, `TimeSeriesLine`). Optional `type` names a built-in or extended chart type, is preserved on the presentation instance, and cannot escape that union. Family modules use `ComfortModelBuilder.setOutputCharts()` with `FrontendChartDeclaration`. Engine spec stays on `chartKindRegistrations`; presentation instances do not carry it. The registry derives instance ids (`getDeclaredChartInstanceIds`) and uniqueness tests require non-empty per model, unique per model, and unique globally. Chart capabilities (axis selection, Y lock, zone toggle, legend, baseline) are declared per instance or inherited from kind defaults. Explore output narrowing uses `supportedExploreOutputs` and `defaultExploreOutput` on chart entries. Heat Index / Humidex fixed-axis maps are `DynamicField` types with `lockedAxes`, not `Custom`. `Custom` is frontend-only for PMV ASHRAE/ISO psychrometric charts declared on those models. PMV Dynamic is `DynamicField`; PHS Analysis exposure history is `TimeSeriesLine`. `ParametricLine` is omitted until Phase 1. UTCI BandScalar/DynamicField specs live in `utciCharts.ts`.

Standard and Explore share the field-chart engine via workspace-derived `FieldChartProfile`:

- Standard workspace reads fixed output/bands, caption, legend title, and feedback from `complianceProfile`.
- Explore reads a selected `ModelOutput` and a per-model editable working copy of numeric default bands.
- Band membership is array ordered and half open: `min <= value < max`.
- Legend metadata is attached to `ChartBuildResult` at build time.

Chart selection, workspace-derived profile, axes, baseline, Explore output/bands, unit system, and zone visibility are presentation-only. They rebuild from a ready calculation cache and do not invalidate or schedule model calculation.

The psychrometric chart clamps its drawable domain at 100% relative humidity.

## Time-series state and charts

Time-series support is declared on the PHS Analysis declaration as `tables.timeSeries`
(`TableType.TimeSeries`) plus `setSimulation({ charts })`. The Time-series controller stays
separate. `state/timeSeries/modelConfigs.ts` reads that PHS declaration for membership; it is
not a second product registry. The PHS simulator remains in `phsTimeSeries.ts`. Declaring the
table does not create a simulator. Each simulator owns its opaque
draft/result types, defaults and cloning, validation, editor controls and presets,
and asynchronous simulation. The first and currently only Time-series model is PHS / ISO 7933:2023.

`createTimeSeriesState.svelte.ts` stores `draftByModel`, `resultByModel`, status, validation
errors, calculation revision, and progress as records keyed by registered model ID. A model
switch therefore retains independent drafts and last successful results. Time-series has a
local unit system, remains canonical SI, and stays outside Analysis caches and
share snapshots.

The selected model runs automatically when the workspace starts. Calculation-relevant valid
edits debounce for 300 ms; a newer revision aborts or supersedes older work and is the only
revision allowed to commit. Invalid drafts remain in Waiting state and keep the prior
successful charts visible. Unit changes and segment-name edits rebuild presentation from the
cached SI result without scheduling a simulation. Model simulations receive an abort signal
and progress callback; PHS performs its full sequence in a client-side worker.

PHS accepts any non-empty sequence of positive whole-minute segments; the eight-hour horizon
belongs only to the Analysis assessment. Its shared simulator carries skin, core, rectal,
sweat, and evaporative state across segment boundaries. Both Time-series charts use the same
complete result history and downsample only their DTO points while retaining boundaries,
extrema, limit crossings, and the final point. The temperature chart shows rectal temperature,
optional core temperature, the 38 °C line, and phase boundaries; the water-loss chart uses the
applicable 5% or 3% body-mass limit and matching boundaries.

Time-series chart DTOs reuse `PlotlyCanvas`, but they do not use `FieldChartConfig` or the
Analysis chart cache. Time-series has no share URL in the current implementation.

## Round 2 shared capabilities (2026-08)

Round 2 on branch `better-structure` added reusable building blocks without changing
canonical SI persistence or Workspace routing:

| Capability                   | Location                                                                               | Use                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Grid dynamic charts          | `services/comfort/charts/gridModelCharts.ts`                                           | PHS, UTCI Dynamic, psychrometric index models         |
| Chart-source extensions      | `calculatePerInputWithExtensions()` in `requestMapping.ts`                             | PMV `comfortZonesByInput`                             |
| Input value presets          | `services/comfort/controls/inputControlPresets.ts` + `{ kind: "preset" }` input fields | PMV metabolic/clothing, Adaptive air speed            |
| Index model declarations     | `comfortModels/heatIndex.ts`, `humidex.ts`, `windChill.ts` via `defineModel`           | Heat Index, Humidex, Wind Chill                       |
| Plotly presentation shell    | `components/chart/PlotlyChartCard.svelte`                                              | Analysis chart body, Time-series cards                |
| Time-series line traces      | `services/comfort/charts/timeSeriesLineChart.ts`                                       | PHS exposure history + Time-series charts             |
| Initial controller state     | `state/comfortTool/initialComfortToolState.ts`                                         | Factory helpers for rune entry                        |
| Controller actions/selectors | `comfortToolActions.ts`, `comfortToolSelectors.ts`, `comfortToolInternals.ts`          | Thin rune entry in `createComfortToolState.svelte.ts` |
| Workspace two-column shell   | `components/layout/WorkspaceTwoColumnLayout.svelte`                                    | Analysis + Time-series page grid                      |
| Chart export (Time-series)   | `ChartExportDropdown.svelte`, `TimeSeriesChartCard.svelte`                             | Per-chart PNG/SVG on Time-series page                 |

**Special-case charts** (not grid assembly): PMV psychrometric, UTCI stress, PHS exposure
history, Adaptive boundary chart. Time-series remains outside `FieldChartConfig`.

### Round 2 completion status

Round 2 architecture and finish-out work on `better-structure` is **complete** (grid helpers,
controller split, UTCI calculation split, B10 layout/export, full validation matrix).

**Explicitly deferred (not Round 2 gaps):** CI workflow; Time-series in
`FieldChartProfile`. Sparse share landed in Plan 0b.

## Round 3 shared capabilities (2026-08)

Round 3 on branch `better-structure` finished P0/P1 architecture without changing share
schema, canonical persistence, or special-chart geometry:

| Capability                 | Location                                                                                                    | Use                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Index model declarations   | `defineModel` in `heatIndex.ts`, `humidex.ts`, `windChill.ts`                                               | Heat Index, Humidex, Wind Chill (no preset factory)                        |
| Builder chart registration | `defineModel` `outputCharts` / `ComfortModelBuilder.setOutputCharts()` with discriminated `ChartKind` specs | UTCI, PHS, PMV/Adaptive families, index models                             |
| Input field specs          | `services/comfort/controls/fieldInputBehaviors.ts` + `setInputFields()`                                     | Declarative temperature, humidity, wind, preset, and model-quantity blocks |
| PMV chart module split     | `pmvChartShared.ts`, `pmvPsychrometricChart.ts`, `pmvDynamicChart.ts`                                       | Readability; `pmvCharts.ts` routes views only                              |
| Adaptive air-speed preset  | `adaptiveShared.ts` uses `setInputFields({ kind: "preset" })`                                               | Same pattern as PMV metabolic/clothing                                     |

Grid-capable models declare `ChartKind.DynamicField` entries through
`outputCharts`, including Heat Index / Humidex fixed-axis maps and PMV Dynamic.
PMV psychrometric uses `ChartKind.Custom` (frontend-only; `defineModel` cannot declare it).
UTCI stress, PHS Analysis exposure history (`TimeSeriesLine`), and Adaptive
boundary charts remain special-case geometry in focused modules. `ParametricLine` is
omitted until Phase 1.

**Explicitly deferred (not Round 3 gaps):** CI workflow; Time-series in `FieldChartConfig`.
Sparse share landed in Plan 0b.

**Dependency baseline (post-upgrade):** Node `>=22`, Vite 8, Vitest 4, Tailwind CSS 4.3
(`@tailwindcss/vite`), Flowbite 4, `flowbite-svelte` `0.48.x`, Plotly `3.7`,
`jsthermalcomfort` `1.4`, Svelte 5, `sv-router` `0.18.1`, TypeScript `6.0.x`.
TypeScript 7 and `flowbite-svelte` 1.x are intentionally not adopted (ESLint peer
range and Flowbite 4 incompatibility respectively).

## Share state

Share snapshots use one strict `version: 1` schema. Top-level input keys are `quantitiesByInput` (full `PrimaryInputState` per input slot), sparse `auxiliaryQuantitiesByInput` (modifier `PhysicalQuantityId` values only), sparse `modelInputsByModel` (per-model quantity overrides), and `activeModifiersByInput` (complete modifier enablement matrix). The `models` map is sparse: default model slices are omitted from the wire, missing known model keys seed defaults, and unknown model keys are rejected. Adding a registered model does not require existing URLs to list that model. Only Explore working bands are serialized; functional Compliance bands come from declarations. Infinite numeric edges use explicit wire sentinels.

The modifier records contain the exact stable modifier key set, including Dynamic Clothing. Extra quantity, option, chart, band, modifier, or model keys are rejected. Missing known model keys seed defaults rather than requiring an exact `comfortModelOrder` map. Legacy `inputsByInput`, `derivedByInput`, and `modifierInputsByInput` payloads are rejected. There is no migration reader, fallback, compatibility shim, or cutover path.

## Validation

Run the complete matrix before considering an architecture or model change complete:

```bash
npm test
npm run check
npm run lint
npm run build
npm run test:visual
git diff --check
```

The production command builds only the application entry. The files under `docs/` are maintained as internal Markdown and are neither generated nor deployed by that command.
