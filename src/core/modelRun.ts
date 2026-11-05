import type { ModelWarning } from "jsthermalcomfort";
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
 * key. `undefined` for a key the result does not carry, `null` for an output
 * the library returns as no value. The one cast onto `ModelResult`, which
 * types `warnings` alone (`core/modelDeclaration.ts`).
 */
export function resultValue(result: ModelResult, quantity: Quantity): number | string | boolean | null | undefined {
  return (result as unknown as Readonly<Record<string, number | string | boolean | null>>)[quantity.key];
}

/** {@link resultValue} as a number: `NaN` when the result carries no number for `quantity`, `null` included. */
export function resultNumber(result: ModelResult, quantity: Quantity): number {
  const value = resultValue(result, quantity);
  return typeof value === "number" ? value : Number.NaN;
}

/**
 * The applicability rows the library says the call broke: the `range` rows of
 * the result's `warnings` (ADR-0002 decision 23). A `notice` row is no bound,
 * and is not read.
 */
export function resultWarnings(result: ModelResult): readonly Extract<ModelWarning, { kind: "range" }>[] {
  return result.warnings.filter((warning) => warning.kind === "range");
}
