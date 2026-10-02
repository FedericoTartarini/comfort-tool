import {
  isAtmosphericPressureOutOfRange,
  outOfRangeQuantities,
  violationRows,
  type ViolationRow,
} from "$lib/core/applicability";
import type { BandList } from "$lib/core/bands";
import type { ChartRequest } from "$lib/core/charts/chartRequest";
import type { ChartSpec } from "$lib/core/charts/chartSpec";
import { dynamicAxisQuantities, dynamicScanFrameFor, dynamicSpec, resolvedAxes } from "$lib/core/charts/dynamicChart";
import { psychrometricScanFrameFor, psychrometricSpec } from "$lib/core/charts/psychrometricChart";
import { scannedField, type ScanFrame, type ScannedField } from "$lib/core/charts/specParts";
import { chartType } from "$lib/core/chartType";
import {
  dynamicChartOf,
  isPolygonsChart,
  psychrometricChartOf,
  type ChartAxes,
  type DeclaredPsychrometricChart,
  type ModelResult,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import { runOn } from "$lib/core/modelRun";
import { page } from "$lib/core/page";
import type { Quantity } from "$lib/core/quantities";
import { areSameEntryModes, type Slot, type ValueEntryModes } from "$lib/core/slot";
import { slotBadges, type SlotBadge } from "$lib/core/slotBadge";
import type { InputSlot, Session, SlotPosition } from "./session.svelte";

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
 * The gate is asked per slot (ADR-0002 decision 52): each compared slot has
 * its own {@link SlotOutputs}, with its own last valid run and its own scan,
 * so an edit to one slot runs the model and the scan for that slot alone. All
 * three are built up front and kept, so a slot disabled and enabled again
 * finds its memory; one that is not compared is not read, and a derivation
 * not read does not run. What every slot shares is judged here once: the
 * atmospheric pressure, whose being out of range closes every slot's gate
 * (ADR-0002 decision 49), and the frame every slot is scanned in.
 *
 * The chart is of every compared slot that has a run (ADR-0002 decision 50),
 * drawn at the atmospheric pressure of the first: slot 1's, unless slot 1 has
 * none. One pressure for the whole chart, so a slot kept from a run at
 * another pressure is drawn at this one. Its axes are resolved from the
 * session's entry modes, which no slot decides (ADR-0002 decision 51).
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
  /** One per slot of the session, by position, whether it is compared or not. */
  readonly #everySlot: readonly [SlotOutputs, SlotOutputs, SlotOutputs];

  /** Judged apart from the entered values: no slot holds the pressure (ADR-0002 decision 49). */
  // `$derived.by` throughout, including here where an expression would read:
  // TypeScript sees a field initializer reaching `this.#session` before the
  // constructor assigns it, and only a closure tells it the read is deferred.
  readonly #atmosphericPressureOutOfRange = $derived.by(() =>
    isAtmosphericPressureOutOfRange(this.#session.atmosphericPressure),
  );

  readonly #compared = $derived.by((): readonly SlotOutputs[] =>
    this.#session.comparedPositions.map((position) => this.#everySlot[position]),
  );

  /** The compared slots the chart is drawn of, each with its run: those that have one. */
  readonly #charted = $derived.by((): readonly ChartedRun[] =>
    this.#compared.flatMap((outputs) => (outputs.lastValid ? [{ outputs, last: outputs.lastValid }] : [])),
  );

  // The session's entry modes and the pressure the chart is drawn at, each
  // its own derivation: enabling a slot recomputes both, and an edit to the
  // first recomputes the pressure, each to the same value, and their equality
  // keeps every other slot's scan from running again. The modes are read into
  // a new object each time, so the derivation hands back its own last output
  // while they are the same modes, kept in a plain field as
  // `SlotOutputs.#remembered` is.
  #rememberedEntryModes: ValueEntryModes | null = null;
  readonly #entryModes = $derived.by((): ValueEntryModes => {
    const modes = this.#session.entryModes;
    const remembered = this.#rememberedEntryModes;
    this.#rememberedEntryModes = remembered && areSameEntryModes(remembered, modes) ? remembered : modes;
    return this.#rememberedEntryModes;
  });
  readonly #chartPressure = $derived.by((): number | null => this.#charted[0]?.last.atmosphericPressure ?? null);

  /** The Band list the charts paint: the current model's on Explore, none on Standard (ADR-0002 decision 58). */
  readonly #paintedBands = $derived.by((): BandList | null =>
    this.#session.page === page.explore ? this.#session.chart.bands : null,
  );

  /**
   * What every slot's scan of the chart on screen shares (ADR-0002 decision
   * 61): the psychrometric chart's frame, the scanned dynamic chart's, or
   * `null` while it is a polygons chart, or none is drawn. It reads neither
   * the page nor the Band list, so a band edit rescans nothing.
   */
  readonly #scanFrame = $derived.by((): ScanFrame | null => {
    const session = this.#session;
    const pressure = this.#chartPressure;
    if (pressure === null) {
      return null;
    }
    if (drawnPsychrometricOf(session)) {
      return psychrometricScanFrameFor(session.model, this.#entryModes, pressure);
    }
    const chart = dynamicChartOf(session.model);
    return chart && !isPolygonsChart(chart)
      ? dynamicScanFrameFor(session.model, session.chart.axes, this.#entryModes, pressure)
      : null;
  });

  readonly #chart = $derived.by((): ChartSpec | null => {
    const charted = this.#charted;
    if (charted.length === 0) {
      return null;
    }
    // A chart with a frame is scanned, and each slot keeps its scan of it.
    const scans = this.#scanFrame ? charted.map(({ outputs }) => outputs.scan) : undefined;
    return chartSpecOf(this.#session, charted, this.#paintedBands, scans);
  });

  readonly #drawnAxes = $derived.by((): DrawnAxes | null =>
    this.#charted.length > 0 ? drawnAxesOf(this.#session) : null,
  );

  constructor(session: Session) {
    this.#session = session;
    const atmosphericPressureOutOfRange = () => this.#atmosphericPressureOutOfRange;
    const scanFrame = () => this.#scanFrame;
    const slotAt = (position: SlotPosition) => new SlotOutputs(session, position, atmosphericPressureOutOfRange, scanFrame);
    this.#everySlot = [slotAt(0), slotAt(1), slotAt(2)];
  }

  /** What each compared slot shows, in slot order: slot 1 first, and alone while Compare is off. */
  get slots(): readonly SlotOutputs[] {
    return this.#compared;
  }

  /** Whether the session's atmospheric pressure is outside its bound. */
  get atmosphericPressureOutOfRange(): boolean {
    return this.#atmosphericPressureOutOfRange;
  }

  /**
   * The chart of every compared slot's last valid inputs, in the unit system
   * and the chart settings the session holds now — both pass through a
   * closed gate.
   */
  get chart(): ChartSpec | null {
    return this.#chart;
  }

  /**
   * The axes {@link chart} is drawn on and the ones the picker offers beside
   * them, resolved from the same entry mode, the session's, so the picker is
   * never in an entry mode the chart is not drawn in. `null` when
   * the chart on screen has no axis to pick: none is drawn, it is not the
   * dynamic chart, or its axes are locked.
   */
  get drawnAxes(): DrawnAxes | null {
    return this.#drawnAxes;
  }
}

/**
 * What one slot shows: its gate, its last valid run, and the result and the
 * violation rows derived from that run (ADR-0002 decision 52). Read only
 * while its slot is compared, and so holds values.
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
  readonly position: SlotPosition;
  /** The name and hue {@link position} gives the slot. */
  readonly badge: SlotBadge;
  readonly #session: Session;
  readonly #atmosphericPressureOutOfRange: () => boolean;
  readonly #scanFrame: () => ScanFrame | null;
  /** What {@link #lastValid} last returned. Written and read only there. */
  #remembered: LastValidRun | null = null;

  /**
   * The session's slot at {@link position}. A slot is held once it is first
   * enabled, and the tuple the session replaces then is read here alone, so
   * that enabling another slot, a new tuple holding this same slot, stops at
   * this derivation's equality and runs nothing below it.
   */
  // `$derived.by` throughout, for the reason `Outputs` gives.
  readonly #slot = $derived.by((): InputSlot => {
    const slot = this.#session.slots[this.position];
    if (!slot) {
      throw new Error(`${this.badge.name} is read before it was ever enabled, and holds nothing`);
    }
    return slot;
  });

  /** Entered values the gate stops right now — the one thing that is never kept. */
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
    return last && result ? violationRows(last.model, result, this.#session.entryModes) : [];
  });

  // Of the last valid run, so a closed gate stops here too; and of the shared
  // frame, which an edit to another slot leaves as it was.
  readonly #scan = $derived.by((): ScannedField => {
    const frame = this.#scanFrame();
    const last = this.#lastValid;
    if (!frame || !last) {
      throw new Error(`${this.badge.name} is scanned while no scanned chart is drawn of a run of it`);
    }
    return scannedField(frame, last.slot);
  });

  /**
   * The slot at `position` in `session`, whose gate the session-wide
   * `atmosphericPressureOutOfRange` closes as well, scanned in the chart's
   * shared `scanFrame`.
   */
  constructor(
    session: Session,
    position: SlotPosition,
    atmosphericPressureOutOfRange: () => boolean,
    scanFrame: () => ScanFrame | null,
  ) {
    this.position = position;
    this.badge = slotBadges[position];
    this.#session = session;
    this.#atmosphericPressureOutOfRange = atmosphericPressureOutOfRange;
    this.#scanFrame = scanFrame;
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
   * kept with the result they describe: not touched while the gate blocks a
   * run, and reported on the rows of the session's entry modes, the ones the
   * person sees (ADR-0002 decision 54).
   */
  get violations(): readonly ViolationRow[] {
    return this.#violations;
  }

  /** The run the result, the rows and the chart are derived from, or `null` before one. */
  get lastValid(): LastValidRun | null {
    return this.#lastValid;
  }

  /**
   * The slot's scan of the chart on screen, of its last valid run (ADR-0002
   * decision 61): the psychrometric chart's or the scanned dynamic chart's.
   * Read only while that chart is scanned, not a polygons chart, and the slot
   * has a run.
   */
  get scan(): ScannedField {
    return this.#scan;
  }
}

/** A compared slot the chart is drawn of, with the run it is drawn at. */
interface ChartedRun {
  readonly outputs: SlotOutputs;
  readonly last: LastValidRun;
}

/**
 * `slot`'s entered values and options, detached from the slot: plain `Map`s,
 * so what is remembered stops moving when the slot does, and reading it later
 * subscribes to nothing. The entry-mode objects are replaced rather than mutated
 * (`state/session.svelte.ts`), so they are kept by reference, and an absent
 * humidity stays absent.
 */
function detach(slot: Slot): Slot {
  return {
    values: new Map(slot.values),
    humidity: slot.humidity,
    temperature: slot.temperature,
    airSpeed: slot.airSpeed,
    clothing: slot.clothing,
    options: new Map(slot.options),
  };
}

/**
 * The psychrometric chart, while it is the one the session shows: the type
 * set, and the model declares one. Otherwise the dynamic chart is shown.
 */
function drawnPsychrometricOf(session: Session): DeclaredPsychrometricChart | undefined {
  return session.chart.type === chartType.psychrometric ? psychrometricChartOf(session.model) : undefined;
}

/**
 * The spec for the chart the session currently shows of the `charted` slots,
 * at the first one's atmospheric pressure, painting `bands` or, for `null`,
 * the Comfort zones, or `null` when the model declares none. Each run's model
 * is the session's own — {@link SlotOutputs.lastValid} remembers no other —
 * so the session's chart settings are this model's.
 * `scans` are the `charted` slots' scans of the chart drawn, in their order,
 * which the builder paints rather than scanning; none for a polygons chart.
 */
function chartSpecOf(
  session: Session,
  charted: readonly ChartedRun[],
  bands: BandList | null,
  scans: readonly ScannedField[] | undefined,
): ChartSpec | null {
  const request: ChartRequest = {
    model: session.model,
    slots: charted.map(({ outputs, last }) => ({ ...outputs.badge, slot: last.slot })),
    unitSystem: session.unitSystem,
    entryModes: session.entryModes,
    atmosphericPressure: charted[0].last.atmosphericPressure,
    bands,
  };
  const psychrometric = drawnPsychrometricOf(session);
  if (psychrometric) {
    return psychrometricSpec(request, scans);
  }
  const dynamic = dynamicChartOf(session.model);
  return dynamic ? dynamicSpec(request, dynamic, session.chart.axes, scans) : null;
}

/**
 * The picker's axes for the chart {@link chartSpecOf} draws. The chart keeps
 * the axis the user picked; the session's entry modes decide which quantity
 * of its entry group that is.
 */
function drawnAxesOf(session: Session): DrawnAxes | null {
  if (session.chart.type !== chartType.dynamic) {
    return null;
  }
  const modes = session.entryModes;
  const choices = dynamicAxisQuantities(session.model, modes);
  // A polygons chart offers none: its axes are locked (ADR-0002 decision 37).
  if (choices.length === 0) {
    return null;
  }
  return { choices, selected: resolvedAxes(session.model, session.chart.axes, modes) };
}
