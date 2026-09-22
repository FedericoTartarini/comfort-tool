import { outOfRangeInputs, violationRows, type ViolationRow } from "$lib/core/applicability";
import type { ChartRequest, ChartSpec } from "$lib/core/charts/chartSpec";
import { dynamicSpec } from "$lib/core/charts/dynamicChart";
import { psychrometricSpec } from "$lib/core/charts/psychrometricChart";
import { chartType } from "$lib/core/chartType";
import { toLibraryInputs, type SlotInputs } from "$lib/core/libraryInputs";
import {
  dynamicChartOf,
  psychrometricChartOf,
  type ModelResult,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import { copy } from "$lib/text/copy";
import type { Session } from "./session.svelte";

/**
 * What a completed run leaves behind: the inputs it ran on, and the model that
 * ran them. The whole of the app's memory of a run — the result, the rows and
 * the chart are derived from this and nothing is kept of them (ADR-0002
 * decision 33).
 */
interface LastValidInputs {
  readonly model: RegisteredModel;
  readonly inputs: SlotInputs;
}

/**
 * Derived from the session, never persisted (ADR §4.5).
 *
 * Compute is synchronous on the main thread (ADR-0002 decision 29): at the
 * 51×51 grid the slowest v1 model scans in 88 ms, so v1 has no Worker and no
 * stale-result stamp. The decision reopens if a v1 model's scan is ever
 * measured past 300 ms.
 *
 * No effect. The single stateful rule — while an entered value is outside the
 * model's applicability, the last valid result, its rows and the last chart
 * stay on screen — is served by {@link Outputs.#remembered}, a plain field
 * holding {@link Outputs.#lastValid}'s own last output. A plain field rather
 * than `$state` because Svelte disallows a state write inside a derivation,
 * and it needs none: the memory is what that derivation last returned, so
 * recomputing changes nothing when the gate blocks and reproduces the same
 * value when it does not.
 *
 * What the gate freezes is the *result*, not the screen (ADR-0002 decision
 * 33). Remembered are the last valid inputs alone; the result, the violation
 * rows and the chart are derived from them and the session's *current* unit
 * system and chart settings, which are how a result is shown rather than
 * inputs to it. So pressing IP, changing the chart type and changing an axis
 * all reach the screen while the gate is closed, and the numbers do not move.
 * The marker is drawn at the remembered inputs, the state the kept numbers
 * describe; the out-of-range entry is already shown by its own input.
 *
 * A run is remembered for one model. A pass whose model differs from the
 * remembered one starts with nothing remembered, so a model reached with an
 * entry out of range — a typed URL, the back button, a share link, none of
 * which passes the switch dialog — shows an empty result rather than the
 * previous model's numbers under the new model's name.
 *
 * The derivation is split so that Svelte's own equality stops a blocked pass
 * at {@link Outputs.#lastValid}: it returns the remembered object *by
 * identity*, so a `$derived` that reads it is not invalidated, and typing
 * further out-of-range values re-runs neither the model nor the 51×51 scan.
 * That is also why the remembered inputs are a detached copy — holding the
 * slot's own `SvelteMap` would make every derivation below a reader of the
 * live slot again, and the equality would stop nothing.
 */
export class Outputs {
  readonly #session: Session;
  /** What {@link #lastValid} last returned. Written and read only there. */
  #remembered: LastValidInputs | null = null;

  /** Entered values the gate stops right now — the one thing that is never kept. */
  // `$derived.by` throughout, including here where an expression would read:
  // TypeScript sees a field initializer reaching `this.#session` before the
  // constructor assigns it, and only a closure tells it the read is deferred.
  readonly #outOfRange = $derived.by(() => outOfRangeInputs(this.#session.slots[0], this.#session.model));

  readonly #lastValid = $derived.by((): LastValidInputs | null => {
    const session = this.#session;
    const model = session.model;
    // A remembered run belongs to the model that made it, and to no other.
    const kept = this.#remembered?.model === model ? this.#remembered : null;
    this.#remembered = this.#outOfRange.length === 0 ? { model, inputs: detach(session.slots[0]) } : kept;
    return this.#remembered;
  });

  // No `$state.raw` guard is needed on what comes out: `$derived` leaves an
  // object as it is rather than wrapping it in a deep proxy, so the results,
  // the chart spec and the Quantity objects keep the identity the library and
  // `core/quantities.ts` gave them.
  readonly #perSlot = $derived.by((): readonly (ModelResult | null)[] => {
    const last = this.#lastValid;
    // Slots 1 and 2 are Compare's (Phase 5); nothing runs them yet, and
    // nothing keeps a result for them across a model change either.
    return [last ? last.model.run(toLibraryInputs(last.inputs, last.model)) : null, null, null];
  });

  readonly #violations = $derived.by((): readonly ViolationRow[] => {
    const last = this.#lastValid;
    const result = this.#perSlot[0];
    return last && result ? violationRows(last.model, result) : [];
  });

  readonly #chart = $derived.by((): ChartSpec | null => {
    const last = this.#lastValid;
    return last ? chartSpecOf(this.#session, last) : null;
  });

  constructor(session: Session) {
    this.#session = session;
  }

  /** Last valid result per slot. Kept as it is while an input is out of range. */
  get perSlot(): readonly (ModelResult | null)[] {
    return this.#perSlot;
  }

  /** Entered quantities currently outside the model's applicability limits. */
  get outOfRange(): readonly Quantity[] {
    return this.#outOfRange;
  }

  /**
   * Applicability rows slot 0's last run broke (`core/applicability.ts`), kept
   * with the result they describe: not touched while the gate blocks a run.
   */
  get violations(): readonly ViolationRow[] {
    return this.#violations;
  }

  /**
   * The chart of the last valid inputs, in the unit system and the chart
   * settings the session holds now — both pass through a closed gate.
   */
  get chart(): ChartSpec | null {
    return this.#chart;
  }
}

/**
 * `slot`'s entered values, detached from the slot: a plain `Map`, so what is
 * remembered stops moving when the slot does, and reading it later subscribes
 * to nothing. The two entry-mode objects are replaced rather than mutated
 * (`state/session.svelte.ts`), so they are kept by reference.
 */
function detach(slot: SlotInputs): SlotInputs {
  return { values: new Map(slot.values), humidity: slot.humidity, temperature: slot.temperature };
}

/**
 * The spec for the chart the session currently shows of `last`'s inputs, or
 * `null` when the model declares none. `last.model` is the session's own —
 * {@link Outputs.#lastValid} remembers no other — so the session's chart
 * settings are this model's.
 */
function chartSpecOf(session: Session, last: LastValidInputs): ChartSpec | null {
  const model = last.model;
  const request: ChartRequest = {
    model,
    slot: last.inputs,
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
