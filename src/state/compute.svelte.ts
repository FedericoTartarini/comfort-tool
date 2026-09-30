import {
  isAtmosphericPressureOutOfRange,
  outOfRangeQuantities,
  violationRows,
  type ViolationRow,
} from "$lib/core/applicability";
import type { ChartRequest } from "$lib/core/charts/chartRequest";
import type { ChartSpec } from "$lib/core/charts/chartSpec";
import { dynamicAxisQuantities, dynamicSpec, resolvedAxes } from "$lib/core/charts/dynamicChart";
import { psychrometricSpec } from "$lib/core/charts/psychrometricChart";
import { chartType } from "$lib/core/chartType";
import {
  dynamicChartOf,
  psychrometricChartOf,
  type ChartAxes,
  type ModelResult,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import { runOn } from "$lib/core/modelRun";
import type { Quantity } from "$lib/core/quantities";
import type { Slot } from "$lib/core/slot";
import { slotBadges, type SlotBadge } from "$lib/core/slotBadge";
import type { Session } from "./session.svelte";

/**
 * What a completed run leaves behind: the slot it ran on, the model that ran
 * it and the atmospheric pressure it ran at, so the result and the chart kept
 * on screen are of one air (ADR-0002 decision 49). The whole of the app's
 * memory of a run — the result, the rows and the chart are derived from this
 * and nothing is kept of them (ADR-0002 decision 33).
 */
export interface LastValidRun {
  readonly model: RegisteredModel;
  readonly slot: Slot;
  readonly atmosphericPressure: number;
}

/**
 * What the axis picker shows: the quantities it offers and the pair it has
 * selected, both those of the chart on screen (ADR-0002 decision 33, as
 * amended).
 */
export interface DrawnAxes {
  readonly choices: readonly Quantity[];
  readonly selected: ChartAxes;
}

/**
 * Derived from the session, never persisted (ADR §4.5).
 *
 * Compute is synchronous on the main thread (ADR-0002 decision 29): at the
 * 51×51 grid the slowest v1 model scans in 88 ms, so v1 has no Worker and no
 * stale-result stamp. The decision reopens if a v1 model's scan is ever
 * measured past 300 ms.
 *
 * The gate is asked per slot (ADR-0002 decision 52): each slot the outputs
 * are asked about has its own {@link SlotOutputs}, with its own last valid
 * run, so an edit to one slot runs the model and the scan for that slot
 * alone. What every slot shares is judged here once: the atmospheric
 * pressure, whose being out of range closes every slot's gate (ADR-0002
 * decision 49).
 *
 * What the gate freezes is the *result*, not the screen (ADR-0002 decision
 * 33). Remembered are the last valid inputs alone; the result, the violation
 * rows and the chart are derived from them and the session's *current* unit
 * system and chart settings, which are how a result is shown rather than
 * inputs to it. So pressing IP, changing the chart type and changing an axis
 * all reach the screen while the gate is closed, and the numbers do not move.
 * The marker is drawn at the remembered slot, the state the kept numbers
 * describe; the out-of-range entry is already shown by its own input.
 */
export class Outputs {
  readonly #session: Session;
  /**
   * The slots the outputs are asked about, in slot order: slot 1 alone until
   * Compare asks about more (Phase 5).
   */
  readonly #slots: readonly SlotOutputs[];

  /** Judged apart from the entered values: no slot holds the pressure (ADR-0002 decision 49). */
  // `$derived.by` throughout, including here where an expression would read:
  // TypeScript sees a field initializer reaching `this.#session` before the
  // constructor assigns it, and only a closure tells it the read is deferred.
  readonly #atmosphericPressureOutOfRange = $derived.by(() =>
    isAtmosphericPressureOutOfRange(this.#session.atmosphericPressure),
  );

  // The chart and its axes are of the first slot asked about, until the
  // chart's request lists them all.
  readonly #chart = $derived.by((): ChartSpec | null => {
    const [first] = this.#slots;
    const last = first.lastValid;
    return last ? chartSpecOf(this.#session, first.badge, last) : null;
  });

  readonly #drawnAxes = $derived.by((): DrawnAxes | null => {
    const [first] = this.#slots;
    const last = first.lastValid;
    return last ? drawnAxesOf(this.#session, last) : null;
  });

  constructor(session: Session) {
    this.#session = session;
    const atmosphericPressureOutOfRange = () => this.#atmosphericPressureOutOfRange;
    this.#slots = [new SlotOutputs(session, 0, atmosphericPressureOutOfRange)];
  }

  /** What each slot the outputs are asked about shows, in slot order. */
  get slots(): readonly SlotOutputs[] {
    return this.#slots;
  }

  /** Whether the session's atmospheric pressure is outside its bound. */
  get atmosphericPressureOutOfRange(): boolean {
    return this.#atmosphericPressureOutOfRange;
  }

  /**
   * The chart of the last valid inputs, in the unit system and the chart
   * settings the session holds now — both pass through a closed gate.
   */
  get chart(): ChartSpec | null {
    return this.#chart;
  }

  /**
   * The axes {@link chart} is drawn on and the ones the picker offers beside
   * them, resolved from the same last valid inputs, so a closed gate never
   * leaves the picker in an entry mode the chart is not drawn in. `null` when
   * the chart on screen has no axis to pick: none is drawn, it is not the
   * dynamic chart, or its axes are locked.
   */
  get drawnAxes(): DrawnAxes | null {
    return this.#drawnAxes;
  }
}

/**
 * What one slot shows: its gate, its last valid run, and the result and the
 * violation rows derived from that run (ADR-0002 decision 52).
 *
 * No effect. The single stateful rule — while an entered value is outside the
 * model's applicability, or the atmospheric pressure outside its bound, the
 * slot's last valid result, its rows and the last chart stay on screen — is
 * served by {@link SlotOutputs.#remembered}, a plain field holding
 * {@link SlotOutputs.#lastValid}'s own last output. A plain field rather
 * than `$state` because Svelte disallows a state write inside a derivation,
 * and it needs none: the memory is what that derivation last returned, so
 * recomputing changes nothing when the gate blocks and reproduces the same
 * value when it does not.
 *
 * A run is remembered for one model. A pass whose model differs from the
 * remembered one starts with nothing remembered, so a model reached with an
 * entry out of range — a typed URL, the back button, a share link, none of
 * which passes the switch dialog — shows an empty result rather than the
 * previous model's numbers under the new model's name.
 *
 * The derivation is split so that Svelte's own equality stops a blocked pass
 * at {@link SlotOutputs.#lastValid}: it returns the remembered object *by
 * identity*, so a `$derived` that reads it is not invalidated, and typing
 * further out-of-range values re-runs neither the model nor the 51×51 scan.
 * That is also why the remembered slot is a detached copy — holding the
 * slot's own `SvelteMap` would make every derivation below a reader of the
 * live slot again, and the equality would stop nothing.
 */
export class SlotOutputs {
  /** Which of the session's slots this is, from 0. */
  readonly position: number;
  /** The name and hue {@link position} gives the slot. */
  readonly badge: SlotBadge;
  readonly #session: Session;
  readonly #slot: Slot;
  readonly #atmosphericPressureOutOfRange: () => boolean;
  /** What {@link #lastValid} last returned. Written and read only there. */
  #remembered: LastValidRun | null = null;

  /** Entered values the gate stops right now — the one thing that is never kept. */
  // `$derived.by` throughout, for the reason `Outputs` gives.
  readonly #outOfRangeQuantities = $derived.by(() =>
    outOfRangeQuantities(this.#slot, this.#session.model, this.#session.atmosphericPressure),
  );

  readonly #notCalculated = $derived.by(
    () => this.#outOfRangeQuantities.length > 0 || this.#atmosphericPressureOutOfRange(),
  );

  readonly #lastValid = $derived.by((): LastValidRun | null => {
    const session = this.#session;
    const model = session.model;
    // A remembered run belongs to the model that made it, and to no other.
    const kept = this.#remembered?.model === model ? this.#remembered : null;
    this.#remembered = this.#notCalculated
      ? kept
      : { model, slot: detach(this.#slot), atmosphericPressure: session.atmosphericPressure };
    return this.#remembered;
  });

  // No `$state.raw` guard is needed on what comes out: `$derived` leaves an
  // object as it is rather than wrapping it in a deep proxy, so the results,
  // the chart spec and the Quantity objects keep the identity the library and
  // `core/quantities.ts` gave them.
  readonly #result = $derived.by((): ModelResult | null => {
    const last = this.#lastValid;
    return last ? runOn(last.slot, last.model, last.atmosphericPressure) : null;
  });

  readonly #violations = $derived.by((): readonly ViolationRow[] => {
    const last = this.#lastValid;
    const result = this.#result;
    return last && result ? violationRows(last.model, result) : [];
  });

  /**
   * The slot at `position` in `session`, whose gate the session-wide
   * `atmosphericPressureOutOfRange` closes as well.
   */
  constructor(session: Session, position: number, atmosphericPressureOutOfRange: () => boolean) {
    this.position = position;
    this.badge = slotBadges[position];
    this.#session = session;
    this.#slot = session.slots[position];
    this.#atmosphericPressureOutOfRange = atmosphericPressureOutOfRange;
  }

  /** The last valid result. Kept as it is while an input is out of range. */
  get result(): ModelResult | null {
    return this.#result;
  }

  /** Entered quantities currently outside the model's applicability limits. Never the pressure. */
  get outOfRangeQuantities(): readonly Quantity[] {
    return this.#outOfRangeQuantities;
  }

  /**
   * Whether the gate is closed: an entered value or the pressure is out of
   * range, so nothing is calculated and the last valid result stays.
   */
  get notCalculated(): boolean {
    return this.#notCalculated;
  }

  /**
   * Applicability rows the slot's last run broke (`core/applicability.ts`),
   * kept with the result they describe: not touched while the gate blocks a run.
   */
  get violations(): readonly ViolationRow[] {
    return this.#violations;
  }

  /** The run the result, the rows and the chart are derived from, or `null` before one. */
  get lastValid(): LastValidRun | null {
    return this.#lastValid;
  }
}

/**
 * `slot`'s entered values and options, detached from the slot: plain `Map`s,
 * so what is remembered stops moving when the slot does, and reading it later
 * subscribes to nothing. The two entry-mode objects are replaced rather than mutated
 * (`state/session.svelte.ts`), so they are kept by reference, and an absent
 * humidity stays absent.
 */
function detach(slot: Slot): Slot {
  return {
    values: new Map(slot.values),
    humidity: slot.humidity,
    temperature: slot.temperature,
    options: new Map(slot.options),
  };
}

/**
 * The spec for the chart the session currently shows of `last`'s slot, the
 * one `badge` names, or `null` when the model declares none. `last.model` is
 * the session's own — {@link SlotOutputs.lastValid} remembers no other — so
 * the session's chart settings are this model's.
 */
function chartSpecOf(session: Session, badge: SlotBadge, last: LastValidRun): ChartSpec | null {
  const model = last.model;
  const request: ChartRequest = {
    model,
    slots: [{ ...badge, slot: last.slot }],
    unitSystem: session.unitSystem,
    atmosphericPressure: last.atmosphericPressure,
  };
  if (session.chart.type === chartType.psychrometric) {
    const psychrometric = psychrometricChartOf(model);
    if (psychrometric) {
      return psychrometricSpec(request, psychrometric);
    }
  }
  const dynamic = dynamicChartOf(model);
  return dynamic ? dynamicSpec(request, dynamic, session.chart.axes) : null;
}

/**
 * The picker's axes for the chart {@link chartSpecOf} draws of `last`'s
 * slot. The chart keeps the axis the user picked; the entry mode of that
 * slot decides which temperature quantity that is.
 */
function drawnAxesOf(session: Session, last: LastValidRun): DrawnAxes | null {
  if (session.chart.type !== chartType.dynamic) {
    return null;
  }
  const mode = last.slot.temperature.mode;
  const choices = dynamicAxisQuantities(last.model, mode);
  // A polygons chart offers none: its axes are locked (ADR-0002 decision 37).
  if (choices.length === 0) {
    return null;
  }
  return { choices, selected: resolvedAxes(last.model, session.chart.axes, mode) };
}
