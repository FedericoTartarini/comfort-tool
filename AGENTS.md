# Repository Guidelines

## Scope

This repository contains the active product frontend at the repository root, which should be treated as the frontend root for work in this scope.

- Product code lives in `src/`.
- Do not introduce new backend dependencies or server assumptions unless a task explicitly requires that.
- Never commit generated artifacts such as `dist/`, `node_modules/`, coverage output, or cache directories.

## Architecture

Product architecture is [docs/architecture.md](docs/architecture.md). This
file is execution rules for the live tree. When a change moves state flow,
model registration, layer boundaries, or figure ownership, update this file,
`CLAUDE.md`, and `docs/` in the same work.

The product is not deployed. There is no share or URL compatibility
requirement.

## Source Tree

Primary source layout:

```text
src/
  App.svelte
  declarations/          Heat Index–class one file; family folders pmv/, adaptive/, phs/; UTCI is utci/utci.ts
  ui/
    components/
      chart/               chart rendering and export UI
      input-panel/         presentational point-session input UI
      siteShellConfig.ts   site branding and footer/header links
    routes/                client router and page composition
    utils/                 UI actions (`clickOutside`)
  catalog/                 centralized domain constants and metadata (including zone tokens);
                           fieldChartProfile.ts and resultSections.ts at catalog root
  charts/                  ChartType figure functions, draw/clone/export (native Plotly);
                           chartTheme.ts, plotlyExport.ts;
                           shared isoline root-finding in isolines.ts;
                           Psychrometric humidity curves and CBE isoline polygons in
                           psychrometric/ (assemble still only stacks traces)
  engines/
    comfort/               shared comfort helpers, request/axis adapters, chart binds
                           (ChartBuildResult, simulation chart declarations), modifiers
    units/                 SI <-> active-unit-system conversion helpers
  state/
    modelRegistry/         defineModel, ComfortModelBuilder, registered runtime configs
                           (shared by both sessions; not session state)
    pointSession/          Standard+Explore session: input/chart/setting/output buckets, actions, $derived
                           view-models, share snapshot/codec/url
    timeSeries/            Time-series session (PHS); editor/chart view models
    app/                   route identity, navigation, AppContext
  testSupport/             Compare helper; golden inputs/control counts from the registry
```

Canonical Standard URLs are `/standard/{standard}/{model}/` (for example `/standard/ashrae-55/pmv-ashrae/`). Explore is `/explore/{model}/`. Time-series is `/time-series/{model}/`. Mixed-case and workspace-only aliases replace-redirect to that path.

Key entrypoints:

```text
src/App.svelte
src/ui/routes/ComfortDashboard.svelte
src/state/pointSession/createPointSession.svelte.ts
src/state/pointSession/types.ts
```

## Architecture Priorities

- Keep cross-layer imports constrained to these lanes:
- `ui/routes` -> `ui/components`, `state`
- `ui/components` -> `state`, `catalog`, lightweight `engines`
- `state` -> `catalog`, `engines`; `state/modelRegistry` imports registered configs from `declarations`
- `declarations` -> `catalog`, `engines`, builder helpers from `state/modelRegistry`, and `charts/<ChartType>` geometry helpers (not Plotly assemble)
- `engines` -> `catalog`
- `charts` geometry helpers must not import models, quantities, or declarations
- Canonical shared domain state stays in SI units.
- Routes compose pages.
- Components handle rendering and interaction.
- State orchestrates shared UI state, mode transitions, calculation context, and scheduling.
- `declarations` own model-specific zones, request mapping, calculations, result sections, and chart **wiring** (evaluate, bands, payload arrays).
- `src/charts/` owns ChartType figure geometry, Plotly assemble, screen/publication theme, and publication export. `engines/` is shrinking (units, modifiers, field-chart bind, leftover comfort helpers). Do not add new reusable ChartType geometry under `engines/`.

## Calculation Ownership

Model-specific thermal-comfort logic belongs in `src/declarations/**`.
Reusable ChartType geometry belongs in `src/charts/`. Remaining shared
comfort helpers still live in `src/engines/comfort/**` until that layer
moves.

- PMV / PPD, UTCI, adaptive, heat-index, humidex, and wind-chill model calculations live under `src/declarations/**`; larger shared families keep calculation and chart **wiring** in focused modules beside their declarations.
- Shared psychrometric helpers, stress-band derivation, reusable **field-chart** scaffolding, reference values, adapters, and cross-model utilities that have not yet moved belong in `src/engines/comfort/**`.
- Psychrometric isoline geometry (RH-parameterized T roots at ~0.001°C width, RH 0%/100% caps, shared band edges) lives in `src/charts/psychrometric/`. Shared Cartesian isoline root-finding and linear caps live in `src/charts/isolines.ts`. All 2-D Dynamic charts (PMV, Heat Index, Humidex, Wind Chill, UTCI Dynamic, PHS) fill bands with those polygons. PMV ASHRAE and ISO To×vr clip relative air speed after root-finding when occupants have no local control (CBE vel-top). PMV Psychrometric wiring is `PsychrometricDataSpec` (`evaluate`, bands, isoline targets) in the declaration; isoline geometry stays in `src/charts/psychrometric/`. TemperatureMode Air keeps `tr` from input on that field; Operative uses `tr=tdb` per sample (psychtop) and labels x Operative temperature. `assemble.ts` only stacks traces. Hover is Plotly `hovermode: closest` on Compare markers and data lines (`hovertemplate`); band fills, RH curves, and masks use `hoverinfo: skip`. 2-D field charts (Psychrometric, Dynamic, Adaptive) add one Plotly probe scatter driven by `ChartBuildResult.hoverProbe` (display→SI `evaluate`); the probe follows the pointer and does not snap to Compare markers (native marker hover is skipped while the probe is attached). The probe is not on `ChartPayload` and is omitted from publication export. Do not add a 100² tooltip grid or fill `hoveron: "fills"`.
- State and components must stay free of raw formula implementations.
- If a helper is missing: model-specific → beside the declaration; reusable ChartType geometry → `src/charts/<type>/`; leftover shared comfort (units, modifiers, request adapters) → `src/engines/comfort/**` until removed. Do not add a parallel isoline/geometry module under `engines/` for a ChartType that already has a `src/charts/` folder.

All direct `jsthermalcomfort` imports must stay inside `src/declarations/**`, remaining `src/engines/comfort/**`, or `src/charts/psychrometric/humidity.ts` (humidity ratio only). Model `label`/`description` come from string `library.label` / `library.description` (JS `@docname` / leading JSDoc). Prefer calling a JS export (`humidex.mapping`, UTCI `mapping`, Heat Index `mapping`, `pmv_ppd_ashrae.tsv` / `compliance` / `COMPLIANCE_LIMIT`, `pmv_ppd_iso.tsv`, adaptive `offsets` / `t_running_mean_limits`, `get_ce`, `v_relative`, `phs.RECTAL_TEMPERATURE_LIMIT` / water-loss fractions) over copying thresholds or classifiers. Catalog never imports `jsthermalcomfort`. Classifier edges come from JS `mapping.bins` / `compliance.bounds`. Comfort Tool maps library labels (or, when JS has no label, library ids / result field names) to `ZoneToken`; it does not invent classifier copy. `NumericBand` membership follows digitize closedness (`minInclusive` / `maxInclusive`). Explore defaults copy that model's Standard/Python classifier. PPD 10% is an Explore chart preset, not a library classifier. Wind Chill has no Python category field, so it has no default frostbite bands; WCT is the library result with no local applicability gate. EN Adaptive outdoor chart 10–30 °C is an axis, not `adaptive_en.t_running_mean_limits`.

- Do not add new direct `jsthermalcomfort` imports in `src/state/**`, `src/ui/components/**`, `src/ui/routes/**`, or top-level `src/engines/*.ts`. `src/charts/psychrometric/humidity.ts` may import `psy_ta_rh` for humidity ratio only; isolines and assemble must not import `jsthermalcomfort`.
- When touching shared helpers, prefer moving reusable **figure geometry** under `src/charts/` rather than adding more `engines/comfort/charts/` files. Leftover comfort logic may still land under `src/engines/comfort/**` until that layer is removed.

## Physical Quantity Rules

- `src/catalog/quantities.ts` is the **closed quantity catalog** for natural-world inputs and outputs. TypeScript keys are PascalCase physical names; wire strings match jsthermalcomfort parameter or result fields (`tdb`, `t_running_mean`, `hi`, …). Models select ids; they do not own, extend, or invent them. Catalog rows are not classified by occupancy, modifier ownership, or chart-axis role. Each Compare slot stores one sparse `QuantityState` (`Partial<Record<PhysicalQuantityId, number>>`). Humidity quantities (`rh`, `hr`, `t_dp`, `t_wb`, `p_vap`) may set `category: Humidity`. `derivedHumidityQuantityIds` (`t_dp`, `hr`, `t_wb`, `p_vap`) are psychrometric slots derived from `tdb`+`rh`; they may live in the memory bag but share serialize omits them and decode re-derives them. `DerivedSlotQuantityState` lives next to psychrometric derivation. Modifier extra inputs come from `inputModifierCatalogue[].extraInputs` with SI ranges on `modifierExtraInputRangeSi`. PHS weight/height are catalog ids in the same bag (`phsPersonQuantityIds` / `phsPersonRangeSi`); they stay off the Analysis `inputFields` panel. Unknown ChartTypes, duplicate ChartType on one model, derived-humidity or modifier-extra `kind: "quantity"` fields, or a Time-series table without Time-series capability fail `defineModel` / `assembleCatalogs` (`validateModel`). There is no `validate.model` hook. There is no `ModelOutputKey`. Quantity meta has `label`, `siUnit`, optional `step` (default 0.1), and optional `category`. SI/IP pairing is `ipUnitForSi` plus `unitLabel(siUnit, unitSystem)` in `src/catalog/units.ts`. Ranges and defaults live on models (`inputFields` min/max, chart `rangeSi`), not the catalog. Visible numbers use `formatDisplayValue` (max two decimal places, strip trailing zeros). Conversion does not round.
- Models select catalog ids via `inputFields` (Analysis panel), `defineLibraryQuantityMapping` (request/result fields, including PHS `weight`/`height`), and charts/tables/`exploreOutputs`. There is no `extraQuantities` / `PrimaryQuantityId` / `primaryInputOrder`. PHS weight/height stay off the point-session input panel.
- All quantity conversion (fields, modifiers, extras, chart axes) reads closed catalog `siUnit` in `src/engines/units/` via `convertQuantityFromSi`. Display labels live on `siUnitLabel` / `ipUnitLabel` in `src/catalog/units.ts`, not on quantity meta. Control widgets stay generic and must not branch on quantity-id lists, `if (model === Phs)`, or PHS quantity ids. Canonical state remains SI. `siUnit` is the storage unit (for example `kg/kg`, `Pa`, `kg`, `m`, `degC`); SI/IP display labels such as g/kg and kPa come from the unit tables. New unit dimensions are frontend catalog work (`SiUnit` plus `ipUnitForSi` plus a converter), not declaration-only work.
- Request short names (`tdb`, `vr`, `rh`, …) are allowed only at the `jsthermalcomfort` boundary. Each model's `defineLibraryQuantityMapping()` table is the sole catalog↔library name connection (JS field ↔ `PhysicalQuantityId`, direction-agnostic: `toLibrary` / `fromLibrary` / axis get-set). Simple models keep that mapping in the declaration file (`heatIndex.ts`, `humidex.ts`, `windChill.ts`); larger families keep it in `calculation.ts`. Application request and chart-source types do not use a `Dto` suffix (`PmvRequest`, `ModelChartSource`, …). Cross-layer chart-source types live in `src/catalog/chartSource.ts`. Generic chart figure inputs live in `src/charts/types.ts`.
- `quantitiesByInput` stores base primary SI before modifiers; `effectiveQuantitiesByInput` in `ModelCalculationContext` is what calculations and request mapping read.
- Calculate each model once into `calculationCacheByModel`; chart builders read `resultsByInput` and `chartSource` from that cache. Presentation-only changes (mode, axes, bands) must rebuild charts without invalidating ready caches.
- Golden regression fixtures live in `src/testSupport/goldenFixtures.ts`. Compare/coverage golden **values** are derived from each registered model's `inputFields` plus the shared `standardPrimaryFixture`. Explicit SI overrides exist only when that fixture is outside a declared range — do not invent values from min/max. Required control IDs and primary quantities are independently authored in `src/testSupport/requiredModelControls.ts` and pinned in focused model tests; do not derive that expected side from `inputFields`. Known-value calculation snapshots stay explicit numbers. Golden fixtures live in `goldenFixtures.ts`; there is no per-model golden-input switch.
- Every point-session model must pass `assertCompareContract` in `src/testSupport/assertCompareContract.ts`: 1/2/3 visible inputs, filled table columns, chart markers, and a baseline change that does not invalidate a ready cache. Three inputs must not fail silently. Golden values for that helper come from the registry, not a per-model switch. Focused model tests must pin required control IDs against `requiredModelControls.ts` so dropping a required field cannot stay green.
- ESLint restricted wire literals in `eslint.config.js` must stay aligned with every `PhysicalQuantityId` wire; `src/catalog/catalogWireIds.test.ts` guards that sync.

## Conversion Ownership

- Canonical state remains unrounded SI float.
- All unit conversion should live in one conversion module family under `src/engines/units/`.
- Quantity SI ↔ display conversion reads `siUnit` from the closed quantity catalog (`convertQuantityFromSi` / `convertQuantityToSi`). Conversion does not round.
- Visible numbers use `formatDisplayValue` (max two decimal places, strip trailing zeros). Input commit uses `roundToDisplay` then converts to SI. Isoline geometry and `calculate` stay full precision.
- Do not scatter new temperature, speed, humidity-ratio, or vapor-pressure conversions across components or state helpers.

## State Rules

The point session uses generic keyed structures. New work must preserve that shape rather than adding parallel model-specific state.

Current risks to avoid extending:

- separate model-specific selected-chart fields at the top level
- separate model-specific result buckets at the top level
- separate chart result slots such as `psychrometricChart`, `relativeHumidityChart`, `utciStressChart`, and `utciTemperatureChart`
- separate derived per-input maps that grow one field at a time without a broader structure

Preferred direction for refactors and new model work:

- Compare, unit system, options, and modifiers live in point-session `input` (`quantitiesByInput` is one sparse SI bag per Compare slot)
- chart type, axes, baseline, and Explore bands live in `chart`
- path identity (`selectedModel`, `activeSurface`, `allowedModelIds`, `pendingModelSwitch`) lives in `setting` and is not shared
- calculation cache belongs to the output bucket but is stored as `$state.raw` on the class (not a getter into `output`)
- writes go through `session.actions.*`; tests must not assign `setting.selectedModel` or quantities in a way that skips invalidate
- `inputPanel` / `chartBuild` / `chartControls` are `$derived` view-model projections, not a second store; pages must not dig SI buckets
- the registry is `src/state/modelRegistry/`, shared by both sessions and not session state

When touching `src/state/pointSession/types.ts`, `src/state/pointSession/createPointSession.svelte.ts`, `src/state/pointSession/shareState.ts`, or `src/state/modelRegistry/**`, prefer extracting keyed records and generic helpers instead of copying another PMV/UTCI-specific property or branch.

## Model Extension Strategy

New models are added through `defineModel` registration, not by hardcoding another session slice. Model definitions live in `src/declarations/**`; `defineModel` and the registry live in `src/state/modelRegistry/**`. Copy a full `defineModel` declaration (`heatIndex.ts` is the template; see [docs/adding-a-model.md](docs/adding-a-model.md)). After registration, `assertCompareContract` must pass for the new point-session model.

Each registered model has one focused declaration entry that exposes its product decisions. This is not a one-physical-file rule: stable IDs remain centralized, registration remains explicit, and tests remain separate. Simple models may keep their implementation in the declaration file; larger standard families may use focused calculation/chart modules beside complete standard declarations.

A model definition should own:

- stable `id` and label metadata
- input controls, option handlers, complete defaults, and an exact parser
- request mapping and derived-input synchronization hooks
- calculation execution
- result builders, chart definitions/builders, and dynamic-axis defaults
- declaration-local comfort zone definitions (as `ThermalZone` instances — see below), used to derive bands but not stored on the runtime definition
- `surfaceCapabilities`, `exploreOutputs`, and an optional fixed `complianceProfile`
- supported input modifiers, using an explicit empty list when none apply

Use centralized constants and typed metadata from `src/catalog/` for:

- model identifiers (`ModelId` in `src/catalog/modelIds.ts`)
- quantity identifiers (`PhysicalQuantityId`). TypeScript keys are PascalCase physical names; wire strings match jsthermalcomfort fields. All ids live in `src/catalog/quantities.ts`. Models select ids via `inputFields`, `defineLibraryQuantityMapping`, charts, and tables; they do not contribute quantity metadata. Charts pick the same ids via per-model `axisFields` / `axes`.
- chart types (`ChartType` in `src/catalog/chartTypes.ts` is the closed product set). Dropdown labels are `chartTypeLabel[type]` (Heat Loss, Body Temperature, SET). `defineModel` and family modules use `FrontendChartDeclaration` with `type: ChartType`; spec must match that type. There is no ModelId allowlist. Figure assemble in `src/charts/` takes generic arrays and must not import models or quantities. Psychrometric humidity curves and CBE isoline polygons live in `src/charts/psychrometric/`; those helpers take `evaluate(T, RH)` and humidity-ratio callbacks, not `ModelId` or `PhysicalQuantityId`. Charts are `type` + data spec; session/share select `selectedChartType` (`instanceId` equals the ChartType). One model registers each ChartType at most once. Heat Index / Humidex use a single Dynamic chart. Psychrometric is a ChartType currently used by PMV ASHRAE/ISO. Keep the eight ChartType product names.
- compare-input identifiers
- chart modes and model-output identifiers
- modifier identifiers (`ModifierId`, modifier `PhysicalQuantityId` slots)
- zone tokens (`ZoneToken` in `src/catalog/zoneTokens.ts`). Models select tokens; screen, publication, and colour-blind hex live in that table. `src/charts/draw.ts` remaps zone fills for print and colour-blind palettes. Sweeping leftover series/marker hex is not required.

Stable IDs for those concepts come from `src/catalog/` only. Chart selection is `ChartType`; `instanceId` equals that type and is not authored.

## Capability Declarations And Runtime Architecture

- Product surfaces are Standard, Explore, and Time-series (`SurfaceId` in `src/catalog/surfaces.ts`). Point session (`PointSession` in `src/state/pointSession/createPointSession.svelte.ts`) serves Standard+Explore. Time-series is a separate session.
- Every model declaration must set `surfaceCapabilities` and `exploreOutputs`; Standard-capable models must also set `complianceProfile` with non-empty bands, a caption, legend title, and result feedback callback. Assemble with `defineModel`. Family modules (PMV, Adaptive) may still use `ComfortModelBuilder` internally. The session does not branch on model id.
- Explore/compliance output keys are `PhysicalQuantityId`. Capability types, surface/profile metadata, `bandsFromThermalZones()`, and `numericBandFromToken()` live in `src/catalog/modelCapabilities.ts`. Reuse them instead of inline strings or copied zone thresholds.
- `outputSettingsByModel` stores each model's x/y axes, baseline, and optional Explore working state. Explore z comes from `exploreOutputs`, and editable numeric bands are cloned from `defaultBands`; Standard workspace output and bands always come directly from `complianceProfile`.
- `quantitiesByInput` is one sparse SI bag per Compare slot. Share serializes that bag minus derived humidity. Path identity (`selectedModel`) is not in the URL.
- Every model owns chart output through `defineModel` `charts` (`type: ChartType`) or family `ComfortModelBuilder.setCharts()`. `defineModel` may use any ChartType whose spec matches. Tables are declared with `tables: { results, timeSeries? }` as row arrays (quantity id, `{ quantity }`, or custom `{ id, label, format }`). There is no `TableType` catalog. Every point-session model must declare non-empty `tables.results` (or omit it to default one column per `exploreOutputs`). PHS also declares `tables.timeSeries` plus `simulation.charts` for Body Temperature / Water Loss. Time-series surface membership is that slot (`getModelsForSurface(TimeSeries)`). `instanceId` equals the ChartType; the registry lists declared types (`getDeclaredChartInstanceIds`). Derived-humidity or modifier-extra `kind: "quantity"` fields, unknown ChartTypes, duplicate ChartType on one model, or a Time-series table without Time-series capability fail `defineModel` / `assembleCatalogs`. Do not paste `chartTypeCapabilities` copies; leave meaningful overrides (Wind Chill `locksYAxis`). Presentation instances do not carry bind spec. Dropdown text is `chartTypeLabel[type]`. Heat Index / Humidex declare one Dynamic chart. Psychrometric is a ChartType currently used by PMV ASHRAE/ISO. Heat-loss vs temperature and SET series builders live in `heatLossSeries.ts` / `setSeries.ts`. PMV Analysis tables include SET, cooling effect, relative air speed, and dynamic clothing as Compare-matrix rows. Explore still colours PMV and PPD; do not add a SET explore output key. UTCI lives in `utci/utci.ts`. PHS binds live in `phs/charts.ts`. Dynamic / Psychrometric / Utci / Adaptive specs must not include `spec.build`; Heat Loss / SET keep `getGeometry`.
- 2-D Dynamic charts fill bands with isoline polygons from `src/charts/isolines.ts` (121 sweep points, scan-then-bisect to ~0.001 °C, skip missing roots, no vertex `toFixed(3)`). Hover is Plotly closest on Compare markers and data lines (`hovertemplate` / `customdata`); fills skip. 2-D field drop-point hover is a single Plotly probe scatter plus declaration `evaluate` on `ChartBuildResult.hoverProbe` (not `ChartPayload`; publication figures omit the probe). The probe follows the pointer and does not snap to Compare markers. Do not add a 100² hover grid. UTCI 1-D stress may keep high sampling along one axis (for example 450 x-points). `src/charts/draw.ts` clones Plotly-owned data arrays (`x`, `y`, `z`, `text`) and nested records Plotly mutates, applies axis lines/ticks via `layout.template`, and maps non-finite grid `z` to `null` locally. Do not `JSON.parse(JSON.stringify(figure))`. Screen and publication figures share `src/charts/chartTheme.ts`. Export builds a separate publication figure (explicit mm/pt/dpi, PNG ~300 DPI equivalent, SVG of the same geometry, no mode bar) and must not `downloadImage` the on-screen DOM. Publication widths are journal single- and double-column profiles on that same theme; Compare legends stay readable at both widths. Zone fills remap through `src/catalog/zoneTokens.ts` (models select tokens; print and colour-blind updates happen in that table).
- Standard workspace models must provide `complianceProfile.legendTitle` in addition to fixed output, bands, caption, and feedback. Explore legends come from the selected `ModelOutput` via `ChartBuildResult.legend`.
- `setInputFields()` / `defineModel` `inputFields` declare visible inputs as quantities with required SI `minValue`/`maxValue` (optional `widget`); a naked quantity id is not enough. `resolveInputField()` infers widgets from `defaultFieldWidgetByQuantity`. Assembled runtime definitions keep `inputFields` so tests can derive Compare golden values from the registry. Required control IDs are independently authored and pinned in focused model tests; do not derive that expected side from `inputFields`. Model `optionHandlersByKey` is the sole option-change path. Models must provide complete defaults and exact parsers; invalid internal options are invariants, not occasions to fill defaults. `kind: "quantity"` fields must be catalog ids that are not derived humidity or modifier extras. PHS weight/height stay off the point-session input panel. Chart axes must declare `rangeSi` (`createFieldAxisScale`); input-field ranges inject into Dynamic charts, and chart-only axes such as `t_o` belong on the chart spec. Control metadata is read from the closed catalog at view-model time. Point-session input-panel UI is presentational, matching chart controls: `buildInputPanelViewModel` in `src/state/pointSession/inputPresentation.ts` projects tool controls, Compare toggles, field rows, clothing-builder bindings, and modifiers. Components receive `InputPanelViewModel`, not the session class, and do not implement conversion, clamp, or modifier-draft merge.
- Use `defineLibraryQuantityMapping()` for a per-model JS-name ↔ catalog-quantity table (`toLibrary` / `fromLibrary` / axis get-set). Include 1:1 result fields in the same table. Aggregates and classifiers stay outside the map.
- Compose `createRequestAxisAdapter()` for chart-only aliases and explicit Operative Temperature behavior; keep coupled temperature solving in the shared dynamic-axis solver.
- Mode, axis, baseline, Explore output, band, and chart changes are presentation-only. They must rebuild from a ready cache without invalidating or scheduling calculations.
- Share snapshots retain strict `version: 1`, store chart settings inside each model snapshot, serialize sparse `quantitiesByInput` (known `PhysicalQuantityId` keys; reject derived humidity), `activeModifiersByInput`, Compare/unit-system/options, and serialize only Explore working bands plus exact modifier state, and use explicit wire sentinels for unbounded numeric edges. The `models` map is sparse: default model slices are omitted, missing known keys seed defaults, and unknown keys are rejected. Adding a model must not require every existing URL to list that model. The codec accepts only that v1 field set. Path identity (`selectedModel`, surface) is not in the query.
- Band assignment is array-ordered. Membership follows each `NumericBand`'s `minInclusive` / `maxInclusive` (JS digitize closedness; default `[min, max)`). Numeric values, functional-edge X values, and band inputs are canonical SI.
- PMV ASHRAE and PMV ISO are separate registered models with explicit serialized IDs (`"pmv-ashrae"` and `"pmv-iso"`) and declaration files (`ashrae.ts` and `iso.ts`). ISO is explicitly ISO 7730 Category B; its Neutral range intentionally matches ASHRAE numerically, while each declaration derives an independent band array from JS `tsv.bins` / `compliance.bounds`. `shared.ts` owns shared contracts, inputs, options, and the `defineModel` chart array. `calculation.ts` owns formulas/results. `zones.ts` owns token maps. Heat-loss vs temperature and SET `ParametricLine` series live in `heatLossSeries.ts` and `setSeries.ts`. Psychrometric and Dynamic are ChartType engines (`PsychrometricDataSpec` / `DynamicFieldGridSpec`); declarations pass evaluate/bands/isoline targets, not Plotly `build()`. PMV Analysis tables include SET, cooling effect, relative air speed, and dynamic clothing; Explore outputs remain PMV and PPD. Adaptive uses `shared.ts` + `calculation.ts` (BoundaryRegion data spec). UTCI is `utci/utci.ts`. PHS uses `phs.ts` plus `calculation.ts`, `charts.ts`, `timeSeries.ts`, `timeSeries.worker.ts`, and `timeSeriesCharts.ts`. Do not merge standards behind a runtime toggle.
- `ModifierId`, `PhysicalQuantityId` modifier slots, and the tuple-generic `InputModifier` contract live in `src/catalog/inputModifiers.ts` and `src/catalog/quantities.ts`; do not inline modifier strings.
- Builder `.setModifiers()` / `defineModel` `modifiers` receive executable model-owned declarations. The global catalogue contains only stable UI/share IDs and extra-input schema.
- Modifier execution order is Measured Air Speed → Morning Clothing Estimate → Dynamic Clothing → Solar Gain. PMV ASHRAE and PMV ISO each bind Dynamic Clothing to their own standard; other models do not declare it.
- Input sub-tools keep base SI input separate from modifier configuration. Each model declares its supported subset in the fixed global order, and the session derives effective SI input through those executable definitions before supplying `ModelCalculationContext` (`effectiveQuantitiesByInput`, `options`); modifiers must never write effective values back to base state.
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

Use the generic `ModelCalculationCache<R, C>` type for all model caches. Named per-model cache types (`PmvCalculationCache`, etc.) are not used. The session stores caches as `Record<ModelIdType, ModelCalculationCache<unknown, unknown>>` and does not need to know what `R` and `C` are.

## Branching And Duplication

Avoid repeated model-mode branching across files such as:

- `src/declarations/pmv/` (`ashrae.ts`, `iso.ts`, `shared.ts`, and focused calculation/chart modules)
- `src/declarations/adaptive/` (`ashrae.ts`, `en.ts`, `shared.ts`, and focused calculation/chart modules)
- `src/ui/components/input-panel/` (presentational; field/option branching belongs in control behaviors and `inputPresentation.ts`)
- share/import-export synchronization paths

Do not add more repeated `if/else` chains per mode if a config table, model descriptor, or shared helper can express the rule once.

Component helpers should not become hidden domain engines. If a helper is deciding labels, units, display values, ranges, steps, and derivations based on multiple modes, that logic likely belongs in metadata or an engine adapter.

Barrel files exist only when they provide a real stable public API boundary.

## UI Rules

- Prefer Flowbite Svelte components first.
- Prefer Tailwind utilities for layout, spacing, typography, and state styling.
- Add handwritten CSS only when there is a clear need.
- Preserve the current UI language unless a task explicitly asks for a redesign.
- Components should remain presentational or interaction-focused.
- Point-session input-panel components consume `InputPanelViewModel` the same way chart controls consume `ChartControlsViewModel`. Those components do not implement formulas, unit conversion, display-range clamp, or modifier-draft merge.
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
- model or chart additions do not expand the session with more hardcoded parallel properties unless explicitly approved
- module boundaries remain clear
- architecture docs in `docs/architecture.md` still describe the live tree

## Output Registry

Workspace membership is `SurfaceId` in `src/catalog/surfaces.ts` (Standard, Explore, Time-series). Point session serves Standard+Explore; Time-series is a separate session. Canonical app URLs are lowercase kebab-case. Standard calculation routes are `/standard/{standard}/{model}/` (for example `/standard/ashrae-55/pmv-ashrae/`). Explore is `/explore/{model}/`. Time-series is `/time-series/{model}/`. Mixed-case and surface-only aliases replace-redirect to that path. Closed catalogs are quantities (`src/catalog/quantities.ts`, inputs and outputs) and ChartType (`src/catalog/chartTypes.ts`). Table row types live in `src/catalog/tableTypes.ts` with no TableType enum. Every point-session model declares `tables.results`. PHS also declares `tables.timeSeries`. Native Plotly recipes live in `src/charts/`. Chart selection is `ChartType` (`selectedChartType`; `instanceId` equals the type). ASHRAE and ISO PMV register Heat Loss and SET charts. Field-chart profile metadata lives in `src/catalog/fieldChartProfile.ts`.

Share transport is UTF-8 JSON → Base64URL → `?state=`. Pathname is surface + standard + model identity. The query encodes **input + chart only** (`ShareStateSnapshot` v1): sparse quantities, options, modifiers, Compare, unit system, and per-model chart settings. `output`, `selectedModel`, `activeSurface`, `allowedModelIds`, `pendingModelSwitch`, derived humidity keys, and Time-series are not in the URL. UI copies a link via `session.actions.exportShareUrl()`; the codec does not belong in components. View-models (`inputPanel`, `chartBuild`, `chartControls`, …) are `$derived` projections from the session buckets, not a second store. The model registry lives in `src/state/modelRegistry/`, not inside either session.

`ChartBuildResult` (including legend view-models) and Time-series `simulation.charts` declarations live in `src/engines/comfort/charts/` (`chartBuildResult.ts`, `simulationCharts.ts`). Time-series editor and Plotly-typed chart view models live in `src/state/timeSeries/viewModels.ts`; pure Time-series declaration contracts stay in `src/catalog/timeSeries.ts`. Site shell branding/links live in `src/ui/components/siteShellConfig.ts`.

Runtime models expose `buildTable()` and `buildChart()` through `src/state/modelRegistry/`. Shared table assembly helpers live in `src/engines/comfort/output/`. Time-series exposure summaries render through `src/ui/components/output/MetricSummaryPanel.svelte`.

Share snapshots store `selectedChartType` per model. That value must be a ChartType the model declared.

## Documentation

- Keep this file focused on execution rules for the live tree. Architecture is [docs/architecture.md](docs/architecture.md).
- If a task materially changes state flow, model registration, layer boundaries, or figure ownership, update this file, `CLAUDE.md`, and `docs/` in the same work.
- Authoring a model: [docs/adding-a-model.md](docs/adding-a-model.md). Copy `heatIndex.ts` (one file, three zones), add a `ModelId` member, register once. Hard stops: new ChartType, new `PhysicalQuantityId` (and `SiUnit` if a new dimension), new modifier, new Time-series session. ChartType isoline roots are solved in `src/charts/`, not in a declaration. `label`/`description` come from JS string `label`/`description`; input widgets from the quantity catalog; classifier edges from JS `bins`; when JS has no label, use the library id / field name. Do not write `spec.build` or chart instance ids. Every `inputFields` entry must declare SI min/max; chart axes must declare `rangeSi`.
- Internal docs stay in `docs/` Markdown. They are not generated, not a deployment step, and not a product UI route.

## Code Quality

- Code should be high quality, easy to read, maintainable over time, and suitable for collaborative development by multiple contributors.
