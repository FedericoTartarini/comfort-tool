# Adding a thermal model

This is an internal developer guide. A model's product decisions must be readable from one focused declaration entry in `src/comfortModels/`, and adding a model must not introduce a model-specific controller or component branch.

“One declaration entry” is an ownership rule, not a claim that the complete change touches one physical file. Stable IDs remain centralized, registration remains explicit, and tests remain separate. A simple model can keep its declaration, calculation, result rows, and charts in one file. A larger standard family may place formulas and chart construction in focused calculation/chart modules beside the declarations, while each registered declaration still shows its identity, standard, workspace capabilities, explore outputs, chart instances, bands, modifiers, and tables.

For the current runtime boundaries and state flow, see [Frontend structure summary](frontend-structure-summary.md).

## 1. Add stable IDs and shared metadata

Add the serialized model ID to `ComfortModel`. Declare each chart instance id on `outputCharts`; do not add a parallel `ChartInstanceId` tree. Instance ids must be non-empty per model, unique per model, and unique globally. Add a `ModelOutputKey` and its unit-presentation metadata only when the model exposes a genuinely new output. Reuse existing constants instead of introducing inline domain strings for model, quantity, and chart-kind identifiers.

Physical quantities are a **system seed** in `src/models/physicalQuantities.ts` plus optional declaration contributions:

- `PhysicalQuantityId` — wire-safe ids for primary, derived, and modifier values in the system seed;
- `systemQuantityMetaById` — labels, SI defaults/min/max, display metadata, `scope: system`, and `state` (`primary` / `slot`);
- `primaryInputOrder` — the exact base-SI primary key set shared across input slots and share snapshots;
- `ChartAxisQuantityId` — selectable chart-axis coordinates (primary fields plus operative temperature and humidity ratio).

Runtime code reads the **assembled** catalog (`system seed ∪ declarations[].quantities.extend`). Registry assemble fails on duplicate ids or wrong owners.

If the model needs a new persisted primary input, add a `PhysicalQuantityId`, metadata with `state: QuantityState.Primary` and `inPrimaryOrder: true`, and extend `primaryInputOrder`. That is frontend work, not declaration-only work. Model-scoped inputs use `quantities.extend: [{ id, owner: this model, scope: model, SI meta }]` and surface them through `inputFields: [{ kind: "modelQuantity", … }]` when they belong on the Analysis panel. Extended quantities must not enter `primaryInputOrder` or the global share primary record; they live in sparse `modelInputsByModel`.

Modifier extra inputs are catalog slot quantities (`state: QuantityState.Slot`, `modifierId`). Do not add derived or chart-only coordinates, such as dew point or operative temperature, to `primaryInputOrder`.

## 2. Create the declaration entry

Create the registered declaration under `src/comfortModels/`. It must make the following product decisions visible without inspecting the controller:

- stable identity, label, and description;
- `inputFields` specs, any `quantities.extend` contributions, option handlers, complete default options, and an exact parser;
- request mapping and calculation;
- result rows and charts;
- declaration-local `ThermalZone` values and derived bands;
- explicit Standard membership (including an explicit empty list);
- `workspaceCapabilities`, `exploreOutputs`, and chart instance declarations;
- executable input modifiers in application order;
- chart definitions, selectable axes, and default axis pair.

Use `defineModel<Result, ChartSource, ComplianceBand = NumericBand>({ ... })` so result, chart-source, and Compliance-band types remain specific while the declaration is assembled. Numeric-band models normally specify only the first two type arguments; models with functional band edges, such as Adaptive, pass `Band` as the third. `defineModel` is the sole assembly function; it erases those generics once into a `RuntimeComfortModelDefinition` for the registry and controller. Copy `src/comfortModels/heatIndex.ts` as a full declaration. Do not add `defineIndexModel()` or restore `src/comfortModels/presets/`.

PMV and Adaptive keep family modules (two standards, one calculation/chart core). Those are not presets. They may still assemble with `ComfortModelBuilder` internally.

Keep each threshold in one `ThermalZone` declaration and derive numeric bands from those zones:

```ts
const zones = [
  new ThermalZone({
    label: "Safe",
    max: 27,
    color: "#e2e8f0",
  }),
  new ThermalZone({
    label: "Caution",
    min: 27,
    color: "#fde047",
  }),
];

const output = {
  key: ModelOutputKey.Example,
  label: "Example index",
  defaultBands: bandsFromThermalZones(zones),
};
```

Zones stay beside the declaration or calculation that uses them. They generate Explore or Compliance bands but are not stored on the runtime definition.

## 3. Map requests and chart axes once

Define a thin model-owned request type and map its numeric properties to canonical input fields with `createFieldRequestAdapter()`:

```ts
import { PhysicalQuantityId } from "../models/physicalQuantities";

interface ExampleRequest {
  tdb: number;
  rh: number;
}

const fieldAdapter = createFieldRequestAdapter<ExampleRequest>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  rh: PhysicalQuantityId.RelativeHumidity,
});
```

Use `fieldAdapter.mapRequest` for `calculatePerInput()` and its `getAxisValue`/`setAxisValue` operations for ordinary chart axes.

Connection flow:

```text
physicalQuantities.ts (system seed)
  -> registry assemble (seed ∪ quantities.extend)
  -> quantitiesByInput / effectiveQuantitiesByInput / modelInputsByModel (state)
  -> createFieldRequestAdapter map (declaration file, or family *Calculation.ts)
  -> Request DTO (jstc short names)
  -> jsthermalcomfort
```

If a selectable chart exposes an alias or operative temperature, compose the field adapter once with `createRequestAxisAdapter()`. Declare only the alias, explicit operative-temperature get/set/range behavior, and any standard-specific component ranges. The shared dynamic-axis solver remains responsible for coupled Air/Radiant/Operative coordinate pairs. Do not add another hand-written axis switch.

All requests, chart coordinates, calculations, and band edges are canonical SI.

## 4. Declare controls and exact options

Declare the visible input panel through `defineModel` `inputFields` (or builder `setInputFields()`) using `InputFieldSpec` kinds resolved in `services/comfort/controls/fieldInputBehaviors.ts`:

- `numeric` — ordinary canonical primary fields;
- `operativeTemperature` / `radiantTemperature` — explicit Air/Operative support;
- `occupantAirSpeed` / `outdoorWindSpeed` — shared air/wind menus;
- `simpleHumidity` / `advancedHumidity` — RH-only vs multi-mode humidity;
- `preset` — metabolic/clothing menus via `InputPresetKey`;
- `modelQuantity` — model-scoped quantities contributed with `quantities.extend`.
  `quantities.extend` and `{ kind: "modelQuantity" }` fields may be declared in either order. Assemble checks that every `modelQuantity` field is an extend entry owned by that declaration. Control labels, ranges, and conversion read the assembled catalog at view-model time, not while the declaration is being built.

Control behaviors construct view models and apply numeric input only. Model `optionHandlersByKey` is the sole option-change path.

Models without options must declare `{}` and `parseEmptyOptions`. Other models must declare a complete default object and an exact parser that rejects missing, extra, or invalid values. Invalid internal option state is an invariant error, not a reason to fill defaults.

The calculation manager runs that parser once at the model boundary. `ModelCalculationContext` then exposes `effectiveQuantitiesByInput` (modifier-adjusted primary SI), sparse `auxiliaryQuantitiesByInput`, sparse `modelInputs`, and only the active model's validated `options`; the keyed `modelOptionsByModel` record remains controller/share state and is not exposed to model calculations.

## 5b. Declare output tables and charts

Use the `defineModel` output fields instead of adding controller branches:

- `tables: { analysis, timeSeries? }` with `TableType.Analysis` for multi-input Analysis tables
- `TableType.TimeSeries` on `tables.timeSeries` for PHS Time-series metric tiles (allowed only with Time-series workspace capability)
- `outputCharts` plus `defaultChartInstanceId` with instance ids that live only on the declaration and typed `ChartKind` specs. Heat Index / Humidex fixed-axis maps use `ChartKind.DynamicField` with `lockedAxes`, not `Custom`.

Declare `workspaceCapabilities` explicitly (`Standard`, `Explore`, and/or `TimeSeries`). Compliance/Explore field charts share `fieldChartProfile` inputs; presentation-only changes rebuild from the calculation cache.

## 5. Declare workspace capabilities, outputs, and Compliance

Every declaration explicitly sets Standard membership, workspace capabilities, and explore outputs:

```ts
standardIds: [],
workspaceCapabilities: [WorkspaceCapability.Explore],
exploreOutputs: [output],
```

Use stable `StandardId` values for Standard-capable declarations, for example
`standardIds: [StandardId.Ashrae55]`. Assemble rejects duplicate Standard IDs, a
Standard model with no Standard ID, and a Standard declaration without compliance support.
Models that do not belong to a Standard must set `standardIds: []` explicitly.

Standard workspace model lists are derived from `standardIds`. Explore availability is
independent and comes from `workspaceCapabilities.includes(WorkspaceCapability.Explore)`; do not add a
second navigation list. Time-series support is declared with `tables.timeSeries` plus `simulation.charts` on the PHS declaration and must not be mixed into Analysis share snapshots.

Explore requires at least one output with valid numeric SI bands. A Standard-capable model also declares a fixed output, non-empty bands, caption, legend title, and result feedback callback through `complianceProfile`. Standard workspace output and bands always come from `complianceProfile`; Explore uses the selected output and its editable working bands.

The Explore toolbar shows an Output selector only when the selected chart supports more than
one entry. By default this is the model's complete `exploreOutputs` list. A chart that can
render only a subset declares `supportedExploreOutputs` and `defaultExploreOutput` on its
`outputCharts` entry; the assembler rejects unknown or inconsistent output keys. Use
`allowsBaselineSelection: false` in chart capabilities only when a chart has no meaningful baseline-input comparison.
Single-output charts still expose their threshold editor without rendering a redundant
selector. Chart changes are presentation-only and normalize the selected output to the
chart's declared default without scheduling calculation.

Bands are array ordered and half open: `min <= value < max`. Do not copy a standard boundary into a second numeric source.

PMV ASHRAE/ISO and Adaptive ASHRAE/EN remain separate registered declarations. Never merge standards behind a runtime toggle. Shared family mechanics may be implemented once in focused modules:

- PMV declarations: `pmvAshrae.ts`, `pmvIso.ts`; shared assembly: `pmvShared.ts`; formulas/results: `pmvCalculation.ts`; charts: `pmvCharts.ts` (router), `pmvChartShared.ts`, `pmvPsychrometricChart.ts`, `pmvDynamicChart.ts`.
- Adaptive declarations: `adaptiveAshrae.ts`, `adaptiveEn.ts`; shared assembly: `adaptiveShared.ts`; calculations/results: `adaptiveCalculation.ts`; charts: `adaptiveCharts.ts`.

Each standard declaration must still show all standard-specific decisions.

### Shared engines and grid charts

Reuse shared engines before adding bespoke chart or control code. Do not restore preset factories.

- **Grid Dynamic charts**: `GridModelChartSpec` + `buildGridModelChart()` in
  `services/comfort/charts/gridModelCharts.ts` for two-axis banded field charts.
  Copy `heatIndex.ts` for a tdb + rh index; copy `windChill.ts` for a tdb + v index.
  Heat Index / Humidex maps are `ChartKind.DynamicField` with `lockedAxes`.
- **Extended chart sources**: `calculatePerInputWithExtensions()` when `chartSource` needs
  per-input maps beyond `inputs` (PMV comfort zones).
- **Input value presets**: `InputPresetKey` catalog in
  `services/comfort/controls/inputControlPresets.ts` with `{ kind: "preset", … }` input fields.
- **Declarative result rows**: `tables.analysis` with `TableType.Analysis`; runtime assembly
  goes through `buildCompareMatrixTable()` in `services/comfort/output/tableResolver.ts`.
- **Grid dynamic charts on a declaration**: `ChartKind.DynamicField` entries in `outputCharts`
  with `GridModelChartSpec` resolved per profile. The spec may be static or a `(context) => spec`
  factory when band labels depend on presentation context (PHS).
- **Non-grid charts**: declare the matching kind in `outputCharts` — `ChartKind.Custom`
  (PMV psychrometric), `ChartKind.BandScalar` (UTCI stress), `ChartKind.BoundaryRegion`
  (Adaptive), `ChartKind.TimeSeriesLine` (PHS exposure history). The ChartKind resolver in
  `services/comfort/charts/kinds/` dispatches build logic; do not add controller branches.

Non-grid chart geometry (PMV psychrometric, UTCI stress, PHS exposure history, Adaptive
boundary) is declared through `outputCharts` with the appropriate `ChartKind`. Time-series
simulation charts use `ChartKind.TimeSeriesLine` via `simulation.charts`; Analysis field
charts use `DynamicField` or `Custom`, not a separate chart-builder API.

### Optional Time-series support

Time-series is a separate product controller. PHS is the only Time-series model.
Declare `tables.timeSeries` with `TableType.TimeSeries` on the PHS Analysis declaration,
together with Time-series workspace capability. `state/timeSeries/modelConfigs.ts` reads
that declaration to decide which models are enabled. Declaring the table does not create a
simulator; the PHS simulator stays in `phsTimeSeries.ts`.

Keep editor controls, draft validation, and asynchronous `simulate()` on the Time-series
simulator module. Declare Time-series **charts** on the unified comfort model config via
`simulation: { charts }`. The Time-series controller reads summary rows from
`tables.timeSeries` and chart builders from `getModelSimulationOutput(modelId)`. Do not put
segment durations or physiological carry state into canonical Analysis input/share records.

Model-specific sequence calculation and editor metadata remain under `comfortModels`; generic
public contracts belong in `models`, and the Time-series controller consumes registered
runtime definitions without importing implementations directly.
Time-series numeric state remains canonical SI and uses centralized unit conversion for
display.

`simulate()` is asynchronous and receives an `AbortSignal` plus a progress callback. The
controller automatically runs an initial valid draft, debounces calculation-relevant edits,
aborts or supersedes older revisions, and commits only the newest result. Invalid edits retain
the previous successful result. Model definitions should keep presentation-only operations,
such as units and names, independent of simulation; expensive minute-by-minute models should
perform the complete calculation in a client-side worker and may downsample only chart DTOs.
Do not add a generic total-duration cap unless the model's governing calculation genuinely
requires one.

## 6. Attach executable modifiers

`setModifiers()` / `defineModel` `modifiers` receive actual `InputModifier` declarations, not IDs. The global catalogue contains only the stable UI/share ID and extra-input schema.

Models with no modifiers call `.setModifiers([])` or `modifiers: []`. Supported modifiers must appear in the fixed global order:

```text
Measured Air Speed -> Morning Clothing Estimate -> Dynamic Clothing -> Solar Gain
```

For PMV, bind Dynamic Clothing to the declaration's standard:

```ts
.setModifiers([
  measuredAirSpeedModifier,
  morningClothingEstimateModifier,
  createDynamicClothingModifier(JsThermalComfortStandard.ASHRAE),
  solarGainModifier,
])
```

Modifier callbacks receive the complete effective SI input plus their tuple-declared extra inputs and may return only their tuple-declared canonical-field patch. The controller derives effective input without overwriting base SI state. If Morning Clothing and Dynamic Clothing are both enabled, Dynamic Clothing consumes the clothing value produced by Morning Clothing.

## Share snapshots

Strict `version: 1` snapshots persist input state as:

- `quantitiesByInput` — full `PrimaryInputState` per `InputId` (every `primaryInputOrder` key);
- `auxiliaryQuantitiesByInput` — sparse modifier-slot `PhysicalQuantityId` values per input;
- `modelInputsByModel` — sparse model-scoped quantity overrides per registered model;
- `activeModifiersByInput` — complete modifier enablement matrix per input.

Only non-default model-scoped values and configured modifier quantities are serialized sparsely; unset keys are omitted. The codec requires the exact top-level key set above and rejects legacy `inputsByInput`, `derivedByInput`, and `modifierInputsByInput` payloads.

## 7. Declare model-owned charts

All chart output belongs to `outputCharts` with declaration-owned instance ids and typed kind specs. The registry derives those ids from `outputCharts.entries`; do not recreate a second legend/lock array or id tree beside `outputCharts`.

```ts
import { ChartKind } from "../models/output/chartKinds";

outputCharts: [
  {
    instanceId: "example-dynamic-field",
    kind: ChartKind.DynamicField,
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    capabilities: {
      allowsAxisSelection: true,
      locksYAxis: false,
      showsLegend: true,
    },
    spec: {
      title: "Example Dynamic Chart",
      axisFields: [
        PhysicalQuantityId.DryBulbTemperature,
        PhysicalQuantityId.RelativeHumidity,
      ],
      resolveGridSpec: () => gridSpec,
    },
  },
],
defaultChartInstanceId: "example-dynamic-field",
```

When a model offers both a dedicated/fixed chart and a Dynamic chart, use the
dedicated chart as `defaultChartInstanceId`. Use Dynamic as the initial default only when the model
has no other chart. This is an explicit declaration convention rather than a Builder
invariant; do not infer the default from chart names at runtime.

Then declare the complete selectable field set and a supported, distinct default pair:

```ts
import { PhysicalQuantityId } from "../models/physicalQuantities";

dynamicAxisFields: [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.RelativeHumidity,
],
defaultDynamicAxes: {
  xAxis: PhysicalQuantityId.DryBulbTemperature,
  yAxis: PhysicalQuantityId.RelativeHumidity,
},
```

Fixed and selectable field charts consume the same active `FieldChartConfig`. Mode, chart, axis, baseline, Explore output/bands, unit, and zone visibility are presentation-only and rebuild from a ready cache without scheduling a calculation.

## 8. Build, register, and test

Export the assembled runtime definition from `defineModel`:

```ts
export const exampleModelConfig = defineModel({
  id: ComfortModel.HeatIndex,
  /* complete declaration — copy heatIndex.ts */
});
```

Import it into `src/state/comfortTool/modelConfigs/index.ts` and add one explicit `comfortModelConfigs` entry. The registry must remain `Record<ComfortModel, RuntimeComfortModelDefinition>`; the controller consumes that runtime contract without model-specific casts or branches.

Add focused tests for:

- known calculation values, applicability rules, and half-open boundaries;
- request mapping, aliases, operative get/set/ranges, and supported coupled axis pairs;
- exact option parsing and input-mode synchronization;
- result rows, including valid falsy values;
- modifier support, order, finite output, reversibility, and base/effective separation;
- chart definitions and chart shapes;
- SI/IP presentation and strict share-version-1 round trips/rejection (`quantitiesByInput`, sparse `auxiliaryQuantitiesByInput`, sparse `modelInputsByModel`, `activeModifiersByInput`);
- presentation-only actions preserving a ready calculation cache.

Run the complete validation matrix:

```bash
npm test
npm run check
npm run lint
npm run build
npm run test:visual
git diff --check
```

Do not update visual baselines unless the model intentionally changes visible UI or charts.
