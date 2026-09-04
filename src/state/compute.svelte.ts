import type { Measure, Quantity } from "jsthermalcomfort/io";
import { untrack } from "svelte";
import type { ChartRequest, ChartSpec } from "$lib/core/charts/chartSpec";
import { dynamicSpec } from "$lib/core/charts/dynamicChart";
import { psychrometricSpec } from "$lib/core/charts/psychrometricChart";
import { chartType } from "$lib/core/chartType";
import { outOfRangeInputs, toLibraryInputs } from "$lib/core/libraryInputs";
import { dynamicChartOf, psychrometricChartOf } from "$lib/core/modelDeclaration";
import { copy } from "$lib/text/copy";
import type { Session } from "./session.svelte";

/** Derived from the session, never persisted (ADR §4.5). */
export class Outputs {
  // `$state.raw`: measures and quantities are compared by identity with the
  // library's objects, which a deep proxy would break. Replaced, never mutated.
  /** Last valid measures per slot. Kept as they are while an input is out of range. */
  perSlot = $state.raw<readonly (readonly Measure[] | null)[]>([null, null, null]);
  /** Entered quantities currently outside the model's applicability limits. */
  outOfRange = $state.raw<readonly Quantity[]>([]);
  /** Last valid chart, likewise kept while an input is out of range. */
  chart = $state.raw<ChartSpec | null>(null);
}

/**
 * Observe the session and write `outputs`. Call once during component init.
 *
 * Everything still runs synchronously on the main thread. The rewrite plan asks
 * for that to be measured before a Worker is wired up, and it was: the 100×100
 * grid of `pmv_ppd_iso` takes about 20 ms and one comfort zone about 2 ms, both
 * far under the 300 ms the plan sets as the threshold. ADR §4.7's figures say
 * the models that do stall — ASHRAE PMV's cooling effect, PHS — arrive after
 * v1.
 *
 * ponytail: synchronous compute, no stale-result stamp. Move the body behind
 * `workers/compute.worker.ts` and Comlink the moment a model measurably stalls.
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
    outputs.chart = chartSpecOf(session);
  });
}

/** The spec for the chart the session currently shows, or `null` when it declares none. */
function chartSpecOf(session: Session): ChartSpec | null {
  const model = session.model;
  const request: ChartRequest = {
    model,
    slot: session.slots[0],
    slotLabel: copy.slotName(0),
    unitSystem: session.unitSystem,
  };
  if (session.chart.type === chartType.psychrometric) {
    const declaration = psychrometricChartOf(model);
    if (declaration) {
      return psychrometricSpec(request, declaration);
    }
  }
  const dynamic = dynamicChartOf(model);
  return dynamic ? dynamicSpec(request, dynamic, session.chart.axes) : null;
}
