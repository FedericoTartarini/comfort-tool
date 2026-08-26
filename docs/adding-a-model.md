# Adding a model

Internal authoring guide. Files under `docs/` are maintained in git. They are
not generated, not linked from the product UI, and not part of the production
build.

A Heat Index–class model is three edits: copy
[`src/comfortModels/heatIndex.ts`](../src/comfortModels/heatIndex.ts) as a full
`defineModel` declaration, add one `ModelId` member (the live model-id
constant), and register once. Do not add `defineIndexModel()`, restore
`src/comfortModels/presets/`, or put Plotly in the declaration.

UI, share, Compare, and the Analysis controller must not grow a branch on the
new model id. Analysis input rows, Compare toggles, and modifiers render from
`getInputPanelViewModel` (`src/state/analysis/inputPresentation.ts`). Do not
edit `src/components/input-panel/` for a new model.

Target architecture is [ARCHITECTURE-PLAN.md](../ARCHITECTURE-PLAN.md).
Execution rules are in [AGENTS.md](../AGENTS.md). Do not implement from
`26-06-29-architecture-brief.md`. Plan §4 folder names (`catalog/`, `declarations/`) are not the live tree.
Analysis state lives at `src/state/analysis/`.

## Recipe

1. **Copy** `src/comfortModels/heatIndex.ts` to a new file under
   `src/comfortModels/`. Keep a complete `defineModel` object: `inputFields`,
   zones, `calculate`, `tables.analysis`, and `charts`. For air
   temperature plus wind, copy `windChill.ts` instead. Humidex is the other
   tdb+rh sibling.
2. **Add the model id** to `ModelId` in `src/models/modelIds.ts`.
   Wire values follow existing members (`"heat-index"`, `"humidex"`, …).
   Do not invent a second id tree.
3. **Register once** in `src/state/analysis/modelConfigs/index.ts`: import
   the config and add one `comfortModelConfigs` entry. The registry type is
   `Record<ModelId, RuntimeComfortModelDefinition>`.

Then, only if the model actually needs them:

- a new `ModelOutputKey` plus presentation in
  `src/services/units/modelOutputs.ts`
- `quantities.extend` for model-scoped SI inputs (not a new primary)
- focused tests beside the declaration. Pin required Analysis control IDs
  there against the independently authored lists in
  `src/testSupport/requiredModelControls.ts` — do not derive the expected
  side from `inputFields`. Compare golden **values** are derived from the
  registry (`inputFields` + `standardPrimaryFixture`); add an explicit SI
  override in `src/testSupport/goldenFixtures.ts` only if the fixture is
  outside the new model's declared range. Do not invent values from min/max
  or catalog `defaultSi`, and do not add a per-model golden-input switch.

PMV and Adaptive stay family modules (one declaration per standard, shared
calculation/chart core). Those are not presets. They may still assemble with
`ComfortModelBuilder` internally. Do not merge ASHRAE/ISO or ASHRAE/EN behind
a runtime toggle. PMV Analysis tables include SET, cooling effect, relative
air speed, and dynamic clothing; Explore still colours PMV and PPD. ASHRAE
and ISO each register ParametricLine heat-loss and SET chart instances.

## Hard stops (frontend first)

A declaration must not do any of the following. They are frontend catalog
work, not “add a model” work:

| Stop                                  | Why                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| New chart engine (`ChartEngine` member) | Closed engine set. `ParametricLine` is implemented (polylines and optional limit bands). Do not add a new engine from a declaration. |
| New `primaryInputOrder` key           | Shared persisted primaries. Also requires ESLint restricted-wire alignment (`src/models/catalogWireIds.test.ts`).                    |
| New modifier                          | Global catalogue, execution order, and share schema.                                                                                 |
| New Time-series controller            | Time-series is PHS only. Declaring `tables.timeSeries` does not create a simulator.                                                  |
| New SI unit dimension (`SiUnit`)      | Conversion keys live in the frontend catalog. Add `SiUnit` plus a converter in `src/services/units/`; declarations only select known units. |

Also forbidden in a declaration:

- `ChartEngine.Custom` / `spec.build` / Plotly imports (`defineModel` is data-only)
- `spec: unknown`
- a parallel `ChartInstanceId` tree
- a third `TableType`
- a `jsthermalcomfort` import outside `src/comfortModels/**` or
  `src/services/comfort/**`
- UI, route, or controller `if (model === …)` branches
- writing modifier output back onto base `quantitiesByInput`

Globe temperature, local discomfort, and CBE-style CSV exceedance are tools
or a separate product surface, not new `ModelId` entries.

## Current tree

```text
src/
  App.svelte
  comfortModels/     one declaration entry per registered model; family
                     folders for PMV, Adaptive, UTCI, PHS
  components/        rendering and interaction; no model-id branches;
                     site shell branding/links (`siteShellConfig.ts`)
  models/            system quantity seed, ModelId, ChartEngine, TableType,
                     modifiers, workspace ids, zone tokens;
                     Time-series declaration contracts (`timeSeries.ts`)
  routes/            client router
  services/
    comfort/         adapters, engines, modifiers, psychrometrics, table assembly;
                     ChartBuildResult and simulation chart declarations
    units/           SI ↔ display conversion
    chartTheme.ts    Screen and publication chart theme (mm/pt/dpi, single/double column; zone palettes applied here)
    plotlyTypes.ts   Plotly-compatible, theme-ready adapter types (PlotlyChartSpec)
    plotlyFigure.ts  Plotly adapter (clone boundary; screen vs publication theme)
    plotlyExport.ts  Publication PNG/SVG from a dedicated figure
  state/
    analysis/        Analysis controller, defineModel, registry, share codec,
                     pure projections (chartPresentation, inputPresentation)
    timeSeries/      separate PHS Time-series controller; editor/chart view models
    workspace/       route / model / mode coordination
  views/             page composition
  testSupport/       Compare helper; golden inputs/control counts from the registry
```

Import lanes: `views` → `components`, `state`; `components` → `state`,
`models`, lightweight `services`; `state` → `models`, `services` (the
registry is the exception that imports `comfortModels`); `comfortModels` →
`models`, `services`, `state/analysis/modelConfigs`; `services` → `models`.

Canonical state is SI. Calculations run in SI. Display converts through
`src/services/units/` by reading assembled catalog SI units
(`convertQuantityFromSi`). Control widgets stay generic.

`App.svelte` constructs one Analysis controller
(`createAnalysisState`) and one Time-series controller. Dashboard routes
share Analysis SI input, per-model chart memory, and calculation caches.
Time-series does not read or schedule Analysis.

## Catalogs the declaration may use or contribute to

Runtime catalogs assemble once from frontend seeds plus every registered
declaration. Duplicate ids, wrong owners, unknown engines, or a Time-series
table without Time-series capability fail `defineModel` / registry assemble.
Assembled catalogs expose optional `assembledCatalogs.validate.model` for
those checks. The type is optional; `assembleCatalogs` installs the hook on
the returned instance. It is not a second authoring API — still copy
`heatIndex.ts`, add a `ModelId` member, and register once.
`assembleCatalogs` merges each model's `quantities.extend` with the system
seed, so duplicate extend ids fail assemble without a pre-merged quantity map.

**Quantities.** `src/models/quantities.ts` is the system seed.
`primaryInputOrder` is the exact persisted primary-key set. Chart-only and
derived ids stay in the catalog but never enter primary records. A
declaration may contribute model-scoped extensions:

```ts
quantities: {
  extend: [{
    id: "example-body-mass",
    owner: ModelId.Example,
    scope: PhysicalQuantityScope.Model,
    /* SI label, units, default, min, max */
  }],
}
```

Extensions serialize only under sparse `modelInputsByModel`. They must not
enter `primaryInputOrder`. Surface them on the Analysis panel with
`{ kind: "modelQuantity", … }`. Assemble checks that every `modelQuantity`
field is an extend entry owned by that declaration. PHS body weight/height
are the existing example; all quantity conversion reads catalog SI units
(`display.units.SI`) and must not branch on PHS or quantity-id lists.
`display.units.SI` is canonical storage (`kg`, `m`, `kg/kg`, `Pa`, …);
display labels such as g/kg live in `display.displayUnits`. Unknown SI units
fail assemble.

**Charts.** Closed engines: `ChartEngine.DynamicField`, `BoundaryRegion`,
`ParametricLine`, `BandScalar`, `TimeSeriesLine`, and frontend-only `Custom`
(PMV psychrometric geometry). `defineModel` `charts` is a data-only
`ModelChartDeclaration` union discriminated on `engine:` over the non-Custom
engines. Optional `type`
names an extended type on that same engine; assemble preserves it and rejects
empty or duplicate types. Chart ids live only on the declaration
(`id`); the registry derives them (`getDeclaredChartInstanceIds`).
Heat Index / Humidex fixed-axis maps are `ChartEngine.DynamicField` with
`lockedAxes`, not `Custom`. `ParametricLine` interchange is polylines and
optional limit bands (heat-loss vs temperature and SET series builders live
beside the PMV family; ASHRAE and ISO declarations each register those
instances).
Interactive Dynamic 2-D grids are capped near 100² by the engine
(`INTERACTIVE_DYNAMIC_GRID_POINTS`); do not pass 300 or 450. BandScalar
1-D sampling may stay high (for example UTCI stress at 450 x-points).
Hover overlays use display `z` for the primary output and must not attach
a per-cell `customdata` matrix unless extra hover fields exist. The Plotly
adapter (`src/services/plotlyFigure.ts`) clones Plotly-owned `x`/`y`/`z`/`text`
arrays and nested records Plotly mutates, and converts non-finite grid `z`
cells to `null` gaps. Do not `JSON.parse(JSON.stringify(figure))` a dense
field. Screen and publication figures share `src/services/chartTheme.ts`.
Export builds a separate publication figure (PNG ~300 DPI equivalent, SVG of
the same geometry, no mode bar) and must not capture the on-screen plot.
Publication widths are journal single- and double-column profiles on that
same theme; Compare legends stay readable at both widths. Models select
`ZoneToken` values; screen, publication, and colour-blind fills live in
`src/models/zoneTokens.ts` and remap at `toPlotlyFigure`.

**Tables.** `tables.analysis` (`TableType.Analysis`) is required for every
Analysis model. `tables.timeSeries` (`TableType.TimeSeries`) is allowed only
with Time-series workspace capability (PHS). Declaring that table does not
create a simulator; `src/state/timeSeries/modelConfigs.ts` reads the PHS
declaration for membership. PHS Time-series line charts are declared on
`simulation.charts`. PMV ASHRAE and ISO Analysis tables include SET, cooling
effect, relative air speed, and dynamic clothing as Compare-matrix rows.
Do not add SET as an `exploreOutputs` key unless Explore must colour SET.
Do not add local discomfort as a table type. ASHRAE and ISO already register
ParametricLine heat-loss and SET chart instances; copy that pattern rather
than merging standards behind a runtime flag.

## What the declaration must show

Use `defineModel<Result, ChartSource, ComplianceBand = NumericBand>({ … })`.
Numeric-band models omit the third argument; Adaptive passes `Band`.
`defineModel` erases those generics once into
`RuntimeComfortModelDefinition`.

Visible product decisions:

- `id`, `label`, `description`
- `standardIds` — `[]` when the model is not a Standard model
- `workspaceCapabilities`, `exploreOutputs`
- `complianceProfile` when Standard-capable (fixed output, non-empty bands,
  `caption`, `legendTitle`, feedback callback)
- `inputFields`, complete `defaultOptions`, exact `parseOptions`
  (`parseEmptyOptions` when there are no options)
- `modifiers` in global order, or `[]`
- request mapping + `calculate`
- declaration-local `ThermalZone` values that select a `ZoneToken`; derive
  bands with `bandsFromThermalZones` or `numericBandFromToken`. Colours come
  from `src/models/zoneTokens.ts` (screen / publication / colour-blind).
  Each boundary appears once as zone `min` / `max`. Do not put hex in the
  declaration.
- `charts` with declaration-owned `id`s and
  `defaultChartId` (dedicated/fixed chart first; Dynamic only when
  there is no other chart)
- `tables: { analysis, timeSeries? }`
- `dynamicAxisFields` and `defaultDynamicAxes` when the model has a Dynamic
  chart

Zones generate bands; they are not stored on the runtime definition.

### Inputs, requests, and calculation

Map catalog fields to the library payload with
`createFieldRequestAdapter()` in `src/services/comfort/requestMapping.ts`.
jsthermalcomfort short names (`tdb`, `rh`, `vr`, …) belong only at that
boundary. Copying Heat Index may copy its request type (`HeatIndexRequest`);
do not add a `Dto` suffix on application request or chart-source types.
Plotly-compatible adapter types live in `src/services/plotlyTypes.ts` (`PlotlyChartSpec`, `PlotTrace`, …).

```ts
const fieldAdapter = createFieldRequestAdapter<ExampleRequest>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  rh: PhysicalQuantityId.RelativeHumidity,
});
```

Use `calculatePerInput` with `fieldAdapter.mapRequest` for `calculate`.
Compose `createRequestAxisAdapter()` only for chart-only aliases or explicit
operative-temperature get/set/range. Coupled Air/Radiant/Operative solving
stays in the shared dynamic-axis solver.

`calculate` receives `ModelCalculationContext` with
`effectiveQuantitiesByInput` (modifier-adjusted primary SI), sparse
`auxiliaryQuantitiesByInput`, sparse `modelInputs`, and the active model’s
validated `options`. It must not read raw `quantitiesByInput`.

`inputFields` kinds are resolved in
`src/services/comfort/controls/fieldInputBehaviors.ts`: `numeric`,
`operativeTemperature` / `radiantTemperature`, `occupantAirSpeed` /
`outdoorWindSpeed`, `simpleHumidity` / `advancedHumidity`, `preset`,
`modelQuantity`. The Analysis input panel reads those controls through
`getInputPanelViewModel`; do not add conversion or model branches in
`src/components/input-panel/`. Control widgets stay generic; unit conversion
reads the assembled quantity catalog (`convertQuantityFromSi`). Option changes go only through
`optionHandlersByKey`.
Missing, extra, or invalid options are rejected; invalid internal option
state is an invariant.

### Charts and tables

Reuse `GridModelChartSpec` + `buildGridModelChart()` in
`src/services/comfort/charts/gridModelCharts.ts` for two-axis banded fields.
Presentation-only changes (mode, axes, bands, chart, Explore output, units,
zone visibility) rebuild from a ready calculation cache and must not
schedule calculation.

Standard workspace reads output, bands, caption, legend, and feedback from
`complianceProfile`. Explore uses the selected `exploreOutputs` entry and
editable working bands. Band membership is array-ordered and half-open:
`min <= value < max`.

`ChartEngine.Custom` is frontend-only on PMV ASHRAE/ISO psychrometric charts
via `ComfortModelBuilder`. PMV heat-loss and SET charts are
`ChartEngine.ParametricLine` on those same declarations. UTCI chart specs live
in `src/comfortModels/utci/charts.ts`. PHS chart specs live in
`src/comfortModels/phs/charts.ts`. PHS Analysis exposure history is
`ChartEngine.TimeSeriesLine`.

### Modifiers

`modifiers` receive executable `InputModifier` declarations, not ids. The
global catalogue in `src/models/inputModifiers.ts` holds only UI/share ids
and extra-input schema. Order is fixed:

```text
Measured Air Speed → Morning Clothing Estimate → Dynamic Clothing → Solar Gain
```

Dynamic Clothing is declared only by PMV ASHRAE and PMV ISO, each bound to
that declaration’s standard. Models with none set `modifiers: []`.

### Share

Strict `version: 1`. Serialize `quantitiesByInput`, sparse
`auxiliaryQuantitiesByInput`, sparse `modelInputsByModel`, sparse `models`
(omit default slices), and `activeModifiersByInput`. Missing known model
keys seed defaults; unknown keys are rejected. Adding a model must not
require existing URLs to list that model. There is no migration reader.

## Compare

Every Analysis model must pass `assertCompareContract` in
`src/testSupport/assertCompareContract.ts`: 1, 2, and 3 visible inputs,
filled table columns, chart markers, and a baseline change that keeps a
ready cache. Three inputs must not fail silently. Compare golden values come
from the registered `inputFields` and `standardPrimaryFixture` in
`src/testSupport/goldenFixtures.ts`. If the fixture is outside the new
model's declared range, add an explicit quantity override there — do not
invent one from min/max or catalog `defaultSi`, and do not add a model
switch. Pin known calculation values in the model's tests. Focused model
tests must also pin required control IDs against
`src/testSupport/requiredModelControls.ts` so dropping a required field
(for example Heat Index humidity) fails. Do not derive that expected list
from `inputFields`.

## Tests

Cover known calculation values and half-open zone boundaries; request
mapping; exact option parsing; result rows (including valid falsy values);
modifiers if declared; chart instance ids (non-empty, unique per model,
unique globally — registry assemble already checks this); independently
authored required-control pins; SI/IP presentation; strict share
round-trip; presentation-only actions that keep a ready cache;
`assertCompareContract`.

```bash
npm test
npm run check
npm run lint
npm run build
npm run test:visual
git diff --check
```

Do not update visual baselines unless the model changes visible UI or
charts.
