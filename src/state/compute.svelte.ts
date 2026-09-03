import type { Measure, Quantity } from "jsthermalcomfort/io";
import { untrack } from "svelte";
import { outOfRangeInputs, toLibraryInputs } from "$lib/core/libraryInputs";
import type { Session } from "./session.svelte";

/** Derived from the session, never persisted (ADR §4.5). */
export class Outputs {
  // `$state.raw`: measures and quantities are compared by identity with the
  // library's objects, which a deep proxy would break. Replaced, never mutated.
  /** Last valid measures per slot. Kept as they are while an input is out of range. */
  perSlot = $state.raw<readonly (readonly Measure[] | null)[]>([null, null, null]);
  /** Entered quantities currently outside the model's applicability limits. */
  outOfRange = $state.raw<readonly Quantity[]>([]);
}

/**
 * Observe the session and write `outputs`. Call once during component init.
 *
 * Phase 2 runs the model synchronously on the main thread. Phase 3 replaces the
 * body with the Comlink worker call and a stamp that discards stale results
 * (ADR §4.7; rewrite plan, Phase 3 step 6). The shape stays: this effect is
 * the one place that turns inputs into outputs.
 */
export function observeSession(session: Session, outputs: Outputs): void {
  $effect(() => {
    const model = session.model;
    const slot = session.slots[0];
    const outOfRange = outOfRangeInputs(slot, model);
    outputs.outOfRange = outOfRange;
    if (outOfRange.length > 0) {
      return;
    }
    const measures = model.run(toLibraryInputs(slot, model)).toMeasures();
    // Untracked: reading perSlot here would make the write below re-run the effect.
    outputs.perSlot = untrack(() => outputs.perSlot).map((kept, index) => (index === 0 ? measures : kept));
  });
}
