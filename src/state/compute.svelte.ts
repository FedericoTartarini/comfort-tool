import { violationRows, type ViolationRow } from "$lib/core/applicability";
import type { BandList } from "$lib/core/bands";
import type { ChartRequest } from "$lib/core/charts/chartRequest";
import type { ChartSpec } from "$lib/core/charts/chartSpec";
import { adaptiveSpec } from "$lib/core/charts/adaptiveChart";
import { dynamicAxisQuantities, dynamicScanFrameFor, dynamicSpec, resolvedAxes } from "$lib/core/charts/dynamicChart";
import { psychrometricScanFrameFor, psychrometricSpec } from "$lib/core/charts/psychrometricChart";
import { scannedField, type ScanFrame, type ScannedField } from "$lib/core/charts/scan";
import { chartType } from "$lib/core/chartType";
import type { DrawnRun } from "$lib/core/inputSummary";
import type { ChartAxes, ModelResult } from "$lib/core/modelDeclaration";
import { runOn } from "$lib/core/modelRun";
import { paintsBandsOn } from "$lib/core/page";
import type { Quantity } from "$lib/core/quantities";
import { areSameEntryModes, type ValueEntryModes } from "$lib/core/slot";
import { slotBadge, type SlotBadge } from "$lib/core/slotBadge";
import type { InputSlot, Session, SlotPosition } from "./session.svelte";

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
 * Each compared slot has its own {@link SlotOutputs} (ADR-0002 decision 52),
 * with its own run and its own scan, so an edit to one slot runs the model and
 * the scan for that slot alone. All three are built up front, so a slot
 * disabled and enabled again needs nothing built; one that is not compared is
 * not read, and a derivation not read does not run. What every slot shares is
 * judged here once: whether the atmospheric pressure is out of range, and the
 * frame every slot is scanned in.
 *
 * Nothing is kept (ADR-0002 decision 84, rule 9): the result, the violation
 * rows and the chart are derived from the slots as they are, at the session's
 * pressure, in its unit system and chart settings. A committed value is within
 * its bounds; one a writer let through is run, and the library's rows show it
 * as a violation. The chart is of every compared slot (decision 50), its axes
 * resolved from the session's entry modes, which no slot decides (decision 51).
 */
export class Outputs {
  readonly #session: Session;
  /** One per slot of the session, by position, whether it is compared or not. */
  readonly #everySlot: readonly [SlotOutputs, SlotOutputs, SlotOutputs];

  // `$derived.by` throughout, including here where an expression would read:
  // TypeScript sees a field initializer reaching `this.#session` before the
  // constructor assigns it, and only a closure tells it the read is deferred.
  readonly #compared = $derived.by((): readonly SlotOutputs[] =>
    this.#session.comparedPositions.map((position) => this.#everySlot[position]),
  );

  // The session's entry modes, their own derivation: enabling a slot
  // recomputes it to the same modes, and its equality keeps every other
  // slot's scan from running again. The modes are read into a new object each
  // time, so the derivation hands back its own last output while they are the
  // same modes, kept in a plain field, which a derivation may write.
  #rememberedEntryModes: ValueEntryModes | null = null;
  readonly #entryModes = $derived.by((): ValueEntryModes => {
    const modes = this.#session.entryModes;
    const remembered = this.#rememberedEntryModes;
    this.#rememberedEntryModes = remembered && areSameEntryModes(remembered, modes) ? remembered : modes;
    return this.#rememberedEntryModes;
  });
  /** The Band list the charts paint: the current model's on Explore, none on Standard (ADR-0002 decision 58). */
  readonly #paintedBands = $derived.by((): BandList | null =>
    paintsBandsOn(this.#session.page) ? this.#session.chart.bands : null,
  );

  /**
   * What every slot's scan of the chart on screen shares (ADR-0002 decision
   * 61): the psychrometric chart's frame, the dynamic chart's, or `null`
   * while it is the adaptive chart, which scans nothing. It reads neither the
   * page nor the Band list, so a band edit rescans nothing.
   */
  readonly #scanFrame = $derived.by((): ScanFrame | null => {
    const session = this.#session;
    const pressure = session.atmosphericPressure;
    const { type, axes } = session.chart;
    if (type === chartType.psychrometric) {
      return psychrometricScanFrameFor(session.model, this.#entryModes, pressure);
    }
    return type === chartType.dynamic && axes ? dynamicScanFrameFor(session.model, axes, this.#entryModes, pressure) : null;
  });

  readonly #chart = $derived.by((): ChartSpec | null => {
    const compared = this.#compared;
    // A chart with a frame is scanned, and each slot keeps its scan of it.
    const scans = this.#scanFrame ? compared.map((outputs) => outputs.scan) : undefined;
    return chartSpecOf(this.#session, compared, this.#paintedBands, scans);
  });

  readonly #drawnAxes = $derived.by((): DrawnAxes | null => drawnAxesOf(this.#session));

  constructor(session: Session) {
    this.#session = session;
    const scanFrame = () => this.#scanFrame;
    const slotAt = (position: SlotPosition) => new SlotOutputs(session, position, scanFrame);
    this.#everySlot = [slotAt(0), slotAt(1), slotAt(2)];
  }

  /** What each compared slot shows, in slot order: slot 1 first, and alone while Compare is off. */
  get slots(): readonly SlotOutputs[] {
    return this.#compared;
  }

  /** The chart of every compared slot, in the unit system and the chart settings the session holds. */
  get chart(): ChartSpec | null {
    return this.#chart;
  }

  /**
   * The runs {@link chart} is drawn of, in slot order, each with its slot's
   * name where its badge carries one and the violation rows of its run: what
   * an Image's Input summary lists (ADR-0002 decision 64, rule 3; decision
   * 84, rule 8). Read at the click, each slot a copy no later edit reaches,
   * so nothing is kept of it.
   */
  get drawnRuns(): readonly DrawnRun[] {
    return this.#compared.map((outputs) => ({
      name: outputs.badge.name,
      slot: outputs.slot.toSlot(),
      atmosphericPressure: this.#session.atmosphericPressure,
      violations: outputs.violations,
    }));
  }

  /**
   * The axes {@link chart} is drawn on and the ones the picker offers beside
   * them, resolved from the same entry mode, the session's, so the picker is
   * never in an entry mode the chart is not drawn in. `null` when
   * the chart on screen has no axis to pick: it is not the dynamic chart.
   */
  get drawnAxes(): DrawnAxes | null {
    return this.#drawnAxes;
  }
}

/**
 * What one slot shows: the run of the slot as it is, and the violation rows
 * the library reported of it (ADR-0002 decisions 52 and 84, rule 9). Read
 * only while its slot is compared, and so holds values. No effect and no
 * memory: an edit to the slot runs the model again, an edit to another slot
 * does not.
 */
export class SlotOutputs {
  /** Which of the session's slots this is, from 0. */
  readonly position: SlotPosition;
  readonly #session: Session;
  readonly #scanFrame: () => ScanFrame | null;

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
      throw new Error(`The slot at position ${this.position} is read before it was ever enabled, and holds nothing`);
    }
    return slot;
  });

  /** Named as the session says its slots are, so it follows Compare and the page. */
  readonly #badge = $derived.by((): SlotBadge => slotBadge(this.position, this.#session.slotsNamed));

  // No `$state.raw` guard is needed on what comes out: `$derived` leaves an
  // object as it is rather than wrapping it in a deep proxy, so the results,
  // the chart spec and the Quantity objects keep the identity the library and
  // `core/quantities.ts` gave them.
  readonly #result = $derived.by((): ModelResult =>
    runOn(this.#slot, this.#session.model, this.#session.atmosphericPressure),
  );

  readonly #violations = $derived.by((): readonly ViolationRow[] =>
    violationRows(this.#session.model, this.#result, this.#session.entryModes),
  );

  // Of a detached copy of the slot: a region's boundary runs the scanned slot
  // again when it is painted, and the live slot read then would make the
  // painting a reader of the slot's values. Of the shared frame, which an
  // edit to another slot leaves as it was.
  readonly #scan = $derived.by((): ScannedField => {
    const frame = this.#scanFrame();
    if (!frame) {
      throw new Error(`The slot at position ${this.position} is scanned while no scanned chart is drawn`);
    }
    return scannedField(frame, this.#slot.toSlot());
  });

  /** The slot at `position` in `session`, scanned in the chart's shared `scanFrame`. */
  constructor(session: Session, position: SlotPosition, scanFrame: () => ScanFrame | null) {
    this.position = position;
    this.#session = session;
    this.#scanFrame = scanFrame;
  }

  /** The hue {@link position} gives the slot, and its name while the session names its slots. */
  get badge(): SlotBadge {
    return this.#badge;
  }

  /** The slot this shows, as the session holds it. */
  get slot(): InputSlot {
    return this.#slot;
  }

  /** The model's result on the slot as it is. */
  get result(): ModelResult {
    return this.#result;
  }

  /**
   * Applicability rows the slot's run broke (`core/applicability.ts`),
   * reported on the rows of the session's entry modes, the ones the person
   * sees (ADR-0002 decision 54).
   */
  get violations(): readonly ViolationRow[] {
    return this.#violations;
  }

  /**
   * The slot's scan of the chart on screen (ADR-0002 decision 61): the
   * psychrometric chart's or the dynamic chart's. Read only while one of the
   * two is on screen, not the adaptive chart.
   */
  get scan(): ScannedField {
    return this.#scan;
  }
}

/**
 * The spec for the chart the session currently shows of the `compared` slots,
 * built by its type's builder, at the session's atmospheric pressure,
 * painting `bands` or, for `null`, the Comfort zones. The session's chart
 * settings are its model's, and its chart type one the model declares.
 * `scans` are the `compared` slots' scans of the chart drawn, in their order,
 * which the builder paints rather than scanning; none for the adaptive chart.
 */
function chartSpecOf(
  session: Session,
  compared: readonly SlotOutputs[],
  bands: BandList | null,
  scans: readonly ScannedField[] | undefined,
): ChartSpec | null {
  const request: ChartRequest = {
    model: session.model,
    slots: compared.map((outputs) => ({ ...outputs.badge, slot: outputs.slot })),
    unitSystem: session.unitSystem,
    entryModes: session.entryModes,
    atmosphericPressure: session.atmosphericPressure,
    bands,
  };
  const { type, axes } = session.chart;
  if (type === chartType.psychrometric) {
    return psychrometricSpec(request, scans);
  }
  if (type === chartType.adaptive) {
    return adaptiveSpec(request);
  }
  return axes ? dynamicSpec(request, axes, scans) : null;
}

/**
 * The picker's axes for the chart {@link chartSpecOf} draws. The chart keeps
 * the axis the user picked; the session's entry modes decide which quantity
 * of its entry group that is.
 */
function drawnAxesOf(session: Session): DrawnAxes | null {
  const { type, axes } = session.chart;
  if (type !== chartType.dynamic || !axes) {
    return null;
  }
  const modes = session.entryModes;
  return { choices: dynamicAxisQuantities(session.model, modes), selected: resolvedAxes(session.model, axes, modes) };
}
