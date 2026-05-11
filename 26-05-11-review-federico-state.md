# State Layer Review Notes — CBE Thermal Comfort Tool

Delete this file once all items below are resolved.

IMPORTANT: Apply the same patterns throughout the state layer, not just the specific examples shown here.

---

## The core problem: types that must be updated manually per model

The biggest maintainability issue in this layer is that several files define per-model named types and must all be updated by hand every time a new model is added. Right now if you add a new comfort model, you must update:

1. `types.ts` — add a new `XxxResultsState`, a new `XxxCalculationCache`, and update `ModelCalculationCacheByModelState`
2. `createComfortToolState.svelte.ts` — add the new model to `createCalculationCacheByModel()`
3. The `ResultTone` union in `types.ts` — add new tone names for the new model

This is a problem that multiplies. The fix is one generic type that works for all models:

```ts
// Replace all per-model cache types with this one:
type ModelCalculationCache<R, C> = {
  status: CalculationCacheStatus;
  lastVisibleInputIds: InputIdType[];
  resultsByInput: Record<InputIdType, R | null>;
  chartSource: C | null;
};
```

Then the state type becomes:
```ts
// The state layer doesn't need to know what R or C are — it just stores and forwards.
calculationCacheByModel: Record<ComfortModelType, ModelCalculationCache<unknown, unknown>>;
```

This means adding a new model no longer requires touching `types.ts` at all.

---

## `types.ts` — ResultTone is a flat union that grows forever

Current:
```ts
export type ResultTone = "default" | "success" | "danger" | "pmvCold" | "pmvCool" | ... | "utciNoStress" | ... | "wcSafe" | ...;
```

Every time a new model is added, more tone names are appended. There are currently 30+ values in this one type.

Better: each model defines its own tone type, and `ResultTone` is just a union of those:
```ts
export type PmvTone = "pmvCold" | "pmvCool" | "pmvSlightlyCool" | "pmvNeutral" | "pmvSlightlyWarm" | "pmvWarm" | "pmvHot";
export type UtciTone = "utciExtremeCold" | "utciVeryStrongCold" | ... | "utciExtremeHeat";
export type HeatIndexTone = "hiNoticeable" | "hiCaution" | ... | "hiExtremeDanger";
// etc.

export type ResultTone = "default" | "success" | "danger" | "warning" | PmvTone | UtciTone | HeatIndexTone | WindChillTone;
```

This way, when you add a new model, you add one new type for that model and add it to the `ResultTone` union. Removing a model means removing one type. The code is easier to scan.

---

## `types.ts` — ResultTone is in the wrong layer

`ResultTone` is defined in the state layer (`src/state/comfortTool/types.ts`) but is imported from `src/services/comfort/helpers.ts`. Services should not import from state — this breaks the architecture rule that says imports go one-way: `state → services → models`, not the other way.

The fix is to move `ResultTone` (and the per-model tone types above) to `src/models/resultTones.ts`. Both the state layer and the service layer can then import from `models/`, which is the correct direction.

---

## `types.ts` — per-model cache types are unnecessary

These types exist today:
```ts
export type PmvCalculationCache = ...
export type UtciCalculationCache = ...
export type AdaptiveCalculationCache = ...
export type ThermalIndicesCalculationCache = ...
```

Each is slightly different only in the `resultsByInput` and `chartSource` fields. With the generic `ModelCalculationCache<R, C>` proposed above, none of these named types are needed. The specific types still exist — they just become type arguments at the call site:

```ts
// Inside the PMV model config:
type PmvCache = ModelCalculationCache<PmvResponseDto, PmvChartSourceDto>;
```

---

## `createComfortToolState.svelte.ts` — normalizeCompareInputIds is duplicated

The function `normalizeCompareInputIds` appears identically in both `createComfortToolState.svelte.ts` (line 84) and `shareState.ts` (line 47). Since `shareState.ts` is the serialization module, it makes sense to keep the function there and import it from the controller. Delete the copy in `createComfortToolState.svelte.ts`.

---

## `createComfortToolState.svelte.ts` — as any casts are all the same root cause

There are four `as any` casts in this file:
- `createCalculationCacheByModel` (line 153)
- `invalidateModel` (line 200)
- `getResultSections` (line 291)
- `getCurrentChartResult` (line 303)
- `setSelectedModel` (line 343)

All of them exist because the per-model cache types force the type system to demand you know which model's result type you are working with. Once `ModelCalculationCache<unknown, unknown>` is the state-level type, these casts disappear.

The one remaining `as any` in `setSelectedModel` (for the dynamic axis field comparison) is a different issue — it is a `FieldKeyType` vs. a subset type mismatch. The fix there is to make `dynamicAxisFields` in the model config typed as `FieldKeyType[]` instead of a more specific array type.

---

## `createComfortToolState.svelte.ts` — scheduleCalculationInternal wraps nothing

```ts
function scheduleCalculationInternal(options?: { immediate?: boolean; force?: boolean }) {
  calculationManager.scheduleCalculation(options);
}
```

This is a one-line wrapper that adds no behavior. You can just call `calculationManager.scheduleCalculation(options)` directly at the 9 places `scheduleCalculationInternal` is called. Remove the wrapper.

---

## `createComfortToolState.svelte.ts` — JSDoc comments explain the obvious

Almost every function has a JSDoc block, but most describe *what* the function does (which you can tell from the name), not *why* it does it. Examples:

```ts
/** Updates the selected chart for the current model. */
function setSelectedChart(nextChart: ChartIdType) { ... }
```

The function name already says this. Comments like this add noise without adding information. The one comment worth keeping is the one about auto-swapping axes — that behavior is non-obvious:

```ts
// Auto-swap if the newly selected X-axis is the same as the current Y-axis
```

Remove the JSDoc blocks from the obvious functions; keep comments only where the *why* is non-obvious.

---

## `calculationManager.svelte.ts` — getVisibleInputIds returns string[]

```ts
export function createCalculationManager(state: ComfortToolStateSlice, getVisibleInputIds: () => string[]) {
```

The parameter type says `() => string[]` but in practice it always receives `getVisibleInputIds` from the controller, which returns `InputIdType[]`. Using `string[]` here means:
1. TypeScript cannot catch a bug where you pass in a function that returns something else
2. Two `as any` casts are needed downstream inside the manager (lines 45 and 50)

Fix: change the parameter type to `() => InputIdType[]`. Then remove the two casts.

---

## `calculationManager.svelte.ts` — as never cast

```ts
getTimerApi().clearTimeout(calculationTimerId as never);
```

`as never` is used here to suppress a TypeScript error about the type of the timer ID. The cleaner solution is to store the timer ID as `ReturnType<typeof setTimeout>` (which it already is) and let TypeScript know that `getTimerApi().clearTimeout` accepts the same type. If the environment difference causes a real type mismatch, a comment explaining why is better than a silent cast to `never`.

---

## `shareState.ts` — toUrl coercion is more complex than needed

```ts
function toUrl(source: URL | Location | string): URL {
  if (source instanceof URL) {
    return new URL(source.toString());
  }
  if (typeof source === "string") {
    return new URL(source);
  }
  return new URL(source.href);
}
```

The first branch (`instanceof URL`) creates a new URL from `source.toString()`, which is just `source.href`. This is the same as the third branch. And making a copy of a URL object serves no purpose here — the function's callers don't mutate it via the returned reference. Simplify:

```ts
function toUrl(source: URL | Location | string): URL {
  return new URL(typeof source === "string" ? source : source.href);
}
```

---

## `shareState.ts` — normalizeCompareInputIds duplicate (see above)

Same as the note in `createComfortToolState.svelte.ts`. The copy in `shareState.ts` should be the single source of truth. Import it in `createComfortToolState.svelte.ts`.

---

## General note: the state layer will simplify significantly after the main refactor

Many of the issues above — the per-model cache types, the manual model lists, the `as any` casts — are consequences of the architecture problem described in `26-05-11-review-federico.md`. Once the vertical slice refactor is complete (one file per model in `src/comfortModels/`) and `ModelCalculationCache<R, C>` is in place, much of the complexity in `types.ts` and `createComfortToolState.svelte.ts` disappears on its own. The fixes in this document are relatively safe to do before the main refactor, but most of them become mandatory when doing the refactor.
