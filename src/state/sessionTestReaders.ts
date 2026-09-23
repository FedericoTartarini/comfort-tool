/**
 * How the session tests read a session's state: a slot as plain data, and a
 * value the result table would show. Shared by `session.svelte.test.ts` and
 * `sessionModelSwitch.svelte.test.ts` so that both compare the same way.
 */
import { resultValue } from "$lib/core/libraryInputs";
import type { ModelResult } from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import type { InputSlot } from "./session.svelte";

/** Everything a slot holds, as plain data a comparison can be made against. */
export function shapeOf(slot: InputSlot) {
  return {
    values: new Map(slot.values),
    humidity: slot.humidity,
    temperature: slot.temperature,
    options: new Map(slot.options),
  };
}

/** A value the result table would show, read through the app's own accessor. */
export function resultValueOf(result: ModelResult | null, quantity: Quantity) {
  return result === null ? undefined : resultValue(result, quantity);
}
