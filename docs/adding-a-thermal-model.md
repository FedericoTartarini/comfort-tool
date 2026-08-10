# Adding a New Thermal Model to the Comfort Tool

This guide walks you through every step required to add a new thermal comfort model to the application. Follow the steps in order — each step builds on the previous one.

The architecture is **config-driven**: new models are added by registering a self-contained configuration object. A model file in `src/comfortModels/` is the single source of truth for all model-specific logic.

> **Reference models** — use these existing models as concrete examples while reading this guide:
> - `src/comfortModels/heatIndex.ts` — simple 2-input model with fixed-axis and Explore views
> - `src/comfortModels/humidex.ts` — simple 2-input model with fixed-axis and Explore views
> - `src/comfortModels/windChill.ts` — model with a custom unit (W/m²) and a cold-stress domain

---

## Overview of the Steps

1. [Register the model ID in `comfortModels.ts`](#step-1-register-the-model-id)
2. [Register chart IDs in `chartOptions.ts`](#step-2-register-chart-ids)
3. [Create the model file in `src/comfortModels/`](#step-3-create-the-model-file)
   - [3a. Define thermal zones](#3a-define-thermal-zones)
   - [3b. Define domain constants](#3b-define-domain-constants)
   - [3c. Define DTOs (request/response types)](#3c-define-dtos)
   - [3d. Write the calculation function](#3d-write-the-calculation-function)
   - [3e. Write the calculation-context-to-request extractor](#3e-write-the-calculation-context-to-request-extractor)
   - [3f. Build the model configuration](#3f-build-the-model-configuration)
   - [3g. Export the config](#3g-export-the-config)
4. [Register the model in the model registry](#step-4-register-in-the-model-registry)
5. [Write tests](#step-5-write-tests)
6. [Verify](#step-6-verify)

---

## Step 1: Register the Model ID

**File:** `src/models/comfortModels.ts`

Add a new entry to the `ComfortModel` constant object. Use a stable, descriptive `SCREAMING_SNAKE_CASE` string as the value — this is what gets serialized into URLs and state, so never change it after release.

```ts
export const ComfortModel = {
  // ... existing models ...
  MyNewModel: "MY_NEW_MODEL",  // ← add this
} as const;
```

Declare the model-selection label and description in the registered model definition created in Step 3. The registry derives `comfortModelMetaById` from those definitions, so model metadata has one owner.

If the model exposes a new calculated output, add its stable key to `ModelOutputKey` in `src/models/modelCapabilities.ts`. Reuse an existing key when the output already exists; never use an inline output string in a declaration.

> **Why here?** `src/models/` owns the stable serialized identifier. The model declaration owns its human-facing metadata and capabilities.

---

## Step 2: Register Chart IDs

**File:** `src/models/chartOptions.ts`

Add one or more entries to the `ChartId` constant — one per chart your model will expose. Use descriptive `PascalCase` keys.

```ts
export const ChartId = {
  // ... existing chart IDs ...
  MyNewModelRanges:  "myNewModelRanges",   // e.g., fixed-axis psychrometric-style chart
  MyNewModelDynamic: "myNewModelDynamic",  // e.g., dynamic two-axis contour chart
} as const;
```

Then add a `ChartMetadata` entry for each chart ID in `chartMetaById`:

```ts
export const chartMetaById: Record<ChartId, ChartMetadata> = {
  // ... existing entries ...
  [ChartId.MyNewModelRanges]: {
    name: "Ranges",
    emptyMessage: "No ranges chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
    supportsAxisSelection: false,
  },
  [ChartId.MyNewModelDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
    supportsAxisSelection: true,
    supportsTemperatureInputMenu: true, // only when the chart supports it
    hasZoneVisibilityToggle: true,       // only when the chart has zone traces
  },
};
```

> **`supportsAxisSelection: true`** tells the UI to render the axis-selector dropdowns. The chart name and ID do not control this behavior.

---

## Step 3: Create the Model File

Create a new file: `src/comfortModels/myNewModel.ts`

The file is structured into these logical sections, in order:

### 3a. Define Thermal Zones

Zones partition the model's output range into named risk or comfort categories. Each zone is a `ThermalZone` instance.

```ts
import { ThermalZone } from "../models/thermalZone";

export const myNewModelZonesList = [
  new ThermalZone({ label: "Safe",    max: 20,  color: "#e2e8f0", textColor: "#475569" }),
  new ThermalZone({ label: "Caution", min: 20, max: 35,  color: "#fef08a", textColor: "#854d0e" }),
  new ThermalZone({ label: "Danger",  min: 35,           color: "#dc2626", textColor: "#b91c1c" }),
];
```

**Rules:**
- Boundaries appear **exactly once** as constructor arguments — do not also define them as separate constants.
- Leave `min` off the first zone (defaults to `-Infinity`) and `max` off the last (defaults to `+Infinity`).
- `color` is a hex color used by the Plotly chart. `textColor` is used by the results panel.
- `id` and `cssClass` are auto-derived from `label` if omitted (e.g., `"Extreme Caution"` → `"extreme-caution"`).
- For string-category matching (like UTCI), pass a `category` field that matches the library's output string.

### 3b. Define Domain Constants

Define the valid input ranges for this model and any other constants you need.

```ts
// Temperature range valid for this model (in °C, SI).
const TDB_LIMITS = { min: 15, max: 45 };

```

> **Always use SI units** for domain constants. The chart and conversion layers convert to the display unit system automatically.

### 3c. Define DTOs

Define TypeScript interfaces for the calculation request and response. These are plain data containers with no logic.

```ts
import { FieldKey } from "../models/fieldKeys";
import { CalculationSource } from "../models/calculationMetadata";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { ModelChartSourceDto } from "../models/comfortDtos";

export interface MyNewModelRequestDto {
  tdb: number;  // dry-bulb temperature in SI (°C)
  rh:  number;  // relative humidity (%)
}

export interface MyNewModelResponseDto {
  index: number;        // the computed index value, stored in SI
  category: string;     // zone label, e.g. "Danger"
  source: CalculationSource;
}

```

**Key points:**
- `RequestDto` contains effective SI values supplied through the shared calculation boundary.
- `ResponseDto` stores computed results in SI. The results panel converts to display units when rendering.
- Use `ModelChartSourceDto<MyNewModelRequestDto>` directly when the chart source only contains per-input requests. Extend it only when a model owns additional calculation-derived chart data, as PMV does for comfort zones.
- Chart sources carry calculation-derived data only. Explore axes, selected output, and working bands arrive separately as `FieldChartConfig`, so cached model calculations remain reusable when chart presentation changes.
- Model calculators and request DTOs are SI-only. `UnitSystem` belongs in display/chart context and conversion services, not in model requests.

### 3d. Write the Calculation Function

This is a pure function that takes a `RequestDto` and returns a `ResponseDto`. Keep all formula logic here.

```ts
export function calculateMyNewModel(payload: MyNewModelRequestDto): MyNewModelResponseDto {
  // 1. Run the formula (via jsthermalcomfort or your own implementation).
  //    jsthermalcomfort imports are ONLY allowed inside src/comfortModels/ and src/services/comfort/**.
  const rawResult = someLibraryFunction(payload.tdb, payload.rh);

  // 2. Resolve the result to a zone.
  const zone = myNewModelZonesList.find((z) => z.contains(rawResult.index));
  const category = zone ? zone.label : myNewModelZonesList[0].label;

  // 3. Return the structured result in SI.
  return {
    index: rawResult.index,
    category,
    source: CalculationSource.JsThermalComfort,
  };
}
```

**Rules:**
- All `jsthermalcomfort` imports stay inside `src/comfortModels/` or `src/services/comfort/**`. Never import them from state, components, or top-level service files.
- The returned index value must be in SI units. The results panel will convert for display.
- Use `CalculationSource.FrontendGenerated` if you implement the formula yourself without the library.

### 3e. Write the Calculation-Context-to-Request Extractor

This private function reads from the model calculation boundary and produces a `RequestDto` for one input slot. Models receive only canonical-SI inputs and model options; they do not receive controller or UI state.

```ts
import type { ModelCalculationContext } from "../models/modelCalculation";

function toMyNewModelRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
): MyNewModelRequestDto {
  const inputs = context.inputsByInput[inputId];
  return {
    tdb: Number(inputs[FieldKey.DryBulbTemperature]),
    rh:  Number(inputs[FieldKey.RelativeHumidity]),
  };
}
```

> The `context.inputsByInput` record contains all effective field values **already in SI**. The controller has applied the model's declared modifier chain before this boundary. Read model options from `context.modelOptionsByModel` when needed; do not import controller or modifier state types into a comfort model.

### 3f. Build the Model Configuration

Use `ComfortModelBuilder` to compose all the pieces. This is a fluent API where each method registers a specific part of the model.

```ts
import { ComfortModelBuilder, parseEmptyOptions, createEmptyResults, buildResultSection }
  from "../state/comfortTool/modelConfigs/builder";
import { ComfortModel } from "../models/comfortModels";
import { ChartId } from "../models/chartOptions";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
import { bandsFromThermalZones, ChartMode, ModelOutputKey, type ModelOutput } from "../models/modelCapabilities";
import { createControlBehavior } from "../services/comfort/controls/controlBehaviors";
import {
  buildGridModelChart,
  type GridModelChartSpec,
} from "../services/comfort/charts/gridModelCharts";
import { convertModelOutputFromSi, formatDisplayValue, getModelOutputDisplayMeta } from "../services/units";

const myNewModelBuilder = new ComfortModelBuilder<
  MyNewModelResponseDto,
  ModelChartSourceDto<MyNewModelRequestDto>
>(
  ComfortModel.MyNewModel
);

const MODEL_LABEL = "My New Model";
const MODEL_DESCRIPTION = "A short description shown in the model selector dropdown.";
```

#### Label and Description

```ts
myNewModelBuilder
  .setLabel(MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION);
```

#### Capability Declaration (Required)

Every model must explicitly declare its supported chart modes, chartable outputs, and input modifiers. For an Explore-only model whose preset bands are its existing zones:

```ts
const myNewModelOutput: ModelOutput = {
  key: ModelOutputKey.MyNewModelIndex,
  label: "My New Model Index",
  legendTitle: "My New Model Bands", // Optional; defaults to label.
  defaultBands: bandsFromThermalZones(myNewModelZonesList),
};

myNewModelBuilder
  .setModes([ChartMode.Explore])
  .setChartableOutputs([myNewModelOutput])
  .setModifiers([]);
```

For a standards-based model, include Compliance mode and fixed bands. Band edges may be numeric SI values or functions of a semantic boundary value and a readonly partial canonical-SI `BandInputsSi` map containing only the baseline inputs the edge requires:

```ts
function formatMyNewModelComplianceFeedback(result: MyNewModelResponseDto) {
  const passes = result.isCompliant;
  return { text: passes ? "Compliant" : "Non-compliant", passes };
}

myNewModelBuilder
  .setModes([ChartMode.Compliance, ChartMode.Explore])
  .setChartableOutputs([/* one or more ModelOutput declarations */])
  .setModifiers([])
  .setComplianceSpec({
    output: ModelOutputKey.MyNewModelIndex,
    bands: fixedStandardBands,
    caption: "My Standard compliance limits are locked for this chart.",
    getFeedback: formatMyNewModelComplianceFeedback,
  });
```

A compliance-only model must still call `setChartableOutputs([])` explicitly. Every model must also call `setModifiers(...)`: use `[]` when none apply, or use centralized `ModifierId` values from `src/models/inputModifiers.ts` in the exact order they should be applied. `getFeedback(result)` returns `{ text, passes }`; use the same family-level formatter for the result table's Compliance row so chart feedback and tabular status cannot drift. `build()` rejects missing mode, output, or modifier declarations, duplicate or unknown modifier IDs, Explore with no outputs, empty or malformed numeric Explore presets, unsorted or overlapping presets, Compliance without non-empty fixed bands, caption, or feedback callback, a compliance spec on a non-Compliance model, duplicate modes or output keys, incomplete label/description/chart declarations, missing calculation or presentation functions, and invalid dynamic-axis defaults. A successful build returns a validated configuration snapshot with copied arrays and records. Explore presets may touch or leave gaps; finite boundaries remain canonical SI.

`ComplianceSpec<TBand, TResult>` carries both the Compliance band type and model result type into the chart context and feedback callback. `ComfortModelBuilder` defaults to `NumericBand`; a functional model supplies `Band` as its third generic argument, as Adaptive does. PMV therefore receives `ChartBuildContext<NumericBand>` at compile time and enters the shared numeric grid strategy without a cast.

Band membership is always array-ordered and half-open: `min <= value < max`. Use `findNumericBandIndexForValue()` for numeric bands and `resolveBandEdge()` inside functional-boundary infrastructure instead of introducing another boundary convention. The classified value, numeric edges, functional boundary value, and `bandInputsSi` are canonical SI; `NaN`, gaps, and unmatched chart values resolve to no classification. Model result classification must use `requireThermalZone()`: a non-finite or unmatched result is invalid and must throw rather than silently falling back to Neutral or the first zone. Adaptive functional edges always receive canonical-SI outdoor temperature even after the chart is transposed. A functional boundary renderer additionally rejects an edge that resolves to `NaN`, a reversed band, or sampled overlap.

`bandsFromThermalZones()` copies each zone's real `min`, `max`, `label`, and `color`, keeping thresholds single-sourced. Set the optional `legendTitle` only when the legend heading should differ from the output selector label. Adaptive-style functional compliance bands should create each internal edge function once, reuse it as the adjacent bands' shared `max`/`min`, validate required `BandInputsSi`, and call the model's existing boundary function rather than restating its equations. PMV ASHRAE and PMV ISO remain separate declarations and band arrays; the ISO model is explicitly ISO 7730 Category B, whose `[-0.5, 0.5)` acceptable range intentionally matches the ASHRAE declaration numerically.

#### Input Controls

Each `addControl` call registers one input row in the sidebar. Use the predefined `InputControlId` values and the corresponding `createControlBehavior` helper.

```ts
myNewModelBuilder.addControl({
  id: InputControlId.Temperature,
  behavior: createControlBehavior({
    controlId: InputControlId.Temperature,
    fieldKey: FieldKey.DryBulbTemperature,
    minValue: TDB_LIMITS.min,   // overrides the global field default
    maxValue: TDB_LIMITS.max,
  }),
});

myNewModelBuilder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
    // no min/max override = use global field defaults
  }),
});
```

**Available `InputControlId` values** (from `src/models/inputControls.ts`):
- `Temperature` — dry-bulb temperature
- `RadiantTemperature` — mean radiant temperature
- `AirSpeed` — relative air speed
- `WindSpeed` — wind speed
- `Humidity` — relative humidity
- `MetabolicRate` — metabolic rate
- `ClothingInsulation` — clothing insulation
- `PrevailingMeanOutdoorTemperature` — mean outdoor temperature (adaptive models)

For temperature controls that support Operative Temperature mode, use `createTemperatureControlBehavior` instead of `createControlBehavior`. PMV uses `createAirSpeedControlBehavior` for its base relative-air-speed row and optional occupant-control menu. Measured air speed is an `InputModifier`, not an input mode.

#### Calculator

The calculator runs for every input slot that is visible and produces `resultsByInput` (one result per slot) plus a `chartSource` payload.

```ts
myNewModelBuilder.setCalculator((context, visibleInputIds) => {
  const resultsByInput = createEmptyResults<MyNewModelResponseDto>();
  const inputs: ModelChartSourceDto<MyNewModelRequestDto>["inputs"] = {};

  visibleInputIds.forEach((inputId) => {
    const request = toMyNewModelRequest(context, inputId);
    resultsByInput[inputId] = calculateMyNewModel(request);
    inputs[inputId] = request;
  });

  return {
    resultsByInput,
    chartSource: { inputs },
  };
});
```

#### Result Builder

The result builder transforms raw `ResponseDto` objects into `ResultSectionViewModel[]` for the results panel. Use `buildResultSection` for each row in the table.

```ts
myNewModelBuilder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  return [
    buildResultSection(
      "My New Model Index",   // section heading
      results,
      visibleInputIds,
      (result) => {
        const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.MyNewModelIndex, unitSystem);
        const displayValue = convertModelOutputFromSi(
          ModelOutputKey.MyNewModelIndex,
          result.index,
          unitSystem,
        );
        const formattedValue = formatDisplayValue(displayValue, outputMeta.decimals);

        // Find the zone for text color.
        const zone = myNewModelZonesList.find((z) => z.contains(result.index));
        const color = zone ? zone.textColor : "";

        return {
          text: `${formattedValue} ${outputMeta.displayUnits}`, // primary result value
          subtext: result.category,             // zone label shown below
          color,                                // text color from zone
        };
      }
    ),
  ];
});
```

> Use multiple `buildResultSection(...)` calls inside the returned array to produce multiple rows (e.g., Wind Chill shows both "Index" and "Temperature").

#### Chart Builder

The chart builder produces Plotly chart data. Simple grid models use the typed `buildGridModelChart` strategy from `src/services/comfort/charts/gridModelCharts.ts`. The model declares how its payload maps to fields and how it is evaluated; the shared strategy owns baseline cloning, field-config narrowing, grid assembly, band assignment, and display conversion.

```ts
function getMyNewModelAxisValue(
  payload: MyNewModelRequestDto,
  field: FieldKey,
): number {
  switch (field) {
    case FieldKey.DryBulbTemperature:
      return payload.tdb;
    case FieldKey.RelativeHumidity:
      return payload.rh;
    default:
      throw new Error(`Unsupported My New Model chart field: ${field}`);
  }
}

function setMyNewModelAxisValue(
  payload: MyNewModelRequestDto,
  field: FieldKey,
  valueSi: number,
): void {
  switch (field) {
    case FieldKey.DryBulbTemperature:
      payload.tdb = valueSi;
      return;
    case FieldKey.RelativeHumidity:
      payload.rh = valueSi;
      return;
    default:
      throw new Error(`Unsupported My New Model chart field: ${field}`);
  }
}

myNewModelBuilder.setChartBuilder((chartId, chartSource, resultsByInput, context) => {
  const chartSpec: GridModelChartSpec<
    MyNewModelRequestDto,
    MyNewModelResponseDto
  > = {
    dynamicChartId: ChartId.MyNewModelDynamic,
    dynamicTitle: `${MODEL_LABEL} Dynamic Chart`,
    output: myNewModelOutput,
    axisRanges: {
      [FieldKey.DryBulbTemperature]: TDB_LIMITS,
    },
    getAxisValue: getMyNewModelAxisValue,
    setAxisValue: setMyNewModelAxisValue,
    evaluate: calculateMyNewModel,
    getOutputValue: (result) => result.index,

    // A fixed-axis view locks only its axes and ranges. It still consumes the
    // active mode's output and bands from context.fieldChartConfig.
    fixedView: {
      chartId: ChartId.MyNewModelRanges,
      title: `${MODEL_LABEL} Ranges`,
      xField: FieldKey.RelativeHumidity,
      yField: FieldKey.DryBulbTemperature,
      xRangeSi: {
        min: fieldMetaByKey[FieldKey.RelativeHumidity].minValue,
        max: fieldMetaByKey[FieldKey.RelativeHumidity].maxValue,
      },
      yRangeSi: TDB_LIMITS,
    },
  };

  return buildGridModelChart(
    chartId,
    chartSource,
    resultsByInput,
    context,
    chartSpec,
  );
});
```

For a selectable functional-boundary chart, pass the declared Compliance bands and only their required cached baseline inputs to `createBoundaryRegionStrategy()`. The model may add canonical-SI boundary samples around genuine discontinuities, but it must not precompute boundary curves, solve an inverse axis, assemble polygons, or attach hover metadata to region geometry:

```ts
const baseline = getBaselineInputEntry(
  chartSource.inputs,
  context.baselineInputId,
);
const boundaryAxis = context.fieldChartConfig.xField === OUTDOOR_FIELD
  ? "x"
  : "y";

return buildFieldChart({
  unitSystem: context.unitSystem,
  xAxis: boundaryAxis === "x" ? outdoorAxisSpec : operativeAxisSpec,
  yAxis: boundaryAxis === "x" ? operativeAxisSpec : outdoorAxisSpec,
  strategy: createBoundaryRegionStrategy({
    bands: context.fieldChartConfig.bands,
    bandInputsSi: {
      [FieldKey.RelativeAirSpeed]: baseline.payload.v,
    },
    style: { lineColor: "#334155" },
    boundaryAxis,
    additionalBoundaryValuesSi: () => getDiscontinuitySamplesSi(baseline.payload),
  }),
  chartOverlays: ({ xAxis, yAxis }) => [
    buildSharedTooltipOverlay(xAxis, yAxis),
  ],
  inputGroups: ({ xAxis, yAxis }) => [
    buildCachedInputGroup(chartSource, resultsByInput, xAxis, yAxis),
  ],
  layout: CHART_LAYOUT,
  source: CalculationSource.FrontendGenerated,
});
```

`boundaryAxis: "x"` produces outdoor-X/operative-Y geometry; `"y"` transposes that same geometry to operative-X/outdoor-Y. Functional edges receive outdoor temperature in both directions. The boundary engine samples the outdoor axis, merges extra samples, resolves and validates every edge, clamps to the operative range, converts both axes, and emits filled regions in declaration order with `hoverinfo: "skip"`. A separate transparent tooltip grid is the only per-point evaluator and hover source. `buildFieldChart()` preserves region → tooltip overlay → input overlay → input marker order. Adaptive ASHRAE and EN are the reference implementation: each exposes only `ChartId.Adaptive`, declares exactly outdoor and operative temperature as interchangeable axes, and resolves air-speed-dependent regions from the selected request in the ready chart-source cache.

The controller builds one `ChartBuildContext` containing the unit system, effective baseline input, and a required valid `FieldChartConfig`; axes come only from `fieldChartConfig.xField/yField`. Every chart receives that same current-mode config. Compliance takes `zOutput` and bands directly from the registered `complianceSpec`; Explore uses the selected output and an independent working copy. A fixed view overrides only its declared x/y fields and ranges inside the builder, so it still consumes the current mode, output, bands, baseline, caption, feedback, and legend. The UI exposes axes when chart metadata sets `supportsAxisSelection`, shows Display and Thresholds only for Explore, and keeps Compliance constrained. Builder setters retain declarations; `build()` validates and copies the final snapshot once. Explore bands are cloned only when initialized, when output changes, or when an edit is accepted. State construction and chart builders consume those trusted values without repeating mode, axis, output, or band-equality checks. Mode, chart, axis, baseline, output, band, and unit changes rebuild presentation from the ready cache; they do not invalidate or schedule calculations.

Compliance captions must state the rendered colors, governing range/category, and any conditional adjustment. The presentation selector deduplicates legend entries by the ordered `label + color` pair only; the geometry retains every declared band, including repeated labels on opposite sides of a nested comfort region. `ChartLegend` only renders the selected entries. Caption and baseline feedback appear on one explanation line, using `Your input: …` outside compare mode and `Input N: …` in compare mode.

The controller initializes `chartSettingsByModel` for every registered model. Compliance is the default whenever declared; otherwise Explore is the default. Each record independently remembers mode, x/y axes, baseline, and optional Explore z/bands across model and chart switches. A remembered baseline that is currently hidden resolves to Input 1 without being erased. Strict `version: 1` share snapshots store these settings inside each model entry, omit Compliance bands, encode unbounded Explore edges with wire sentinels, and reject unknown versions, fields, current chart IDs, options, and invalid values. Compare IDs must be unique, in canonical order, include Input 1, and agree with compare mode and the active input. A validated snapshot is applied exactly; import never normalizes or repairs it.

If a model exposes Air, Radiant, and Operative temperature together, keep the four directed component/operative pairs available. Use the shared `applyDynamicAxisCoordinates()` helper with a `DynamicAxisPayloadAdapter` that implements both `getAxisValue` and `setAxisValue`. The current solver contract is linear: it evaluates the lower and upper component bounds once, interpolates the target component, validates the post-condition, and rejects non-finite, zero-slope, or out-of-range results. Endpoint probes restore the temperature component in `finally`; a successful solve commits it once, while a failed final commit rolls back that solved field. The independently selected other axis must remain unchanged. Create the adapter once outside the grid loop.

The shared banded-grid runner uses categorical rendering by default. A model with a continuous output and a deliberately low-resolution grid may explicitly select `GridBandRenderStrategy.ConstraintContours`; this keeps the raw SI output grid and interpolates constraint boundaries at the working-band thresholds. Categorical and constraint traces only render visible fills and boundaries, with hover disabled. One transparent contour tooltip trace uses the original output grid, classification text, and metadata for both renderers. A finite value outside every band remains visibly unfilled but hovers as `Unclassified`; a model-invalid `NaN` cell remains unfilled and has no hover because `hoverongaps` is false. Constraint values stay in SI even when chart coordinates are displayed in IP units, and unbounded band edges must not be serialized into Plotly DTOs.

If a typed grid model's hover needs another result field, set `dynamicHoverExtension` with a template suffix and typed `getMetadata(result)` callback. A model using the engine directly may instead return `{ valueSi, additionalHoverMetadata }` from the evaluator passed to `createBandedGridStrategy()` and provide `hoverTemplate` when model-specific ordering or precision is required. Functional boundary charts use `createBoundaryRegionStrategy()`; reserve a raw `{ kind: "boundary", buildTraces }` strategy for non-band geometry that the factory cannot express. Models declare canonical-SI axis specs, ranges, margins, hover metadata, and evaluators; the frame creates axes and owns layout, input overlays, markers, legends, annotations, and trace ordering. The selected display output remains `customdata[0]`, and additional metadata starts at index 1. Keep raw outputs canonical SI, convert presentation-only metadata through `src/services/units/`, and preserve the same metadata order for grid and cached-input results.

#### Final Builder Registrations

Register chart metadata, dynamic axis fields, zone legend, and default options:

```ts
// Which chart is shown by default, and which charts are available in the selector.
myNewModelBuilder.setDefaultChart(
  ChartId.MyNewModelDynamic,                             // default chart
  [ChartId.MyNewModelRanges, ChartId.MyNewModelDynamic]  // all available charts
);

// Field keys available for the dynamic chart's X and Y axis dropdowns.
myNewModelBuilder.setDynamicAxisFields([
  FieldKey.DryBulbTemperature,
  FieldKey.RelativeHumidity,
]);

// Semantically meaningful axes used to seed this model's independent settings.
myNewModelBuilder.setDefaultDynamicAxes({
  xAxis: FieldKey.DryBulbTemperature,
  yAxis: FieldKey.RelativeHumidity,
});

// Default model options (leave empty for simple models with no advanced options).
myNewModelBuilder.setDefaultOptions({});
myNewModelBuilder.setOptionParser(parseEmptyOptions);

// Zone definitions (used by the legend and the chart engine).
myNewModelBuilder.setZones(myNewModelZonesList);

// Which charts show the zone legend.
myNewModelBuilder.setLegendChartIds([ChartId.MyNewModelRanges, ChartId.MyNewModelDynamic]);
myNewModelBuilder.setLegendTitle("My New Model");

// Which dynamic charts should lock the Y-axis (prevents axis flipping).
myNewModelBuilder.setLockYAxisChartIds([ChartId.MyNewModelDynamic]);
```

`defaultDynamicAxes` is required. Both fields must be distinct members of `dynamicAxisFields`; `build()` rejects invalid defaults. Runtime axis selection applies the same two rules and swaps X/Y when the user selects the field currently used by the other axis.

### 3g. Export the Config

```ts
export const myNewModelConfig = myNewModelBuilder.build();
```

---

## Step 4: Register in the Model Registry

**File:** `src/state/comfortTool/modelConfigs/index.ts`

Add an import for your new config and add it to the `comfortModelConfigs` registry object.

```ts
// At the top of the file, with the other model imports:
import { myNewModelConfig } from "../../../comfortModels/myNewModel";

// Inside comfortModelConfigs:
export const comfortModelConfigs = {
  [ComfortModel.PmvAshrae]:     pmvAshraeModelConfig,
  [ComfortModel.PmvIso]:        pmvIsoModelConfig,
  [ComfortModel.Utci]:          utciModelConfig,
  [ComfortModel.AdaptiveAshrae]: adaptiveAshraeModelConfig,
  [ComfortModel.AdaptiveEn]:    adaptiveEnModelConfig,
  [ComfortModel.HeatIndex]:     heatIndexModelConfig,
  [ComfortModel.Humidex]:       humidexModelConfig,
  [ComfortModel.WindChill]:     windChillModelConfig,
  [ComfortModel.MyNewModel]:    myNewModelConfig,  // ← add this
} as const;
```

The registry drives:
- The model selector dropdown order
- The `comfortModelOrder` array
- The `getComfortModelConfig(modelId)` lookup used by the state controller

---

## Step 5: Write Tests

Create a test file alongside your model file: **`src/comfortModels/myNewModel.test.ts`**

Test at minimum:
1. A known-good calculation produces the expected index value and zone category.
2. Edge cases at zone boundaries behave correctly.
3. SI reference values for the calculator, plus SI/IP conversion at the result and chart presentation boundary.
4. The registered capability declaration has the intended modes, output keys, preset bands, and compliance bands.
5. The model explicitly declares the intended modifier IDs, or an empty list.
6. Every declared Explore output can drive the selectable-axis grid from raw canonical values and working bands.
7. Fixed-axis and selectable-axis views consume the same trusted mode/output/bands while preserving ready-cache identity.

```ts
import { describe, it, expect } from "vitest";
import { calculateMyNewModel } from "./myNewModel";

describe("myNewModel service", () => {
  it("returns correct index and category for a high-heat scenario", () => {
    const result = calculateMyNewModel({ tdb: 38, rh: 75 });
    expect(result.index).toBeGreaterThan(35);
    expect(result.category).toBe("Danger");
    expect(result.source).toBeTruthy();
  });

  it("classifies mild conditions as Safe", () => {
    const result = calculateMyNewModel({ tdb: 22, rh: 40 });
    expect(result.category).toBe("Safe");
  });
});
```

Run the test suite:

```bash
npm test
```

Or run only your new test file:

```bash
npx vitest run src/comfortModels/myNewModel.test.ts
```

---

## Step 6: Verify

Run all validation commands before considering the work done:

```bash
npm run lint
npm run check
npm test
npm run build
npm run test:visual
```

### Done Criteria Checklist

Before marking the work complete, verify all of the following:

- [ ] `npm test` passes with no failures
- [ ] `npm run lint` and `npm run check` pass with no errors or warnings
- [ ] `npm run build` produces no TypeScript or Vite errors
- [ ] `npm run test:visual` preserves fixed-chart and Explore interaction behavior
- [ ] The new model appears in the model selector dropdown with the correct label and description
- [ ] Switching to the new model shows the correct input controls in the sidebar
- [ ] Results are calculated and displayed correctly when inputs change
- [ ] The chart(s) render correctly in both SI and IP unit modes
- [ ] The zone legend appears on the correct charts
- [ ] Selectable-axis charts expose dropdowns containing only the declared fields
- [ ] The declared default dynamic axes are valid and semantically meaningful for the model
- [ ] The Explore Display selector contains only declared outputs and each output uses its own default working-band copy
- [ ] The model explicitly declares supported modifiers with centralized IDs, or `[]` when none apply
- [ ] Output conversions and finite threshold edits round-trip through `src/services/units/` in SI and IP
- [ ] SI remains the canonical internal unit — no raw display-unit values are stored in state
- [ ] No new `jsthermalcomfort` imports were added outside `src/comfortModels/` or `src/services/comfort/**`
- [ ] No new model IDs, chart IDs, field IDs, or compare-input IDs are raw strings — they all use constants from `src/models/`
- [ ] No new hardcoded branches for the new model were added to the state controller (`createComfortToolState.svelte.ts`)
- [ ] Zone boundaries appear exactly once (in the `ThermalZone` constructors)

---

## Frequently Asked Questions

### What if my model needs an input field that doesn't exist yet?

Add a new entry to:
1. `FieldKey` in `src/models/fieldKeys.ts`
2. `fieldMetaByKey` in `src/models/inputFieldsMeta.ts` (label, units, default, min, max, step, decimals)
3. `inputDefaultsById` in `src/models/inputSlots.ts` (default value per input slot)
4. `allFieldOrder` in `src/models/inputFieldsMeta.ts` (display order in the panel)

Then add a new `InputControlId` entry to `src/models/inputControls.ts` and implement a `createControlBehavior(...)` call for it in your model file.

For unit conversion, add any new output presentation to the exhaustive registry in `src/services/units/modelOutputs.ts`. Result builders, chart hover text, and the threshold editor must reuse that registry; do not add model-local conversion factors. Field conversions continue to use the other helpers under `src/services/units/`.

### What if my model uses string categories instead of numeric ranges?

Pass a `category` string to the `ThermalZone` constructor only when the model truly has a stable categorical output. The `z.contains(value)` method accepts strings and matches `category` (case-insensitive) or `label`. Models with a numeric index, including UTCI, must classify from that numeric value and the zones' half-open intervals so results and hover cannot diverge.

### What if my model needs an advanced option menu (like PMV's humidity mode)?

1. Add a new `OptionKey` in `src/models/inputModes.ts`.
2. Add a corresponding entry in `src/models/controlMenuMeta.ts` with the menu items.
3. Use `addOptionHandler(optionKey, handler)` on the builder to register the logic that applies when the option changes.
4. Use `getMenu: (context) => ...` in your `createControlBehavior(...)` config to render the menu caret.
5. Use `setDefaultOptions({ [OptionKey.MyOption]: defaultValue })` and `setOptionParser(...)` with an exact-key parser. It must reject non-objects, missing or unknown keys, and invalid enum values by returning `null`; it must not fill defaults or discard unknown data.

### What if my model has no fixed-axis chart and only a dynamic chart?

Omit the `fixedView` property from `GridModelChartSpec` and set your default chart to the dynamic chart ID:

```ts
myNewModelBuilder.setDefaultChart(
  ChartId.MyNewModelDynamic,
  [ChartId.MyNewModelDynamic]
);
```

(This is what `windChill.ts` does.)

### What if my model supports an existing input modifier?

Import the centralized `ModifierId` and list it in `setModifiers(...)` in application order.
No controller or component branch is needed: the controller derives effective SI inputs
before constructing `ModelCalculationContext`, and the generic input panel renders the
modifier automatically. Use `setModifiers([])` when the model supports none.

Adding a brand-new modifier is a separate cross-model capability change. Define its stable
ID, field IDs, and metadata in `src/models/inputModifiers.ts`; implement its pure definition
in `src/services/comfort/inputModifiers.ts`; add any conversion rules under
`src/services/units/`; then opt models in declaratively. Do not write effective values back
to `inputsByInput` or add a second model calculation path.

### How does the model selector dropdown order work?

The order is determined by the key order in `comfortModelConfigs` in `src/state/comfortTool/modelConfigs/index.ts`. Place your model entry where you want it to appear in the dropdown.

---

## File Summary

When adding a new model, these are the files you touch:

| File | What you add |
|---|---|
| `src/models/comfortModels.ts` | Stable serialized model ID constant |
| `src/models/chartOptions.ts` | Chart ID constants + chart metadata entries |
| `src/comfortModels/myNewModel.ts` | **New file** — metadata, capabilities, requests, calculations, results, and charts |
| `src/comfortModels/myNewModel.test.ts` | **New file** — unit tests for the calculation |
| `src/state/comfortTool/modelConfigs/index.ts` | Import + registry entry |

If your model needs new input fields:

| File | What you add |
|---|---|
| `src/models/fieldKeys.ts` | New `FieldKey` constant |
| `src/models/inputFieldsMeta.ts` | Field metadata + display order |
| `src/models/inputSlots.ts` | Default values per input slot |
| `src/models/inputControls.ts` | New `InputControlId` constant |
