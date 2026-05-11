# Code Review Notes — CBE Thermal Comfort Tool

Delete this file once all items below are resolved.

Please note that this document was written with the help of Claude.
Consequently there might be minor mistakes, however the full picture is correct and I have recommended using this approach.

---

## The core problem

Adding a new comfort model today requires touching at least seven separate files:

| File | Why you touch it |
|---|---|
| `src/models/comfortModels.ts` | Add the model ID, display order, and label |
| `src/state/comfortTool/modelConfigs/index.ts` | Register the model config |
| `src/state/comfortTool/modelConfigs/newModel.ts` | Create the config file |
| `src/services/comfort/newModel.ts` | Write the calculation logic |
| `src/services/comfort/helpers.ts` | Add zone definitions and colors |
| `src/state/comfortTool/types.ts` | Expand `ResultTone` and add the cache type |
| `src/components/ResultsPanel.svelte` | Add tone-to-CSS entries for the new model |
| `src/models/comfortDtos.ts` | Add request/response DTOs |

These files are spread across every layer of the app. A mistake in any one of them breaks the model silently. This needs to be fixed.

---

## The solution: one file per model

Each model should have a single file that owns everything specific to that model. Everything else stays shared.

### Step 0: Create a shared `ThermalZone` class

Before creating model files, create one shared class in `src/models/thermalZone.ts`. All models will use this class for their zone definitions.

```ts
// src/models/thermalZone.ts

export class ThermalZone {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly min: number,
    public readonly max: number,
    public readonly color: string,    // used in charts
    public readonly cssClass: string, // used in ResultsPanel
  ) {}

  contains(value: number): boolean {
    return value >= this.min && value < this.max;
  }
}
```

This class is used by every model. Using a class (rather than a plain object with an interface) means you can add shared methods like `contains()` in one place, and every zone in the entire app gains that method automatically.

Each threshold value appears **exactly once** — as an argument to the constructor. There are no separate constant definitions that duplicate the same number. For example:

```ts
// The boundary -1.5 appears once. Both the max of "cool" and the min of
// "slightly cool" read it from the same object, not from a second variable.
const pmvZones = [
  new ThermalZone("cold",         "Cold",          -Infinity, -2.5, "#0571b0", "text-violet-600"),
  new ThermalZone("cool",         "Cool",          -2.5,      -1.5, "#4c78a8", "text-blue-600"  ),
  new ThermalZone("slightlyCool", "Slightly Cool", -1.5,      -0.5, "#92c5de", "text-blue-400"  ),
  new ThermalZone("neutral",      "Neutral",       -0.5,       0.5, "#f2f2f2", "text-emerald-600"),
  new ThermalZone("slightlyWarm", "Slightly Warm",  0.5,       1.5, "#f4a582", "text-amber-500" ),
  new ThermalZone("warm",         "Warm",           1.5,       2.5, "#e15759", "text-orange-500"),
  new ThermalZone("hot",          "Hot",            2.5,  Infinity, "#cc79a7", "text-red-600"   ),
];
```

Looking up a zone for a calculated value then becomes:
```ts
const zone = pmvZones.find(z => z.contains(pmv));
```

** todo check the following that was written about UTCI by AI. I do not think it is correct that UTCI returns a string category only **

**Note on UTCI:** UTCI is a special case because `jsthermalcomfort` returns the stress category as a string (e.g. `"moderate heat stress"`) rather than a numeric value. For UTCI, add a `category` field to the zone definition and match on that string instead of numeric range:

```ts
class UtciZone extends ThermalZone {
  constructor(
    id: string, label: string, min: number, max: number,
    color: string, cssClass: string,
    public readonly category: string, // the string returned by jsthermalcomfort
  ) {
    super(id, label, min, max, color, cssClass);
  }
}
```

Or, simpler: make `category` an optional property on the base `ThermalZone` class if you want to keep just one class.

### Step 1: Create the model file directory

```
src/comfortModels/
  pmv.ts
  utci.ts
  adaptive.ts   ← both ASHRAE and EN variants live here (they share the same calculation)
  heatIndex.ts
  humidex.ts
  windChill.ts
```

### Step 2: What goes inside each model file

Each file contains the following, in this order:

**1. Imports**
Only the `jsthermalcomfort` function(s) this model needs, plus shared utilities from `src/models/` and `src/services/units/`. The `ThermalZone` class from `src/models/thermalZone.ts`.

**2. Zone definitions**
Using `ThermalZone` instances as shown above. No separate threshold constants — the zone objects are the single source of truth. If you need to reference a specific boundary elsewhere in the same file, access it from the array:
```ts
const coldMax = pmvZones.find(z => z.id === "cold")!.max; // -2.5, read once
```

**3. Request and response types (DTOs)**
Each model defines only the fields it actually uses. Remove `ThermalIndicesRequestDto` and `ThermalIndicesResponseDto` from `src/models/comfortDtos.ts` once Heat Index, Humidex, and Wind Chill each have their own DTO.

Heat Index does not use wind speed. Wind Chill does not use relative humidity. Humidex does not need most of the response fields. The current bundled DTO forces every model to carry fields it ignores.

**4. The calculation function**
This is currently split between `src/services/comfort/pmv.ts` (the math) and the `setCalculator()` call in `src/state/comfortTool/modelConfigs/pmv.ts` (the wiring). Merge both into this file.

**5. Chart builder functions**
These are currently in `src/services/comfort/charts/`. Move the model-specific chart builder into the model file.

**6. The exported model definition**
```ts
export const pmvModelConfig = new ComfortModelBuilder(ComfortModel.Pmv)
  .addControl(...)
  .setCalculator(...)
  .setResultBuilder(...)
  .setChartBuilder(...)
  .setDefaultChart(ChartId.Psychrometric, [ChartId.Psychrometric, ChartId.PmvDynamic])
  .build();
```

### Step 3: How to update `ResultsPanel` to stop knowing about model tones

Right now `ResultsPanel.svelte` has a hard-coded map of every possible tone key to a CSS class, covering every model. This needs to change.

Because `cssClass` is now a property on `ThermalZone`, a model can produce a tone-to-class lookup from its own zones:
```ts
const toneToClass = Object.fromEntries(pmvZones.map(z => [z.id, z.cssClass]));
// { cold: "text-violet-600", cool: "text-blue-600", ... }
```

Add a `toneToClass: Record<string, string>` field to `ComfortModelDefinition`. Each model sets it by building this map from its zones. `ResultsPanel` then does:

```ts
const toneClass = getComfortModelConfig(selectedModel).toneToClass[cell.tone] ?? "";
```

Once this is in place, `ResultTone` in `types.ts` can become just `string`. The CSS class lookup is no longer a concern of the shared type system.

### Step 4: Fix the calculation cache types

Replace the four separate named cache types with one generic type. The named types become simple aliases, not separate definitions:

```ts
// One generic definition
export type ModelCalculationCache<R, C> = {
  status: CalculationCacheStatus;
  lastVisibleInputIds: InputIdType[];
  resultsByInput: Record<InputIdType, R | null>;
  chartSource: C | null;
};

// Named aliases (optional, for readability in model config files)
export type PmvCalculationCache   = ModelCalculationCache<PmvResponseDto,   PmvChartSourceDto>;
export type UtciCalculationCache  = ModelCalculationCache<UtciResponseDto,  UtciChartSourceDto>;
// etc.

// The state-level map uses any because the controller only needs status and
// cache-invalidation logic, not the specific result types.
export type ModelCalculationCacheByModelState = Record<ComfortModel, ModelCalculationCache<any, any>>;
```

This removes the need to manually enumerate models in the state type, and most of the `as any` casts in the controller will disappear because the type is now consistent.

### What does NOT move

These files stay exactly where they are:

- `src/models/` — field keys, unit systems, input slot IDs, chart IDs (generic domain constants)
- `src/services/units/` — SI↔IP conversion helpers
- `src/services/comfort/helpers.ts` — after the refactor, keep only: `roundValue`, `ensureFiniteValue`, `getPaddedAxisRange`, `getCompareInputs`. All zone definitions, threshold constants, and tone functions move into the individual model files and can be deleted from here.
- `src/services/comfort/controls/` — control behaviors (input-field-level logic, shared across models)
- `src/services/comfort/comfortZone.ts` — the comfort zone solver used by PMV (this is computational infrastructure, not model definition)
- `src/state/comfortTool/` — the controller, `CalculationManager`, share state
- `src/state/comfortTool/modelConfigs/builder.ts` — keep as-is
- `src/state/comfortTool/modelConfigs/index.ts` — keep, but it becomes much simpler: just imports and one registry object. Also move `comfortModelOrder` here from `comfortModels.ts` (see below)

### Step 5: Fix the model registration fragmentation

Currently `comfortModelOrder` lives in `src/models/comfortModels.ts` and `comfortModelConfigs` lives in `src/state/comfortTool/modelConfigs/index.ts`. These two lists must be kept in sync manually.

Move `comfortModelOrder` into `modelConfigs/index.ts` alongside `comfortModelConfigs`. Define the order as a plain array of keys from the config object:

```ts
// src/state/comfortTool/modelConfigs/index.ts
export const comfortModelConfigs = {
  [ComfortModel.Pmv]:           pmvModelConfig,
  [ComfortModel.Utci]:          utciModelConfig,
  [ComfortModel.AdaptiveAshrae]:adaptiveAshraeModelConfig,
  [ComfortModel.AdaptiveEn]:    adaptiveEnModelConfig,
  [ComfortModel.HeatIndex]:     heatIndexModelConfig,
  [ComfortModel.Humidex]:       humidexModelConfig,
  [ComfortModel.WindChill]:     windChillModelConfig,
} as const;

// Order is declared once, next to the configs, not in a separate file.
export const comfortModelOrder = Object.keys(comfortModelConfigs) as ComfortModel[];
```

Do not derive `comfortModelOrder` automatically from `Object.keys()` without the explicit cast — JavaScript objects preserve insertion order for string keys in modern engines, but this is not the right long-term pattern. The explicit cast makes the intent clear and keeps TypeScript happy.

---

## How to implement this (step by step)

Work one model at a time. Start with **Heat Index** — it has the simplest calculation, no comfort zone solving, no complex options. It is a good proof of concept before touching PMV.

**Step 1 — Create `src/models/thermalZone.ts`** with the `ThermalZone` class as shown above.

**Step 2 — Create `src/comfortModels/heatIndex.ts`**

Gather into this file:
- `heat_index` import from `jsthermalcomfort`
- The `heatIndexZones` array from `helpers.ts`, rewritten using `ThermalZone` with `cssClass` added to each entry
- `getHeatIndexCategory` (currently in `helpers.ts`) — rewrite it using `heatIndexZones.find(z => z.contains(hiSi))`
- A new `HeatIndexRequestDto` (just `tdb`, `rh`, `units`) and `HeatIndexResponseDto` (just `hi`, `category`, `source`)
- The `calculateHeatIndex` function extracted from `calculateThermalIndices` in `services/comfort/thermalIndices.ts`
- The Heat Index chart builder from `services/comfort/charts/thermalIndicesCharts.ts`
- The exported `heatIndexModelConfig` built with `ComfortModelBuilder`, including `toneToClass` derived from the zones

**Step 3 — Update the registry and verify**

In `src/state/comfortTool/modelConfigs/index.ts`, replace the import of `heatIndexModelConfig` from `./thermalIndices` with the import from `../../comfortModels/heatIndex`.

Run `npm test` and `npm run build`. Fix anything that breaks before moving on.

**Step 4 — Repeat for Humidex and Wind Chill**

Once all three are done, delete:
- `src/services/comfort/thermalIndices.ts`
- `src/state/comfortTool/modelConfigs/thermalIndices.ts`
- `ThermalIndicesRequestDto`, `ThermalIndicesResponseDto`, `ThermalIndicesChartSourceDto` from `comfortDtos.ts`

**Step 5 — Repeat for UTCI, then Adaptive, then PMV**

PMV is the most complex because `src/services/comfort/pmv.ts` contains a custom numerical solver (`solveDryBulbForTargetPmv`). This solver exists because `jsthermalcomfort` does not expose a comfort-zone boundary function — the code has to find it numerically using a bisection-like approach. The solver must move into the PMV model file along with everything else.

**Step 6 — Clean up**

Once all models are migrated:
- Slim `helpers.ts` down to only the four shared math utilities listed above
- Remove the per-model cache type definitions from `types.ts` and replace with the generic as described in Step 4
- Remove `comfortModelOrder` from `comfortModels.ts` (it now lives in `modelConfigs/index.ts`)
- Delete the old `src/services/comfort/charts/` files that have been fully absorbed into model files

---

## Smaller fixes (can be done independently)

**Wind Chill temperature formula is hand-coded**

In `src/services/comfort/thermalIndices.ts` around line 57–63, the Wind Chill temperature is calculated with a manually written formula. Check whether `jsthermalcomfort`'s `wc()` function already returns this value. If it does, delete the manual formula and use the library output. We must never re-implement a calculation that the library already provides.

**Unused imports**

`src/services/comfort/thermalIndices.ts` imports `convertFieldValueFromSi` but does not use it. Check all files for unused imports. A quick way: add `"noUnusedLocals": true` temporarily to `tsconfig.json` and run `npm run build` to surface them all at once.

**`normalizeCompareInputIds` is defined twice**

The same function body exists in `src/state/comfortTool/shareState.ts` and `src/state/comfortTool/createComfortToolState.svelte.ts`. Export it from `shareState.ts` and import it in the controller. Delete the duplicate.

**TypeScript strict mode is off**

`tsconfig.json` has `"strict": false`. For a calculation tool, this is risky — TypeScript will not warn if a value that could be `undefined` is passed into a calculation, or if a function receives a number in the wrong unit. Enable strict mode and fix the errors it surfaces. Most will be small additions of `| undefined` or null checks.

**Test coverage is thin**

There are 74 source files and only 6 test files. The following areas have no tests and are the most likely places for silent bugs:

- Result section formatters in each model config: given a specific PMV value, does the formatter return the correct zone label and `tone` string?
- Zone lookup: given a value on or near a boundary, does `zone.contains()` return the correct zone?
- Chart builders: do they return a valid Plotly trace structure?
- Share state serialization: does a round-trip through URL encoding preserve all values exactly?

All of these are pure functions and straightforward to test with Vitest.

** Psychrometric chart **

You should not be showing the risk categories above 100% relative humidity.

** Documentation. **

The current "docs" folder contains a markdown document that is currently unused and disconnected from the frontend. We should restructure this documentation into modular files—such as an introduction, a contribution guide, and a frontend structure overview—and use a generator to build a dedicated documentation website from these files. This will allow us to integrate the documentation directly into the frontend, providing users with easy access via a dedicated button or link. We should then use a package to build these markdown files into HTML and then connect these files via a button from the home page.
