import type { ApplicabilityWarning } from "jsthermalcomfort";
import { optionsReader, toLibraryInputs } from "./libraryInputs";
import type { ModelResult, RegisteredModel } from "./modelDeclaration";
import type { Quantity } from "./quantities";
import type { Slot } from "./slot";

/**
 * `model` run on `slot` at `atmosphericPressure`: its resolved values
 * ({@link toLibraryInputs}) and the options it holds, handed to the
 * declaration's `run`. The one statement of the call.
 */
export function runOn(slot: Slot, model: RegisteredModel, atmosphericPressure: number): ModelResult {
  return model.run(toLibraryInputs(slot, model, atmosphericPressure), optionsReader(slot.options));
}

/**
 * The mirror read: a quantity's value off the model's own result object, by
 * key. `undefined` for a key the result does not carry. One of the two casts
 * onto `ModelResult`'s deliberately unindexed `object`
 * (`core/modelDeclaration.ts`); {@link resultWarnings} is the other.
 */
export function resultValue(result: ModelResult, quantity: Quantity): number | string | boolean | undefined {
  return (result as Record<string, number | string | boolean>)[quantity.key];
}

/** {@link resultValue} as a number: `NaN` when the result carries no number for `quantity`. */
export function resultNumber(result: ModelResult, quantity: Quantity): number {
  const value = resultValue(result, quantity);
  return typeof value === "number" ? value : Number.NaN;
}

/**
 * The applicability rows the library says the call broke, off the result's
 * `warnings` (ADR-0002 decision 23). Every v1 model returns them, so a result
 * without them is a declaration bug, and it throws naming the model rather
 * than reading as a run that broke nothing.
 */
export function resultWarnings(model: RegisteredModel, result: ModelResult): readonly ApplicabilityWarning[] {
  const warnings = (result as { warnings?: readonly ApplicabilityWarning[] }).warnings;
  if (!warnings) {
    throw new Error(`${model.info.label} returned no applicability rows`);
  }
  return warnings;
}
