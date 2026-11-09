import type { ModelOutputs, ModelWarning } from "jsthermalcomfort";
import { optionsReader, toLibraryInputs } from "./libraryInputs";
import type { ModelDeclaration } from "./modelDeclaration";
import type { Quantity } from "./quantities";
import type { Slot } from "./slot";

/**
 * `model` run on `slot` at `atmosphericPressure`: the library's inputs
 * resolved from it ({@link toLibraryInputs}) and the options it holds, handed
 * to the declaration's `run`. The one statement of the call.
 */
export function runOn(slot: Slot, model: ModelDeclaration, atmosphericPressure: number): ModelOutputs {
  return model.run(toLibraryInputs(slot, model, atmosphericPressure), optionsReader(slot.options));
}

/**
 * The mirror read: a quantity's value off the model's own outputs, by key.
 * `undefined` for a key the outputs do not carry, `null` for an output the
 * library returns as no value. The one cast onto `ModelOutputs`, which types
 * `warnings` alone (`core/modelDeclaration.ts`).
 */
export function outputValue(outputs: ModelOutputs, quantity: Quantity): number | string | boolean | null | undefined {
  return (outputs as unknown as Readonly<Record<string, number | string | boolean | null>>)[quantity.key];
}

/** {@link outputValue} as a number: `NaN` when the outputs carry no number for `quantity`, `null` included. */
export function outputNumber(outputs: ModelOutputs, quantity: Quantity): number {
  const value = outputValue(outputs, quantity);
  return typeof value === "number" ? value : Number.NaN;
}

/**
 * The applicability rows the library says the call broke: the `range` rows of
 * the outputs' `warnings` (ADR-0002 decision 23). A `notice` row is no bound,
 * and is not read.
 */
export function rangeRowsOf(outputs: ModelOutputs): readonly Extract<ModelWarning, { kind: "range" }>[] {
  return outputs.warnings.filter((warning) => warning.kind === "range");
}
