# Adding a New Thermal Model to the Comfort Tool

This guide walks you through every step required to add a new thermal comfort model to the application. Follow the steps in order — each step builds on the previous one.

The architecture is **config-driven**: new models are added by registering a self-contained configuration object. A model file in `src/comfortModels/` is the single source of truth for all model-specific logic.

> **Reference models** — use these existing models as concrete examples while reading this guide:
> - `src/comfortModels/heatIndex.ts` — simple 2-input model with both a static and a dynamic chart
> - `src/comfortModels/humidex.ts` — simple 2-input model with only a dynamic chart
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
   - [3e. Write the state-to-request extractor](#3e-write-the-state-to-request-extractor)
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

Then add a metadata entry to `comfortModelMetaById`. This drives the model-selection dropdown label and description.

```ts
export const comfortModelMetaById: Record<ComfortModel, { label: string; description: string }> = {
  // ... existing entries ...
  [ComfortModel.MyNewModel]: {
    label: "My New Model",
    description: "A short description shown in the model selector dropdown.",
  },
};
```

> **Why here?** `src/models/` is the layer for centralized constants. The model ID and its display label are stable metadata, not calculation logic. All other layers (`state/`, `comfortModels/`, `services/`) import from here.

---

## Step 2: Register Chart IDs

**File:** `src/models/chartOptions.ts`

Add one or more entries to the `ChartId` constant — one per chart your model will expose. Use descriptive `PascalCase` keys.

```ts
export const ChartId = {
  // ... existing chart IDs ...
  MyNewModelRanges:  "myNewModelRanges",   // e.g., static psychrometric-style chart
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
  },
  [ChartId.MyNewModelDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
    isDynamic: true,  // ← set true for charts with selectable X/Y axes
  },
};
```

> **`isDynamic: true`** tells the UI to render the axis-selector dropdowns above the chart.

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

// Baseline values used when a required axis field isn't the dynamic axis.
const DEFAULT_BASELINE = {
  tdb: 25,
  rh: 50,
};
```

> **Always use SI units** for domain constants. The chart and conversion layers convert to the display unit system automatically.

### 3c. Define DTOs

Define TypeScript interfaces for the calculation request and response. These are plain data containers with no logic.

```ts
import { UnitSystem } from "../models/units";
import { FieldKey } from "../models/fieldKeys";
import { CalculationSource } from "../models/calculationMetadata";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { CompareInputMap } from "../models/comfortDtos";

export interface MyNewModelRequestDto {
  tdb: number;  // dry-bulb temperature in SI (°C)
  rh:  number;  // relative humidity (%)
  units: UnitSystem;
}

export interface MyNewModelResponseDto {
  index: number;        // the computed index value, stored in SI
  category: string;     // zone label, e.g. "Danger"
  source: CalculationSource;
}

// Used to pass chart-related data between the calculator and the chart builder.
export interface MyNewModelChartSourceDto {
  chartRequest: CompareInputMap<MyNewModelRequestDto>;
  dynamicXAxis?: FieldKey;
  dynamicYAxis?: FieldKey;
  baselineInputId?: InputIdType;
}
```

**Key points:**
- `RequestDto` contains raw SI values extracted from the shared input state.
- `ResponseDto` stores computed results in SI. The results panel converts to display units when rendering.
- `ChartSourceDto` carries the map of per-input requests **and** the dynamic axis selections from UI state.

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

### 3e. Write the State-to-Request Extractor

This private function reads from shared UI state and produces a `RequestDto` for one input slot.

```ts
import type { ComfortToolStateSlice } from "../state/comfortTool/types";

function toMyNewModelRequest(state: ComfortToolStateSlice, inputId: InputIdType): MyNewModelRequestDto {
  const inputs = state.inputsByInput[inputId];
  return {
    tdb: Number(inputs[FieldKey.DryBulbTemperature]),
    rh:  Number(inputs[FieldKey.RelativeHumidity]),
    units: UnitSystem.SI,
  };
}
```

> The `state.inputsByInput` record contains all field values **already in SI**. You do not need to convert them — just read them.

### 3f. Build the Model Configuration

Use `ComfortModelBuilder` to compose all the pieces. This is a fluent API where each method registers a specific part of the model.

```ts
import { ComfortModelBuilder, isRecord, createEmptyResults, buildResultSection }
  from "../state/comfortTool/modelConfigs/builder";
import { ComfortModel, comfortModelMetaById } from "../models/comfortModels";
import { ChartId } from "../models/chartOptions";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
import { UnitSystem } from "../models/units";
import { createControlBehavior } from "../services/comfort/controls/controlBehaviors";
import { buildComfortModelChart } from "../services/comfort/charts/sharedCharts";
import { convertFieldValueFromSi, formatDisplayValue } from "../services/units/index";
import { roundValue } from "../services/comfort/helpers";

const myNewModelBuilder = new ComfortModelBuilder<MyNewModelResponseDto, MyNewModelChartSourceDto>(
  ComfortModel.MyNewModel
);
```

#### Label and Description

```ts
myNewModelBuilder
  .setLabel(comfortModelMetaById[ComfortModel.MyNewModel].label)
  .setDescription(comfortModelMetaById[ComfortModel.MyNewModel].description);
```

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

For temperature controls that support Operative Temperature mode, use `createTemperatureControlBehavior` instead of `createControlBehavior`. For air speed controls with measured vs. relative mode, use `createAirSpeedControlBehavior`.

#### Calculator

The calculator runs for every input slot that is visible and produces `resultsByInput` (one result per slot) plus a `chartSource` payload.

```ts
myNewModelBuilder.setCalculator((state, visibleInputIds) => {
  const resultsByInput = createEmptyResults<MyNewModelResponseDto>();
  const chartInputs: CompareInputMap<MyNewModelRequestDto> = {};

  visibleInputIds.forEach((inputId) => {
    const request = toMyNewModelRequest(state, inputId);
    resultsByInput[inputId] = calculateMyNewModel(request);
    chartInputs[inputId] = request;
  });

  return {
    resultsByInput,
    chartSource: {
      chartRequest: chartInputs,
      dynamicXAxis: state.ui.dynamicXAxis,
      dynamicYAxis: state.ui.dynamicYAxis,
      baselineInputId: state.ui.chartBaselineInputId,
    },
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
        // Convert SI to display units for rendering.
        const displayValue = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.index, unitSystem);
        const formattedValue = formatDisplayValue(displayValue, 1);
        const units = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];

        // Find the zone for text color.
        const zone = myNewModelZonesList.find((z) => z.contains(result.index));
        const color = zone ? zone.textColor : "";

        return {
          text: `${formattedValue} ${units}`,  // primary result value
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

The chart builder produces Plotly chart data. Use `buildComfortModelChart` from `src/services/comfort/charts/sharedCharts.ts` — it handles both dynamic and static chart types through a single interface.

```ts
myNewModelBuilder.setChartBuilder((chartId, chartSource, resultsByInput, unitSystem) => {
  return buildComfortModelChart(chartId, chartSource, resultsByInput, unitSystem, {

    // ── Dynamic chart ──────────────────────────────────────────────
    dynamicChartId: ChartId.MyNewModelDynamic,
    dynamicTitle: `${comfortModelMetaById[ComfortModel.MyNewModel].label} Dynamic Chart`,
    zones: myNewModelZonesList,
    customRanges: {
      // Override the global field range for this model's domain.
      [FieldKey.DryBulbTemperature]: TDB_LIMITS,
    },
    baselinePayloadDefault: DEFAULT_BASELINE,

    // Called for every grid point to determine its zone index and hover text.
    calculateDynamicPoint: (xSi, ySi, dynamicXAxis, dynamicYAxis, baselinePayload) => {
      const calcPayload: any = { ...baselinePayload, units: UnitSystem.SI };
      calcPayload[dynamicXAxis] = xSi;
      calcPayload[dynamicYAxis] = ySi;

      const rawResult = someLibraryFunction(calcPayload.tdb, calcPayload.rh);
      const zone = myNewModelZonesList.find((z) => z.contains(rawResult.index));
      const rangeValue = zone ? myNewModelZonesList.indexOf(zone) : 0;
      const zoneLabel  = zone ? zone.label : myNewModelZonesList[0].label;

      // Hover text shown in the chart tooltip on the contour surface.
      const xMeta = fieldMetaByKey[dynamicXAxis as FieldKey];
      const yMeta = fieldMetaByKey[dynamicYAxis as FieldKey];
      const xVal  = convertFieldValueFromSi(dynamicXAxis as FieldKey, xSi, unitSystem);
      const yVal  = convertFieldValueFromSi(dynamicYAxis as FieldKey, ySi, unitSystem);

      const hovertext = `${xMeta?.label}: ${roundValue(xVal, 1)} ${xMeta?.displayUnits[unitSystem]}<br>${yMeta?.label}: ${roundValue(yVal, 1)} ${yMeta?.displayUnits[unitSystem]}<br><b>Category: ${zoneLabel}</b><br>Index: ${roundValue(rawResult.index, 1)}`;

      return { rangeValue, category: zoneLabel, hovertext };
    },

    // Hover text for scatter points (the user's input) on the dynamic chart.
    getHovertemplateScatterDynamic: (label, cached) => {
      if (!chartSource) return "";
      const xLabel = fieldMetaByKey[chartSource.dynamicXAxis as FieldKey]?.label;
      const yLabel = fieldMetaByKey[chartSource.dynamicYAxis as FieldKey]?.label;
      return `${label}<br>${xLabel}: %{x:.1f}<br>${yLabel}: %{y:.1f}<br><b>Category: ${cached?.category || ""}</b><extra></extra>`;
    },

    hovertemplateContourDynamic: "%{text}<extra></extra>",

    // ── Static chart (optional) ───────────────────────────────────
    // Include this block only if your model has a fixed psychrometric-style chart.
    staticConfig: {
      title: `${comfortModelMetaById[ComfortModel.MyNewModel].label} Ranges`,
      xKey: FieldKey.RelativeHumidity,
      yKey: FieldKey.DryBulbTemperature,
      xRangeSi: {
        min: fieldMetaByKey[FieldKey.RelativeHumidity].minValue,
        max: fieldMetaByKey[FieldKey.RelativeHumidity].maxValue,
      },
      yRangeSi: TDB_LIMITS,
      hovertemplateContour: "%{text}<extra></extra>",
      getHovertemplateScatter: (label, cached) =>
        `${label}<br>RH: %{x:.1f}%<br>Tdb: %{y:.1f}<br><b>Category: ${cached?.category || ""}</b><extra></extra>`,
      getScatterXSi: (p) => p.rh,
      getScatterYSi: (p) => p.tdb,
      calculateStaticPoint: (xSi, ySi) => {
        const rawResult = someLibraryFunction(ySi, xSi);
        const zone = myNewModelZonesList.find((z) => z.contains(rawResult.index));
        const rangeValue = zone ? myNewModelZonesList.indexOf(zone) : 0;
        const zoneLabel  = zone ? zone.label : myNewModelZonesList[0].label;
        return { rangeValue, category: zoneLabel };
      },
    },
  });
});
```

> **`rangeValue`** is the zone's position index in `myNewModelZonesList` (0-based). The chart engine maps integer zone indices to colors using the `buildColorscale` helper internally.

#### Final Builder Registrations

Register chart metadata, dynamic axis fields, zone legend, and default options:

```ts
// Which chart is shown by default, and which charts are available in the selector.
myNewModelBuilder.setDefaultChart(
  ChartId.MyNewModelRanges,                              // default chart
  [ChartId.MyNewModelRanges, ChartId.MyNewModelDynamic]  // all available charts
);

// Field keys available for the dynamic chart's X and Y axis dropdowns.
myNewModelBuilder.setDynamicAxisFields([
  FieldKey.DryBulbTemperature,
  FieldKey.RelativeHumidity,
]);

// Default model options (leave empty for simple models with no advanced options).
myNewModelBuilder.setDefaultOptions({});
myNewModelBuilder.setOptionNormalizer((value) => isRecord(value) ? value : {});

// Zone definitions (used by the legend and the chart engine).
myNewModelBuilder.setZones(myNewModelZonesList);

// Which charts show the zone legend.
myNewModelBuilder.setLegendChartIds([ChartId.MyNewModelRanges, ChartId.MyNewModelDynamic]);
myNewModelBuilder.setLegendTitle("My New Model");

// Which dynamic charts should lock the Y-axis (prevents axis flipping).
myNewModelBuilder.setLockYAxisChartIds([ChartId.MyNewModelDynamic]);
```

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
  [ComfortModel.Pmv]:           pmvModelConfig,
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
3. IP/SI unit handling if applicable.

```ts
import { describe, it, expect } from "vitest";
import { calculateMyNewModel } from "./myNewModel";
import { UnitSystem } from "../models/units";

describe("myNewModel service", () => {
  it("returns correct index and category for a high-heat scenario", () => {
    const result = calculateMyNewModel({ tdb: 38, rh: 75, units: UnitSystem.SI });
    expect(result.index).toBeGreaterThan(35);
    expect(result.category).toBe("Danger");
    expect(result.source).toBeTruthy();
  });

  it("classifies mild conditions as Safe", () => {
    const result = calculateMyNewModel({ tdb: 22, rh: 40, units: UnitSystem.SI });
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

Run both validation commands before considering the work done:

```bash
npm test        # All tests must pass
npm run build   # Production build must succeed
```

### Done Criteria Checklist

Before marking the work complete, verify all of the following:

- [ ] `npm test` passes with no failures
- [ ] `npm run build` produces no TypeScript or Vite errors
- [ ] The new model appears in the model selector dropdown with the correct label and description
- [ ] Switching to the new model shows the correct input controls in the sidebar
- [ ] Results are calculated and displayed correctly when inputs change
- [ ] The chart(s) render correctly in both SI and IP unit modes
- [ ] The zone legend appears on the correct charts
- [ ] The dynamic chart's axis dropdowns contain the correct fields
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

For unit conversion, if the field is a temperature or air speed the existing conversion helpers in `src/services/units/` will handle it. For custom units (like Wind Chill's W/m²), handle the conversion inside your model file's result builder and chart builder directly.

### What if my model uses string categories instead of numeric ranges?

Pass a `category` string to the `ThermalZone` constructor. The `z.contains(value)` method accepts strings and will match against `category` (case-insensitive) or `label`. This is how the UTCI model works.

### What if my model needs an advanced option menu (like PMV's humidity mode)?

1. Add a new `OptionKey` in `src/models/inputModes.ts`.
2. Add a corresponding entry in `src/models/controlMenuMeta.ts` with the menu items.
3. Use `addOptionHandler(optionKey, handler)` on the builder to register the logic that applies when the option changes.
4. Use `getMenu: (context) => ...` in your `createControlBehavior(...)` config to render the menu caret.
5. Use `setDefaultOptions({ [OptionKey.MyOption]: defaultValue })` and update `setOptionNormalizer` to validate the option.

### What if my model has no static chart and only a dynamic chart?

Omit the `staticConfig` block from `buildComfortModelChart(...)` entirely and set your default chart to the dynamic chart ID:

```ts
myNewModelBuilder.setDefaultChart(
  ChartId.MyNewModelDynamic,
  [ChartId.MyNewModelDynamic]
);
```

(This is what `windChill.ts` does.)

### What if my model needs a synchronization hook (e.g., reset an option when the user switches charts)?

Use `setSynchronizer` on the builder:

```ts
myNewModelBuilder.setSynchronizer((context) => {
  // Return a BehaviorPatch to apply when the model is activated or the chart changes.
  // Return null to make no changes.
  return null;
});
```

### How does the model selector dropdown order work?

The order is determined by the key order in `comfortModelConfigs` in `src/state/comfortTool/modelConfigs/index.ts`. Place your model entry where you want it to appear in the dropdown.

---

## File Summary

When adding a new model, these are the files you touch:

| File | What you add |
|---|---|
| `src/models/comfortModels.ts` | Model ID constant + label/description metadata |
| `src/models/chartOptions.ts` | Chart ID constants + chart metadata entries |
| `src/comfortModels/myNewModel.ts` | **New file** — all model-specific logic |
| `src/comfortModels/myNewModel.test.ts` | **New file** — unit tests for the calculation |
| `src/state/comfortTool/modelConfigs/index.ts` | Import + registry entry |

If your model needs new input fields:

| File | What you add |
|---|---|
| `src/models/fieldKeys.ts` | New `FieldKey` constant |
| `src/models/inputFieldsMeta.ts` | Field metadata + display order |
| `src/models/inputSlots.ts` | Default values per input slot |
| `src/models/inputControls.ts` | New `InputControlId` constant |
