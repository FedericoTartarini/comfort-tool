# Adding a model

Internal authoring guide. Files under `docs/` are maintained in git. They are
not generated, not linked from the product UI, and not part of the production
build.

A Heat Index–class model is three edits: copy
[`src/declarations/heatIndex.ts`](../src/declarations/heatIndex.ts) as a full
`defineModel` declaration, add one `ModelId` member (the live model-id
constant), and register once. Declarations do not import Plotly.

UI, share, Compare, and the point session must not grow a branch on the
new model id. Input rows, Compare toggles, and modifiers render from
`buildInputPanelViewModel` (`src/state/pointSession/inputPresentation.ts`).
Components under `src/ui/components/input-panel/` stay presentational.

Architecture is [docs/architecture.md](architecture.md). Execution rules are
in [AGENTS.md](../AGENTS.md). Point-session state lives at
`src/state/pointSession/` (`createPointSession.svelte.ts`). The model
registry lives at `src/state/modelRegistry/`. Declarations live at
`src/declarations/`. Catalog lives at `src/catalog/`. ChartType geometry,
assemble, theme, and publication export live at `src/charts/`. Remaining
shared comfort/units live at `src/engines/`.

## Recipe

1. **Copy** `src/declarations/heatIndex.ts` to a new file under
   `src/declarations/`. Keep a complete `defineModel(library, authoring)`
   object with the six sections: Attributes (`id`, `standardIds`,
   `exploreMode`), Inputs, Response (`values` + optional `intervals`),
   Tables (`results` only), Charts, and optional Features. Do not write
   `calculate`, `surfaceCapabilities`, or `tables.timeSeries`. For air
   temperature plus wind, copy `windChill.ts` instead. Humidex is the other
   tdb+rh sibling.
2. **Add the model id** to `ModelId` in `src/catalog/modelIds.ts`.
   Wire values follow existing members (`"heat-index"`, `"humidex"`, …).
   Do not invent a second id tree.
3. **Register once** in `src/state/modelRegistry/index.ts`: import
   the config and add one `comfortModelConfigs` entry. The registry type is
   `Record<ModelId, RuntimeComfortModelDefinition>`.

Then, only if the model actually needs them:

- focused tests beside the declaration. Pin required Analysis control IDs
  there against the independently authored lists in
  `src/testSupport/requiredModelControls.ts` — do not derive the expected
  side from `inputFields`. Compare golden **values** are derived from the
  registry (`inputFields` + `standardPrimaryFixture`); add an explicit SI
  override in `src/testSupport/goldenFixtures.ts` only if the fixture is
  outside the new model's declared range. Do not invent values from min/max,
  and do not add a per-model golden-input switch.

PMV and Adaptive stay family modules (one declaration per standard, shared
calculation/zones/series `_core`). They still call `defineModel(library,
authoring)` from the family helper. ASHRAE and ISO (and ASHRAE/EN Adaptive)
stay separate registered models. Copy Heat Index, not the PMV folder.
PMV Analysis tables include SET, cooling effect, relative
air speed, and dynamic clothing; Explore still colours PMV and PPD. ASHRAE
and ISO each register Heat Loss and SET charts.

## Hard stops (frontend first)

A declaration must not do any of the following. They are frontend catalog
work, not “add a model” work:

| Stop                               | Why                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| New ChartType (`ChartType` member) | Closed product set in `src/catalog/chartTypes.ts`. Do not add a ChartType from a declaration.                                              |
| New `PhysicalQuantityId`           | Closed catalog plus ESLint restricted-wire alignment (`src/catalog/catalogWireIds.test.ts`). Add `SiUnit` + `ipUnitForSi` only if the quantity needs a new dimension. |
| New modifier                       | Global catalogue, execution order, and share schema.                                                                                       |
| New Time-series session            | Time-series is PHS only. Declaring `features.timeSeries` does not create a simulator.                                                       |
| New SI unit dimension (`SiUnit`)   | Conversion keys live in the frontend catalog. Add `SiUnit` plus a converter in `src/engines/units/`; declarations only select known units. |

Also forbidden in a declaration:

- Plotly imports inside a Heat Index–class `defineModel` file (keep a data spec; Plotly assemble stays in `src/charts/`)
- a second ChartType, quantity catalog, or modifier catalog
- a `jsthermalcomfort` import outside `src/declarations/**`,
  `src/engines/comfort/**`, or `src/charts/psychrometric/humidity.ts`
  (humidity ratio only)
- UI, route, or session `if (model === …)` branches
- writing modifier output back onto base `quantitiesByInput`

Chart instance ids equal the ChartType. Session and share select
`selectedChartType`. Do not write chart `id` / `instanceId` in `defineModel`.

Globe temperature, local discomfort, and CBE-style CSV exceedance are tools
or a separate product surface, not new `ModelId` entries.

## Current tree

```text
src/
  App.svelte
  declarations/     Heat Index–class: one file, three zones. Family folders
                     for PMV, Adaptive, PHS (Worker/Time-series). UTCI is
                     `utci/utci.ts`.
  ui/
    components/      rendering and interaction; no model-id branches;
                     site shell branding/links (`siteShellConfig.ts`)
    routes/          client router and page composition
    utils/           UI actions (`clickOutside`)
  catalog/           quantities (inputs and outputs), ModelId, ChartType,
                     modifiers, SurfaceId, zone tokens;
                     Time-series declaration contracts (`timeSeries.ts`);
                     fieldChartProfile.ts, resultSections.ts
  charts/            ChartType figure functions, draw/clone/export (native Plotly);
                     chartTheme.ts, plotlyExport.ts;
                     Psychrometric humidity/isoline helpers in psychrometric/
  engines/
    comfort/         adapters, binds, modifiers, leftover comfort helpers;
                     ChartBuildResult and simulation chart declarations
    units/           SI ↔ display conversion
  state/
    modelRegistry/   defineModel(library, authoring), registered configs
    pointSession/    Standard+Explore session: input/chart/setting/output buckets, actions,
                     $derived view-models, share snapshot/codec/url
    timeSeries/      Time-series session (PHS); editor/chart view models
    app/             route identity, navigation, AppContext
  testSupport/       Compare helper; golden inputs/control counts from the registry
```

Canonical Standard URLs are `/standard/{standard}/{model}/` (for example
`/standard/ashrae-55/pmv-ashrae/`). Explore is `/explore/{model}/`. Time-series is
`/time-series/{model}/`.

Import lanes: `ui/routes` → `ui/components`, `state`; `ui/components` → `state`,
`catalog`, lightweight `engines`; `state` → `catalog`, `engines` (the
registry is the exception that imports `declarations`); `declarations` →
`catalog`, `engines`, `state/modelRegistry`, and `charts/<ChartType>`
geometry helpers (not Plotly assemble); `engines` → `catalog`. `charts`
geometry must not import models, quantities, or declarations. `engines/` is
shrinking; do not add new ChartType geometry there.

Canonical state is SI. Calculations run in SI. Display converts through
`src/engines/units/` by reading closed catalog SI units
(`convertQuantityFromSi`). Control widgets stay generic.

`App.svelte` constructs one point session
(`createPointSession` / `PointSession`) and one Time-series session. Dashboard
routes share point-session SI input, per-model chart memory, and calculation
caches. Time-series does not read or schedule the point session. View-models
are `$derived` projections, not a second store. Share is JSON → Base64URL →
`?state=` of input + chart only.

## Catalogs the declaration may select

Quantities and ChartTypes are closed frontend catalogs. Models select ids;
they do not own, extend, or invent them. Derived-humidity or modifier-input
`kind: "quantity"` fields, unknown ChartTypes, or `tables.timeSeries` fail
`defineModel` / `assembleCatalogs`. There is no `validate.model` hook and no
TableType catalog. Copy `heatIndex.ts`, add a `ModelId` member, and
register once. `defineModel(library, authoring)` reads string `label` /
`description` from the JS function (`@docname` / leading JSDoc first
sentence). Pass classifier statics explicitly:
`intervalFromBins(quantity, heat_index.mapping.bins, tokens)`,
`intervalFromBounds(...)`, or `intervalFromOffsets(...)`. Do not paste
thresholds and do not guess `kind: "mapping"` on the first argument.
Classifier **words** stay JS/Python; Comfort Tool may title-case
all-lowercase labels for display (`displayClassifierLabel`). Adaptive
`offsets.id` stays the result-field stem; generate display labels in the
Adaptive declaration layer. When JS has no human label (Wind Chill `wct`),
use that field name; do not invent classifier copy.
Do not
invent classifiers that Python lacks (Wind Chill frostbite, ISO Category B
three-band, PPD, PHS `mapping()`). PPD 10% is an Explore chart preset.
EN Adaptive outdoor 10–30 °C is a chart axis, not
`adaptive_en.t_running_mean_limits`.

**Quantities.** `src/catalog/quantities.ts` is the closed catalog for inputs
and outputs. TypeScript keys are PascalCase physical names; wire strings
match jsthermalcomfort parameter or result fields (`tdb`, `hi`, `weight`).
Catalog rows hold `label`, `siUnit`, optional `step`, and optional
`category: Humidity`. Session/share use a sparse `QuantityState` bag.
`derivedHumidityQuantityIds` (`t_dp`, `hr`, `t_wb`, `p_vap`) are not
independent share truth. Widget min/max map the model RH `inputFields`
range at current `tdb`. Body weight and height are catalog ids in the same
bag; PHS keeps them off Analysis `inputFields`. Do not add PHS
weight/height to the Analysis input panel. Surface a catalog id on a panel
only with `{ quantity, minValue, maxValue }` (or an explicit widget).
The catalog has no min/max. Modifier inputs use `modifierInputs` /
`modifierInputRangeSi` on the modifier schema, not `inputFields`.
All quantity conversion reads catalog `siUnit` and must
not branch on PHS or quantity-id lists.
`siUnit` is canonical storage (`kg`, `m`, `kg/kg`, `Pa`, …);
display labels such as g/kg live on `siUnitLabel` / `ipUnitLabel`.

**Charts.** Closed ChartTypes live in `src/catalog/chartTypes.ts`. Dropdown
labels are `chartTypeLabel[type]` (Heat Loss, Body Temperature, SET).
`defineModel` may use any ChartType whose spec matches. Family modules use
the same `FrontendChartDeclaration` union. There is no ModelId allowlist.
One model registers each ChartType at most once. Heat Index / Humidex use
a single Dynamic instance. Psychrometric is a ChartType currently used by
PMV ASHRAE/ISO. Keep the eight ChartType product names. Do not solve PMV
isoline roots in a declaration; pass `evaluate(T, RH)` and band thresholds to
`src/charts/psychrometric/` helpers. 2-D Dynamic charts share
`src/charts/isolines.ts` (Cartesian linear caps). Dynamic charts inherit
`inputFields` ranges; `spec.axisRanges` is only for axes input cannot
cover. The Psychrometric ChartType viewport is
`DEFAULT_PSYCHROMETRIC_VIEW` (`tdb` 10–40 °C, `hr` 0–0.03 kg/kg), not the
Analysis spinner; CBE `psychchart.js` uses 10–36 °C and 0–30 g/kg. Hover is Plotly closest on Compare markers and data lines.
2-D field drop-point hover is a Plotly probe on `ChartBuildResult.hoverProbe`, not `ChartPayload`; the probe follows the pointer and does not snap to Compare markers. Publication export omits the probe. Do not add a 100² hover grid or fill `hoveron: "fills"`.
TemperatureMode Air keeps `tr` from
input on that field; Operative uses `tr=tdb` per sample and labels x
Operative temperature. Heat-loss vs temperature
and SET series builders live beside the PMV family; ASHRAE and ISO
declarations each register those ChartTypes. Do not pass 300
or 450 as a 2-D Dynamic fill grid. UTCI 1-D sampling may stay high (for example 450 x-points). Hover
overlays must not attach a
per-cell `customdata` matrix. `src/charts/draw.ts`
clones Plotly-owned `x`/`y`/`z`/`text` arrays and nested records Plotly
mutates, applies axis lines/ticks via `layout.template`, and converts non-finite grid `z` cells to `null` gaps. Do not
`JSON.parse(JSON.stringify(figure))` a dense field. Screen and publication
figures share `src/charts/chartTheme.ts`. Export builds a separate
publication figure (PNG ~300 DPI equivalent, SVG of the same geometry, no
mode bar) and must not capture the on-screen plot. Publication widths are
journal single- and double-column profiles on that same theme; Compare
legends stay readable at both widths. Models select `ZoneToken` values;
screen, publication, and colour-blind fills live in
`src/catalog/zoneTokens.ts` and remap at draw/export.

**Tables.** `tables.results` is a Compare-only row array. Rows may be a
quantity id, `{ quantity }`, or a custom `{ id, label, format }`. Do not
put Time-series columns or membership on `tables`. PHS Time-series rows
and `simulation.charts` live on `features.timeSeries`; surface membership is
that object (`getModelsForSurface(TimeSeries)` / `config.timeSeries`).
Declaring `features.timeSeries` does not create a simulator. PMV ASHRAE
and ISO tables include SET, cooling effect, relative air speed, and
dynamic clothing as Compare-matrix rows. Do not add SET as an
`exploreOutputs` key unless Explore must colour SET. Do not add a TableType
catalog. ASHRAE and ISO already register Heat Loss and SET chart instances;
copy that pattern rather than merging standards behind a runtime flag.

## What the declaration must show

Use `defineModel(library, authoring)`. `library` is the JS function (call
site, `label`, `description`). `authoring` is six sections. `assembleModel`
is an alias of `defineModel`. Assembly erases generics once into
`RuntimeComfortModelDefinition`.

0. **Attributes** — `id`; required `standardIds` (`[]` = no Standard);
   required `exploreMode: true | false`. At least one page must be true
   (non-empty `standardIds`, `exploreMode`, or `features.timeSeries`).
1. **Inputs** — `inputQuantity(jsName, catalogId, { minValue, maxValue })`.
2. **Response** — `values` map return fields (`resultQuantity("hi", …)`).
   `intervals` pass the function’s static bins/bounds/offsets plus token
   rows. Classifiers do not enter `QuantityState`.
3. **Tables** — Compare only (`tables.results`). No `timeSeries` key.
4. **Charts** — point-session ChartType, axes, range. Dynamic `evaluate`
   defaults to the same invoke pipeline.
5. **Features** — optional. Modifiers, option handlers, Standard
   `complianceProfile`, and the whole Time-series object
   (`{ rows, simulation }`). Omit empty `modifiers: []`.

Do not write `calculate`, JS kwargs (`units` / `round` / `limit_inputs`),
or `surfaceCapabilities`. Invoke injects `{ units: "SI", round: false,
limit_inputs: false }` when the function accepts them. A second JS function
(WCT) belongs on `resultQuantity(..., { from })`. Family models that cannot
use positional invoke set `features.invoke` (and `mapChartInput` /
`buildChartSource` when the chart payload is not the SI bag).

Visible product decisions:

- `id`, first-arg `library` (string `label` / `description` on the JS function)
- `standardIds` — `[]` when the model is not a Standard model
- `exploreMode`
- `features.complianceProfile` when `standardIds` is non-empty (fixed output,
  non-empty bands, `caption`, `legendTitle`, feedback callback)
- `inputs` as JS parameter name + catalog id + SI min/max (`widget?`)
- `response.values` and optional `response.intervals`
- `features.modifiers` in global order, omitted when none apply
- token rows on the interval helper; do not copy numeric edges or hex
- `charts` as `type` + data spec only (no `id`, `instanceId`, `title`,
  `emptyMessage`, or `spec.build`). Default chart is `charts[0].type`.
- `tables: { results }` (`results` may be omitted when each value is one
  Compare column)
- Dynamic axes come from the first Dynamic spec `axes` / `axisFields`

Zones generate bands; they are not stored on the runtime definition.

### Inputs, requests, and calculation

Thin models do not export a mapping table or `calculate`. `defineModel`
builds `toLibrary` / `fromLibrary` from `inputs` + `response.values` and
runs `invokeMappedLibrary` per visible Compare slot. Chart source is the
catalog SI bag (`quantitiesByInput`). Results are `QuantityState`. Dynamic
field evaluate uses the same invoke unless the spec overrides it.

Family modules (PMV, Adaptive, UTCI, PHS) still use
`defineLibraryQuantityMapping()` beside the declaration when the library
call is not positional kwargs. Include 1:1 result fields in that table.
They set `features.invoke` per visible Compare slot. Chart source defaults
to the catalog SI bag; `mapChartInput` stores the mapped request, and
`buildChartSource` is for extra per-input maps (PMV psychrometric).
Aggregates and classifiers stay outside the map. Do not add a `Dto`
suffix on application request or chart-source types. Generic chart figure
inputs live in `src/charts/types.ts`.

```ts
export const heatIndexModelConfig = defineModel(heat_index, {
  id: ModelId.HeatIndex,
  standardIds: [],
  exploreMode: true,
  inputs: [
    inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
      minValue: 20,
      maxValue: 50,
    }),
    inputQuantity("rh", PhysicalQuantityId.RelativeHumidity, {
      minValue: 0,
      maxValue: 100,
    }),
  ],
  response: {
    values: [resultQuantity("hi", PhysicalQuantityId.HeatIndex)],
    intervals: [
      intervalFromBins(
        PhysicalQuantityId.HeatIndex,
        heat_index.mapping.bins,
        [
          { label: "no risk", token: ZoneToken.Safe },
          { label: "caution", token: ZoneToken.Caution },
          { label: "extreme caution", token: ZoneToken.StrongCaution },
          { label: "danger", token: ZoneToken.Danger },
          { label: "extreme danger", token: ZoneToken.ExtremeDanger },
        ],
      ),
    ],
  },
  tables: {
    results: [quantityRow(PhysicalQuantityId.HeatIndex)],
  },
  charts: [{
    type: ChartType.Dynamic,
    spec: {
      axes: {
        x: PhysicalQuantityId.DryBulbTemperature,
        y: PhysicalQuantityId.RelativeHumidity,
      },
    },
  }],
});
```

Compose `createRequestAxisAdapter()` only for chart-only aliases or explicit
operative-temperature get/set/range (`quantityMapping:` option). Coupled Air/Radiant/Operative solving
stays in the shared dynamic-axis solver.

`calculate` on the runtime definition receives `ModelCalculationContext` with
`effectiveQuantitiesByInput` (modifier-adjusted SI) and the active model’s
validated `options`. It must not read raw `quantitiesByInput`. Authors do
not write that function on thin models.

`inputs` compile to runtime `inputFields`. Default widgets are
`defaultFieldWidgetByQuantity` in `src/catalog/inputWidgets.ts`.
`resolveInputField()` still produces today's `InputControlDefinition`.
PMV overrides Operative / AdvancedHumidity with `InputWidget`. PHS
environment ranges live once in `phsEnvironmentRangeSi` and feed both
Analysis inputs and Time-series segment controls. PHS weight/height stay
off Analysis `inputFields`. The Analysis
input panel reads those controls through
`getInputPanelViewModel`; do not add conversion or model branches in
`src/ui/components/input-panel/`. Control widgets stay generic; unit conversion
reads the closed quantity catalog (`convertQuantityFromSi`). Option changes go only through
`optionHandlersByKey`.
Missing, extra, or invalid options are rejected; invalid internal option
state is an invariant.

### Charts and tables

Reuse `GridModelChartSpec` + `buildGridModelChart()` in
`src/engines/comfort/charts/gridModelCharts.ts` for two-axis banded fields.
Presentation-only changes (mode, axes, bands, chart, Explore output, units,
zone visibility) rebuild from a ready calculation cache and must not
schedule calculation.

Standard workspace reads output, bands, caption, legend, and feedback from
`complianceProfile`. Explore uses the selected `exploreOutputs` entry and
editable working bands. Band membership follows each `NumericBand`'s
`minInclusive` / `maxInclusive` (JS digitize closedness). Defaults remain
half-open `[min, max)` when those flags are omitted.

Psychrometric is frontend-only on PMV ASHRAE/ISO via `PsychrometricDataSpec`
(`evaluate`, bands, isoline targets). Do not compute isoline roots in the
declaration. PMV Dynamic uses the same `DynamicFieldGridSpec` engine as Heat
Index. Heat Loss and SET keep `getGeometry` data callbacks. UTCI stress uses
`BandScalarDataSpec`; Adaptive uses `BoundaryRegionDataSpec`. PHS chart binds
live in `src/declarations/phs/charts.ts`. PHS Analysis exposure history is
Body Temperature.

### Modifiers

`features.modifiers` receive executable `InputModifier` declarations, not
ids. The global catalogue in `src/catalog/inputModifiers.ts` holds UI/share
ids, `modifierInputs`, and `modifierInputRangeSi`. Order is fixed:

```text
Measured Air Speed → Morning Clothing Estimate → Dynamic Clothing → Solar Gain
```

Dynamic Clothing is declared only by PMV ASHRAE and PMV ISO, each bound to
that declaration’s standard. Models with none omit `features.modifiers`.

### Share

Strict `version: 1`. Serialize sparse `quantitiesByInput` (reject derived
humidity keys), sparse `models` (omit default slices), and
`activeModifiersByInput`. Missing known model
keys seed defaults; unknown keys are rejected. Adding a model must not
require existing URLs to list that model. The codec accepts only that
version-1 field set. Path identity is not in the query.

## Compare

Every point-session model must pass `assertCompareContract` in
`src/testSupport/assertCompareContract.ts`: 1, 2, and 3 visible inputs,
filled table columns, chart markers, and a baseline change that keeps a
ready cache. Three inputs must not fail silently. Compare golden values come
from the registered `inputFields` and `standardPrimaryFixture` in
`src/testSupport/goldenFixtures.ts`. If the fixture is outside the new
model's declared range, add an explicit quantity override there — do not
invent one from min/max, and do not add a model
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
