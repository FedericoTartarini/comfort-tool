# Adding a thermal model

This is an internal developer guide. A model's product decisions must be readable from one focused declaration entry in `src/comfortModels/`, and adding a model must not introduce a model-specific controller or component branch.

“One declaration entry” is an ownership rule, not a claim that the complete change touches one physical file. Stable IDs remain centralized, registration remains explicit, and tests remain separate. A simple model can keep its declaration, calculation, result rows, and charts in one file. A larger standard family may place formulas and chart construction in focused calculation/chart modules beside the declarations, while each registered declaration still shows its identity, standard, workspace capabilities, explore outputs, chart instances, bands, modifiers, and tables.

For the current runtime boundaries and state flow, see [Frontend structure summary](frontend-structure-summary.md).

## 1. Add stable IDs and shared metadata

Add the serialized model ID to `ComfortModel`. Declare each chart instance id on `setOutputCharts()`; do not add a parallel `ChartInstanceId` tree. Instance ids must be non-empty per model, unique per model, and unique globally. Add a `ModelOutputKey` and its unit-presentation metadata only when the model exposes a genuinely new output. Reuse existing constants instead of introducing inline domain strings for model, quantity, and chart-kind identifiers.

Physical quantities are declared once in `src/models/physicalQuantities.ts`:

- `PhysicalQuantityId` — wire-safe ids for primary, derived, modifier, and model-scoped values;
- `physicalQuantityMetaById` — labels, SI defaults/min/max, display metadata, `scope` (`system` / `model`), and `state` (`primary` / `slot` / `model`);
- `primaryInputOrder` — the exact base-SI primary key set shared across input slots and share snapshots;
- `ChartAxisQuantityId` — selectable chart-axis coordinates (primary fields plus operative temperature and humidity ratio).

If the model needs a new persisted primary input, add a `PhysicalQuantityId`, metadata with `state: QuantityState.Primary` and `inPrimaryOrder: true`, and extend `primaryInputOrder`. Model-scoped inputs use `scope: PhysicalQuantityScope.Model`, `state: QuantityState.Model`, and `ownerModelId`; register them with `registerModelQuantities()` and surface them through `setInputFields({ kind: "modelQuantity", … })`.

Modifier extra inputs are catalog slot quantities (`state: QuantityState.Slot`, `modifierId`). Do not add derived or chart-only coordinates, such as dew point or operative temperature, to `primaryInputOrder`.

## 2. Create the declaration entry

Create the registered declaration under `src/comfortModels/`. It must make the following product decisions visible without inspecting the controller:

- stable identity, label, and description;
- `setInputFields()` specs, any `registerModelQuantities()` entries, option handlers, complete default options, and an exact parser;
- request mapping and calculation;
- result rows and charts;
- declaration-local `ThermalZone` values and derived bands;
- explicit Standard membership (including an explicit empty list);
- `workspaceCapabilities`, `exploreOutputs`, and chart instance declarations;
- executable input modifiers in application order;
- chart definitions, selectable axes, and default axis pair.

Use `ComfortModelBuilder<Result, ChartSource, ComplianceBand = NumericBand>` so result, chart-source, and Compliance-band types remain specific while the declaration is assembled. Numeric-band models normally specify only the first two type arguments; models with functional band edges, such as Adaptive, pass `Band` as the third. `build()` is the single boundary that returns a non-generic `RuntimeComfortModelDefinition` for the registry and controller.

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
physicalQuantities.ts (catalog)
  -> quantitiesByInput / effectiveQuantitiesByInput (state)
  -> createFieldRequestAdapter map (model *Calculation.ts)
  -> Request DTO (jstc short names)
  -> jsthermalcomfort
```

If a selectable chart exposes an alias or operative temperature, compose the field adapter once with `createRequestAxisAdapter()`. Declare only the alias, explicit operative-temperature get/set/range behavior, and any standard-specific component ranges. The shared dynamic-axis solver remains responsible for coupled Air/Radiant/Operative coordinate pairs. Do not add another hand-written axis switch.

All requests, chart coordinates, calculations, and band edges are canonical SI.

## 4. Declare controls and exact options

Declare the visible input panel through `builder.setInputFields()` using `InputFieldSpec` kinds resolved in `services/comfort/controls/fieldInputBehaviors.ts`:

- `numeric` — ordinary canonical primary fields;
- `operativeTemperature` / `radiantTemperature` — explicit Air/Operative support;
- `occupantAirSpeed` / `outdoorWindSpeed` — shared air/wind menus;
- `simpleHumidity` / `advancedHumidity` — RH-only vs multi-mode humidity;
- `preset` — metabolic/clothing menus via `InputPresetKey`;
- `modelQuantity` — model-scoped quantities registered with `registerModelQuantities()`.

Control behaviors construct view models and apply numeric input only. Model `optionHandlersByKey` is the sole option-change path.

Models without options must declare `{}` and `parseEmptyOptions`. Other models must declare a complete default object and an exact parser that rejects missing, extra, or invalid values. Invalid internal option state is an invariant error, not a reason to fill defaults.

The calculation manager runs that parser once at the model boundary. `ModelCalculationContext` then exposes `effectiveQuantitiesByInput` (modifier-adjusted primary SI), sparse `auxiliaryQuantitiesByInput`, sparse `modelInputs`, and only the active model's validated `options`; the keyed `modelOptionsByModel` record remains controller/share state and is not exposed to model calculations.

## 5b. Declare output tables and charts

Use the model builder output APIs instead of adding controller branches:

- `.setOutputTable({ layout, rows })` with `TableLayout.CompareMatrix` for multi-input Analysis tables
- `TableLayout.MetricSummary` for single-result metric tiles (Time-series style summaries use the same item shape)
- `.setOutputCharts([...], { defaultInstanceId })` with instance ids that live only on the declaration and typed `ChartKind` specs. Heat Index / Humidex fixed-axis maps use `ChartKind.DynamicField` with `lockedAxes`, not `Custom`.

Declare `workspaceCapabilities` explicitly (`Standard`, `Explore`, and/or `TimeSeries`). Compliance/Explore field charts share `fieldChartProfile` inputs; presentation-only changes rebuild from the calculation cache.

## 5. Declare workspace capabilities, outputs, and Compliance

Every declaration explicitly sets Standard membership, workspace capabilities, and explore outputs:

```ts
builder
  .setStandardIds([])
  .setWorkspaceCapabilities([WorkspaceCapability.Explore])
  .setExploreOutputs([output]);
```

Use stable `StandardId` values for Standard-capable declarations, for example
`.setStandardIds([StandardId.Ashrae55])`. The builder rejects duplicate Standard IDs, a
Standard model with no Standard ID, and a Standard declaration without compliance support.
Models that do not belong to a Standard must call `.setStandardIds([])` explicitly.

Standard workspace model lists are derived from `standardIds`. Explore availability is
independent and comes from `workspaceCapabilities.includes(WorkspaceCapability.Explore)`; do not add a
second navigation list. Time-series support is declared separately via `setSimulation()` and must not be mixed into Analysis share snapshots.

Explore requires at least one output with valid numeric SI bands. A Standard-capable model also declares a fixed output, non-empty bands, caption, legend title, and result feedback callback through `setComplianceProfile()`. Standard workspace output and bands always come from `complianceProfile`; Explore uses the selected output and its editable working bands.

The Explore toolbar shows an Output selector only when the selected chart supports more than
one entry. By default this is the model's complete `exploreOutputs` list. A chart that can
render only a subset declares `supportedExploreOutputs` and `defaultExploreOutput` on its
`setOutputCharts` entry; the builder rejects unknown or inconsistent output keys. Use
`allowsBaselineSelection: false` in chart capabilities only when a chart has no meaningful baseline-input comparison.
Single-output charts still expose their threshold editor without rendering a redundant
selector. Chart changes are presentation-only and normalize the selected output to the
chart's declared default without scheduling calculation.

Bands are array ordered and half open: `min <= value < max`. Do not copy a standard boundary into a second numeric source.

PMV ASHRAE/ISO and Adaptive ASHRAE/EN remain separate registered declarations. Never merge standards behind a runtime toggle. Shared family mechanics may be implemented once in focused modules:

- PMV declarations: `pmvAshrae.ts`, `pmvIso.ts`; shared assembly: `pmvShared.ts`; formulas/results: `pmvCalculation.ts`; charts: `pmvCharts.ts` (router), `pmvChartShared.ts`, `pmvPsychrometricChart.ts`, `pmvDynamicChart.ts`.
- Adaptive declarations: `adaptiveAshrae.ts`, `adaptiveEn.ts`; shared assembly: `adaptiveShared.ts`; calculations/results: `adaptiveCalculation.ts`; charts: `adaptiveCharts.ts`.

Each standard declaration must still show all standard-specific decisions.

### Shared presets and grid charts (Round 2)

Reuse shared capabilities before adding bespoke chart or control code:

- **Psychrometric index models** (tdb + rh): `buildPsychrometricIndexModelConfig()` in
  `comfortModels/presets/psychrometricIndexModel.ts` (Humidex / Heat Index pattern).
- **Grid Dynamic charts**: `GridModelChartSpec` + `buildGridModelChart()` in
  `services/comfort/charts/gridModelCharts.ts` for two-axis banded field charts.
  Heat Index / Humidex maps are `ChartKind.DynamicField` with `lockedAxes`.
- **Extended chart sources**: `calculatePerInputWithExtensions()` when `chartSource` needs
  per-input maps beyond `inputs` (PMV comfort zones).
- **Input value presets**: `InputPresetKey` catalog in
  `services/comfort/controls/inputControlPresets.ts` with `setInputFields({ kind: "preset", … })`.
- **Declarative result rows**: `setOutputTable({ layout: TableLayout.CompareMatrix, rows })`; runtime assembly goes through `buildCompareMatrixTable()` in `services/comfort/output/tableResolver.ts`.

Non-grid chart geometry (PMV psychrometric, UTCI stress, PHS exposure history, Adaptive
boundary) is declared through `setOutputCharts()` with the appropriate `ChartKind` (`Custom`,
`BandScalar`, `BoundaryRegion`, `TimeSeriesLine`). Time-series simulation charts use
`ChartKind.TimeSeriesLine` via `setSimulation()`; Analysis field charts use `DynamicField` or
`Custom`, not a separate chart-builder API.

### Shared presets and builder chart registration (Round 3)

Reuse builder registration APIs before wiring charts manually:

- **Outdoor wind index models** (tdb + v): `buildOutdoorWindIndexModelConfig()` in
  `comfortModels/presets/outdoorWindIndexModel.ts` (Wind Chill pattern).
- **Grid dynamic charts**: declare `ChartKind.DynamicField` entries in `setOutputCharts()` with
  `GridModelChartSpec` resolved per profile. The spec may be static or a `(context) => spec`
  factory when band labels depend on presentation context (PHS). Fixed-axis Heat Index /
  Humidex maps also use `DynamicField` with `lockedAxes`.
- **Non-grid charts**: declare the matching kind in `setOutputCharts()` — `ChartKind.Custom`
  (PMV psychrometric), `ChartKind.BandScalar` (UTCI stress), `ChartKind.BoundaryRegion`
  (Adaptive), `ChartKind.TimeSeriesLine` (PHS exposure history). The ChartKind resolver in
  `services/comfort/charts/kinds/` dispatches build logic; do not add controller branches.

### Optional Time-series support

Time-series is a separate product capability. Add a typed
`TimeSeriesModelDefinition<TDraft, TResult>` for editor controls, draft validation, and
asynchronous `simulate()`. Register it in the dedicated Time-series registry; the enabled model
selector and keyed controller records derive from that registry.

Declare simulation **output** (metric-summary table rows and time-series-line charts) on the
unified comfort model config via `setSimulation({ table, charts })`. The Time-series controller
reads summary and chart builders through `getModelSimulationOutput(modelId)` from the comfort
model registry. Do not infer Time-series support from Analysis `workspaceCapabilities` or
`exploreOutputs`, and do not put segment durations or physiological carry state into canonical
Analysis input/share records.

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

`setModifiers()` receives actual `InputModifier` declarations, not IDs. The global catalogue contains only the stable UI/share ID and extra-input schema.

Models with no modifiers call `.setModifiers([])`. Supported modifiers must appear in the fixed global order:

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

All chart output belongs to `setOutputCharts()` with declaration-owned instance ids and typed kind specs. The registry derives those ids from `outputCharts.entries`; do not recreate a second legend/lock array or id tree beside `setOutputCharts()`.

```ts
import { ChartKind } from "../models/output/chartKinds";

builder.setOutputCharts(
  [
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
  { defaultInstanceId: "example-dynamic-field" },
);
```

When a model offers both a dedicated/fixed chart and a Dynamic chart, use the
dedicated chart as `defaultId`. Use Dynamic as the initial default only when the model
has no other chart. This is an explicit declaration convention rather than a Builder
invariant; do not infer the default from chart names at runtime.

Then declare the complete selectable field set and a supported, distinct default pair:

```ts
import { PhysicalQuantityId } from "../models/physicalQuantities";

builder
  .setDynamicAxisFields([
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.RelativeHumidity,
  ])
  .setDefaultDynamicAxes({
    xAxis: PhysicalQuantityId.DryBulbTemperature,
    yAxis: PhysicalQuantityId.RelativeHumidity,
  });
```

Fixed and selectable field charts consume the same active `FieldChartConfig`. Mode, chart, axis, baseline, Explore output/bands, unit, and zone visibility are presentation-only and rebuild from a ready cache without scheduling a calculation.

## 8. Build, register, and test

Set the calculator, result builder, chart builder, complete defaults/parser, axes, and other required declarations, then export the built runtime definition:

```ts
export const exampleModelConfig = builder.build();
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
