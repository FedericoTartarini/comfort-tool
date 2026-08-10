# Adding a thermal model

This is an internal developer guide. A model's product decisions must be readable from one focused declaration entry in `src/comfortModels/`, and adding a model must not introduce a model-specific controller or component branch.

“One declaration entry” is an ownership rule, not a claim that the complete change touches one physical file. Stable IDs remain centralized, registration remains explicit, and tests remain separate. A simple model can keep its declaration, calculation, result rows, and charts in one file. A larger standard family may place formulas and chart construction in focused calculation/chart modules beside the declarations, while each registered declaration still shows its identity, standard, modes, outputs, bands, modifiers, and charts.

For the current runtime boundaries and state flow, see [Frontend structure summary](frontend-structure-summary.md).

## 1. Add stable IDs and shared metadata

Add the serialized model ID to `ComfortModel` and each new chart ID to `ChartId`. Add a `ModelOutputKey` and its unit-presentation metadata only when the model exposes a genuinely new output. Reuse existing constants instead of introducing inline domain strings.

If the model needs a new persisted input, update all canonical declarations:

1. `FieldKey` and `canonicalInputFieldOrder` in `src/models/fieldKeys.ts`;
2. `fieldMetaByKey` in `src/models/inputFieldsMeta.ts`;
3. every input slot in `src/models/inputSlots.ts`.

Do not put derived or chart-only coordinates, such as humidity ratio or operative temperature, into `canonicalInputFieldOrder`. That tuple defines the exact base-SI and share-state input key set.

## 2. Create the declaration entry

Create the registered declaration under `src/comfortModels/`. It must make the following product decisions visible without inspecting the controller:

- stable identity, label, and description;
- controls, option handlers, complete default options, and an exact parser;
- request mapping and calculation;
- result rows and charts;
- declaration-local `ThermalZone` values and derived bands;
- supported Compliance/Explore modes and chartable outputs;
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
interface ExampleRequest {
  tdb: number;
  rh: number;
}

const fieldAdapter = createFieldRequestAdapter<ExampleRequest>({
  tdb: FieldKey.DryBulbTemperature,
  rh: FieldKey.RelativeHumidity,
});
```

Use `fieldAdapter.mapRequest` for `calculatePerInput()` and its `getAxisValue`/`setAxisValue` operations for ordinary chart axes.

If a selectable chart exposes an alias or operative temperature, compose the field adapter once with `createRequestAxisAdapter()`. Declare only the alias, explicit operative-temperature get/set/range behavior, and any standard-specific component ranges. The shared dynamic-axis solver remains responsible for coupled Air/Radiant/Operative coordinate pairs. Do not add another hand-written axis switch.

All requests, chart coordinates, calculations, and band edges are canonical SI.

## 4. Declare controls and exact options

Use the shared control behaviors according to capability:

- `createControlBehavior()` for ordinary numeric canonical fields;
- `createAirSpeedControlBehavior()` when the shared air-speed menu is required;
- `createOperativeTemperatureControlBehavior()` only when the model explicitly supports Air/Operative temperature modes;
- `createHumidityControlBehavior()` only when the model exposes the shared humidity modes.

Control behaviors construct view models and apply numeric input only. Model `optionHandlersByKey` is the sole option-change path.

Models without options must declare `{}` and `parseEmptyOptions`. Other models must declare a complete default object and an exact parser that rejects missing, extra, or invalid values. Invalid internal option state is an invariant error, not a reason to fill defaults.

The calculation manager runs that parser once at the model boundary. `ModelCalculationContext.options` then contains only the active model's validated options; the keyed `modelOptionsByModel` record remains controller/share state and is not exposed to model calculations.

## 5. Declare modes, outputs, and Compliance

Every declaration explicitly sets modes and chartable outputs:

```ts
builder
  .setModes([ChartMode.Explore])
  .setChartableOutputs([output]);
```

Explore requires at least one output with valid numeric SI bands. A Compliance-capable model also declares a fixed output, non-empty bands, caption, legend title, and result feedback callback. Compliance output and bands always come from `complianceSpec`; Explore uses the selected output and its editable working bands.

Bands are array ordered and half open: `min <= value < max`. Do not copy a standard boundary into a second numeric source.

PMV ASHRAE/ISO and Adaptive ASHRAE/EN remain separate registered declarations. Never merge standards behind a runtime toggle. Shared family mechanics may be implemented once in focused modules:

- PMV declarations: `pmvAshrae.ts`, `pmvIso.ts`; shared assembly: `pmvShared.ts`; formulas/results: `pmvCalculation.ts`; charts: `pmvCharts.ts`.
- Adaptive declarations: `adaptiveAshrae.ts`, `adaptiveEn.ts`; shared assembly: `adaptiveShared.ts`; calculations/results: `adaptiveCalculation.ts`; charts: `adaptiveCharts.ts`.

Each standard declaration must still show all standard-specific decisions.

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

## 7. Declare model-owned charts

All chart presentation capability belongs to one `setCharts()` declaration:

```ts
builder.setCharts({
  defaultId: ChartId.ExampleDynamic,
  entries: [
    {
      id: ChartId.ExampleDynamic,
      name: "Dynamic",
      emptyMessage: "No dynamic chart yet.",
      allowsAxisSelection: true,
      locksYAxis: false,
      showsZoneToggle: false,
      showsLegend: true,
    },
  ],
});
```

Then declare the complete selectable field set and a supported, distinct default pair:

```ts
builder
  .setDynamicAxisFields([
    FieldKey.DryBulbTemperature,
    FieldKey.RelativeHumidity,
  ])
  .setDefaultDynamicAxes({
    xAxis: FieldKey.DryBulbTemperature,
    yAxis: FieldKey.RelativeHumidity,
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
- SI/IP presentation and strict share-version-1 round trips/rejection;
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
