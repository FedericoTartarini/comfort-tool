import { outOfRangeInputs, violationRows, type ViolationRow } from "$lib/core/applicability";
import type { ChartRequest, ChartSpec } from "$lib/core/charts/chartSpec";
import { dynamicSpec } from "$lib/core/charts/dynamicChart";
import { psychrometricSpec } from "$lib/core/charts/psychrometricChart";
import { chartType } from "$lib/core/chartType";
import { toLibraryInputs } from "$lib/core/libraryInputs";
import { dynamicChartOf, psychrometricChartOf, type ModelResult } from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import { copy } from "$lib/text/copy";
import type { Session } from "./session.svelte";

/** What a completed run leaves behind, and what stays on screen while the gate blocks the next one. */
interface LastValid {
  readonly perSlot: readonly (ModelResult | null)[];
  readonly violations: readonly ViolationRow[];
  readonly chart: ChartSpec | null;
}

/** Everything {@link Outputs} exposes: the last run, plus what the gate says about right now. */
interface CurrentOutputs extends LastValid {
  readonly outOfRange: readonly Quantity[];
}

/**
 * Derived from the session, never persisted (ADR §4.5).
 *
 * Compute is synchronous on the main thread (ADR-0002 decision 29): at the
 * 51×51 grid the slowest v1 model scans in 88 ms, so v1 has no Worker and no
 * stale-result stamp. The decision reopens if a v1 model's scan is ever
 * measured past 300 ms.
 *
 * One derivation, no effect. The single stateful rule — while an entered value
 * is outside the model's applicability, the last valid result, its rows and
 * the last chart stay on screen — is served by {@link Outputs.#lastValid}, a
 * plain field holding the derivation's own last output. A plain field rather
 * than `$state` because Svelte disallows a state write inside a derivation,
 * and it needs none: the memory is what this derivation last returned, so
 * recomputing changes nothing when the gate blocks and reproduces the same
 * value when it does not.
 *
 * What the gate freezes it freezes whole. While it blocks, this returns the
 * last output untouched, so a chart kept that way also keeps the unit system
 * and axes it was built under: the derivation returns before it reads either,
 * and they are not dependencies of a blocked pass. Switching SI to IP with an
 * entry out of range therefore converts the input panel and the result table,
 * which read the session directly, and leaves the chart's axes as they were
 * until the entry is back in range. That is the contract carried over from the
 * `$effect` this replaced and left unchanged on purpose (spec, "Synchronous
 * compute": the observable contract is unchanged); whether a unit switch
 * should survive the gate is recorded as a follow-up on ticket 05.
 */
export class Outputs {
  readonly #session: Session;
  /** The last completed run. Replaced by the derivation below, read by nothing else. */
  #lastValid: LastValid = { perSlot: [null, null, null], violations: [], chart: null };

  // No `$state.raw` guard is needed on what comes out: `$derived` leaves an
  // object as it is rather than wrapping it in a deep proxy, so the results,
  // the chart spec and the Quantity objects keep the identity the library and
  // `core/quantities.ts` gave them.
  readonly #current = $derived.by((): CurrentOutputs => {
    const session = this.#session;
    const model = session.model;
    const slot = session.slots[0];
    const outOfRange = outOfRangeInputs(slot, model);
    if (outOfRange.length === 0) {
      const result = model.run(toLibraryInputs(slot, model));
      this.#lastValid = {
        perSlot: this.#lastValid.perSlot.map((kept, index) => (index === 0 ? result : kept)),
        violations: violationRows(model, result),
        chart: chartSpecOf(session),
      };
    }
    return { outOfRange, ...this.#lastValid };
  });

  constructor(session: Session) {
    this.#session = session;
  }

  /** Last valid result per slot. Kept as it is while an input is out of range. */
  get perSlot(): readonly (ModelResult | null)[] {
    return this.#current.perSlot;
  }

  /** Entered quantities currently outside the model's applicability limits. */
  get outOfRange(): readonly Quantity[] {
    return this.#current.outOfRange;
  }

  /**
   * Applicability rows slot 0's last run broke (`core/applicability.ts`), kept
   * with the result they describe: not touched while the gate blocks a run.
   */
  get violations(): readonly ViolationRow[] {
    return this.#current.violations;
  }

  /** Last valid chart, likewise kept while an input is out of range. */
  get chart(): ChartSpec | null {
    return this.#current.chart;
  }
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
    if (psychrometricChartOf(model)) {
      return psychrometricSpec(request);
    }
  }
  const dynamic = dynamicChartOf(model);
  return dynamic ? dynamicSpec(request, dynamic, session.chart.axes) : null;
}
