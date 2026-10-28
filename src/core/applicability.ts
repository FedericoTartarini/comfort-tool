/**
 * What is inside and outside a model's applicability. Reads `applicability`
 * off a model's `info.inputs` for the bound an entered quantity must satisfy
 * (the pre-call gate, and the range shown beside the input; ADR-0002
 * decision 4), intersected with its kind's bound from `kindBounds` when the
 * model takes the quantity (decision 46); `axisRangeFor` reads the same
 * applicability bounds only as an axis range's fallback (decision 5). The
 * rows a completed run still breaks are the library's, read off the result's
 * `warnings` (ADR-0002 decision 23) and mapped to quantities here.
 *
 * A violation is `{ quantity, bounded, role, value, bound }`, and its warning
 * sentence is assembled here from the bounded quantity's label, the bound and
 * the display unit, in the copy dictionary's words.
 */
import type { Bound, VariableInfo } from "jsthermalcomfort";
import { copy } from "$lib/text/copy";
import type { CalculatorInputs, FormCalculator } from "./calculators";
import { temperatureMode, type HumidityMode } from "./entryModes";
import { inputsOf, type ModelResult, type RegisteredModel } from "./modelDeclaration";
import { resultWarnings } from "./modelRun";
import { formatBoundEnd, isShownBeyond } from "./numberFormat";
import { kindBounds, quantities, quantityFor, type Quantity } from "./quantities";
import {
  isHumidityQuantity,
  resolvedTdb,
  valueEntryGroups,
  withEnteredValues,
  type EntryCorrection,
  type Slot,
  type ValueEntryModes,
} from "./slot";
import { displayUnitFor, valueWithUnit, type DisplayUnit } from "./units";
import { unitSystem, type UnitSystem } from "./unitSystem";
import type { SlotPosition } from "./writtenSession";

export type { Bound };

const q = quantities;

/** One entered value the pre-call gate stops, with the bound it was tested against. */
export interface OutOfRangeRow {
  readonly quantity: Quantity;
  readonly value: number;
  readonly bound: Bound;
}

/**
 * One applicability row a value broke, and where it appeared in the model's
 * evaluation. `quantity` is the row it is reported on; `bounded` is the
 * quantity the bound and value belong to, which the sentence names. The two
 * differ for `vr` under air speed entry, reported on the entered `v`
 * (ADR-0002 decision 4).
 */
export interface ViolationRow extends OutOfRangeRow {
  readonly bounded: Quantity;
  readonly role: "input" | "derived" | "output";
}

/** The applicability bound of `table`'s row for `quantity`, reconciled by key through `quantityFor` (ADR-0002 decision 2). */
function boundFor(table: Readonly<Record<string, VariableInfo>> | undefined, quantity: Quantity): Bound | undefined {
  if (!table) {
    return undefined;
  }
  for (const [key, variable] of Object.entries(table)) {
    if (quantityFor(key) === quantity) {
      return variable.applicability;
    }
  }
  return undefined;
}

/**
 * Whether `value` of `quantity` is outside `bound` as its row shows both: the
 * number formatter's comparison, in the quantity's SI display unit (ADR-0002
 * decision 56). A difference no row shows, 1.8751 clo under a maximum of
 * 1.875, is not outside.
 */
function breaksBound(quantity: Quantity, bound: Bound, value: number): boolean {
  return isShownBeyond(value, bound, gateUnitFor(quantity));
}

/**
 * The unit the gate judges a value of `quantity` in, whatever the session
 * shows: g/kg for the humidity ratio, not kg/kg. The range text asks the same
 * unit, so an end it writes is one the gate accepts.
 */
function gateUnitFor(quantity: Quantity): DisplayUnit {
  return displayUnitFor(quantity, unitSystem.si);
}

/** The bound between `min` and `max`, keeping only an end that is a finite number. */
function boundOf(min: number | undefined, max: number | undefined): Bound {
  const result: { min?: number; max?: number } = {};
  if (min !== undefined && Number.isFinite(min)) {
    result.min = min;
  }
  if (max !== undefined && Number.isFinite(max)) {
    result.max = max;
  }
  return result;
}

/** The narrowest bound that satisfies every bound in `bounds`, or `undefined` for none. */
function intersect(bounds: readonly [Bound, ...Bound[]]): Bound;
function intersect(bounds: readonly Bound[]): Bound | undefined;
function intersect(bounds: readonly Bound[]): Bound | undefined {
  if (bounds.length === 0) {
    return undefined;
  }
  const mins = bounds.map((bound) => bound.min).filter((min): min is number => min !== undefined);
  const maxes = bounds.map((bound) => bound.max).filter((max): max is number => max !== undefined);
  return boundOf(mins.length > 0 ? Math.max(...mins) : undefined, maxes.length > 0 ? Math.min(...maxes) : undefined);
}

/**
 * Every bound `model` puts on `quantity`: its applicability row, and, when the
 * model takes the quantity, the bound of the quantity's kind (ADR-0002
 * decision 46). The two hold at once, so a caller intersects them.
 */
function everyBoundFor(model: RegisteredModel, quantity: Quantity): Bound[] {
  const takes = inputsOf(model).some((entry) => entry.quantity === quantity);
  return [boundFor(model.info.inputs, quantity), takes ? kindBounds[quantity.kind] : undefined].filter(
    (bound): bound is Bound => bound !== undefined,
  );
}

/**
 * `bound` converted into the quantity a person entered, each end by `convert`:
 * the one rule by which an entry is held to a bound on what it is turned into
 * (ADR-0002 decision 46), the humidity entry's. An end `convert` has no
 * finite value for is dropped. `undefined` where neither end is left, and where the converted
 * ends come out inverted: the entry then has no bound.
 */
function convertedBound(bound: Bound, convert: (end: number) => number): Bound | undefined {
  const converted = boundOf(
    bound.min === undefined ? undefined : convert(bound.min),
    bound.max === undefined ? undefined : convert(bound.max),
  );
  if (isInverted(converted)) {
    return undefined;
  }
  return converted.min === undefined && converted.max === undefined ? undefined : converted;
}

/** Whether no value satisfies `bound`: its lower end is above its upper one. */
function isInverted(bound: Bound): boolean {
  return bound.min !== undefined && bound.max !== undefined && bound.min > bound.max;
}

/**
 * The bound a humidity entry in `mode` must satisfy under `model`: relative
 * humidity's — its kind's 0 to 100, narrowed by any row the model has —
 * converted into the entry's mode by the mode's own `fromRelativeHumidity` at
 * the slot's dry-bulb temperature and the atmospheric pressure (ADR-0002
 * decisions 46 and 49), by {@link convertedBound}. The end the mode has no
 * finite value for is the dew point of 0 %. The library's
 * conversions do not rise with relative humidity everywhere — saturated air's
 * humidity ratio turns negative from 100 °C — so the converted ends come
 * out inverted there, and the entry has no bound at that temperature. The
 * mode says of itself which ends it is bounded at, both or the upper only,
 * and whether its bound reads the pressure, in which case it has none while
 * the pressure is out of range (decision 53).
 * `undefined` for a model without the humidity entry group.
 */
function humidityEntryBoundFor(model: RegisteredModel, mode: HumidityMode, slot: Slot, atmosphericPressure: number): Bound | undefined {
  if (mode.readsPressure && isAtmosphericPressureOutOfRange(atmosphericPressure)) {
    return undefined;
  }
  const relativeHumidity = intersect(everyBoundFor(model, q.rh));
  if (!relativeHumidity) {
    return undefined;
  }
  const ends = mode.bounded === "upper" ? boundOf(undefined, relativeHumidity.max) : relativeHumidity;
  const tdb = resolvedTdb(slot);
  return convertedBound(ends, (end) => mode.fromRelativeHumidity(end, tdb, atmosphericPressure));
}

/**
 * The bound an entry of an activity-adjusted group must satisfy under `model`
 * (ADR-0002 decision 84's note of 2026-10-28, rule 2, and decision 54's note
 * of that day). The model's info bounds the quantity the model takes,
 * `correction.taken`: an entry of the corrected mode is held to that row as
 * it is, and an entry of the other mode to its kind's bound alone, so no
 * other entry moves it. A run that takes the corrected value past the row is
 * calculated, and its violation is reported on the entered row
 * ({@link violationRows}).
 */
function correctedEntryBoundFor(model: RegisteredModel, quantity: Quantity, correction: EntryCorrection): Bound | undefined {
  if (correction.corrected.panel.includes(quantity)) {
    return boundFor(model.info.inputs, correction.taken);
  }
  return kindBounds[quantity.kind];
}

/**
 * The bound an input calculator's dialog holds an entry of `quantity` to: the
 * row of the calculator's model info, with the bound of the quantity's kind,
 * as a model's entered quantity is held (ADR-0002 decisions 46 and 75 rule
 * 5); `undefined` for a quantity with neither, as the outdoor temperature.
 */
export function calculatorBound(calculator: FormCalculator, quantity: Quantity): Bound | undefined {
  return intersect([boundFor(calculator.info.inputs, quantity), kindBounds[quantity.kind]].filter((bound): bound is Bound => bound !== undefined));
}

/**
 * The quantities of `inputs` outside {@link calculatorBound}, judged as the
 * gate judges an entry: the dialog's boxes marked out of range, while its
 * result is cleared and its Apply disabled (decision 75 rule 5).
 */
export function outOfRangeCalculatorInputs(calculator: FormCalculator, inputs: CalculatorInputs): Quantity[] {
  return [...inputs.values].flatMap(([quantity, value]) => {
    const bound = calculatorBound(calculator, quantity);
    return bound && breaksBound(quantity, bound, value) ? [quantity] : [];
  });
}

/**
 * The bound an entered quantity must satisfy under `model`, given the slot's
 * entry modes. An operative entry stands in for both temperature rows and
 * must satisfy both at once. The humidity entry is held to relative
 * humidity's bound converted into its mode at the slot's dry-bulb
 * temperature and `atmosphericPressure`, so the bound moves with both, at
 * its upper end only in wet-bulb entry, and not at all in humidity-ratio entry
 * while the pressure is out of range ({@link humidityEntryBoundFor}); a slot that
 * holds no humidity has no humidity entry to bound. An entry of an
 * activity-adjusted group the model has is held to the model's row for what
 * it takes, `vr` or the dynamic clothing insulation the library calls `clo`,
 * when it is that quantity, and to its kind's bound alone when it is an
 * entered `v` or clothing insulation ({@link correctedEntryBoundFor}). In a
 * model without the group an entered `v` or `clo` is held to the model's own
 * row for it.
 */
export function enteredBound(
  model: RegisteredModel,
  quantity: Quantity,
  slot: Slot,
  atmosphericPressure: number,
): Bound | undefined {
  const { humidity } = slot;
  if (quantity === humidity?.mode.quantity) {
    return humidityEntryBoundFor(model, humidity.mode, slot, atmosphericPressure);
  }
  if (humidity === undefined && isHumidityQuantity(quantity)) {
    return undefined;
  }
  for (const { correction, appliesTo, modes } of valueEntryGroups) {
    if (correction && appliesTo(model) && modes.some((mode) => mode.panel.includes(quantity))) {
      return correctedEntryBoundFor(model, quantity, correction);
    }
  }
  return intersect(boundingQuantities(quantity, slot).flatMap((entry) => everyBoundFor(model, entry)));
}

/** The quantities whose bounds an entry of `quantity` must satisfy, under the slot's entry modes. */
function boundingQuantities(quantity: Quantity, slot: Slot): readonly Quantity[] {
  const { mode } = slot.temperature;
  if (mode !== temperatureMode.separate && mode.panel.includes(quantity)) {
    return temperatureMode.separate.panel;
  }
  return [quantity];
}

/**
 * Entered values outside the bounds {@link enteredBound} gives — the pre-call
 * gate, with the bound each value was tested against. Checks what the user
 * typed, not a derived value: a humidity entry is tested in its own mode,
 * against relative humidity's bound converted into it. It says nothing about
 * a quantity {@link enteredBound} leaves unbounded, as a humidity-ratio entry
 * while the pressure is out of range, nor about an end it leaves open, as a
 * wet-bulb entry's lower end. An entered `v` or clothing insulation is tested
 * against its kind's bound alone, so a run may give the model a relative air
 * speed or dynamic clothing insulation past its row, which
 * {@link violationRows} reports on the entered row.
 *
 * The bounds are read at `boundsAt`, the slot itself unless given: a bound may be
 * read at another entry, and `core/modelSwitch.ts` asks what the entries
 * break at the values a yes would leave.
 *
 * The one definition of out of range in the app (ADR-0002 decision 32). The
 * input panel's red boxes and the model-switch dialog's rows are both this
 * list, so the two can never disagree about a value.
 */
export function outOfRangeRows(slot: Slot, model: RegisteredModel, atmosphericPressure: number, boundsAt: Slot = slot): OutOfRangeRow[] {
  const entered: (readonly [Quantity, number])[] = [...slot.values];
  if (slot.humidity) {
    entered.push([slot.humidity.mode.quantity, slot.humidity.value]);
  }
  const rows: OutOfRangeRow[] = [];
  for (const [quantity, value] of entered) {
    const bound = enteredBound(model, quantity, boundsAt, atmosphericPressure);
    if (bound && breaksBound(quantity, bound, value)) {
      rows.push({ quantity, value, bound });
    }
  }
  return rows;
}

/** An out-of-range row of one of the session's slots, the slot named by its position. */
export interface SlotOutOfRangeRow extends OutOfRangeRow {
  readonly position: SlotPosition;
}

/**
 * What the gate says of a value a person would commit (ADR-0002 decision 84,
 * rule 2), and so what a commit of it does: **legal**, written as it is;
 * **cut**, past its own bound, written as the end it is beyond, the end
 * itself in SI (decision 56); or **refused**, as it would put another value
 * out of range, written not at all, with the rows of what it would break. The
 * other value is never cut. `Row` is a slot's own row, or one naming its slot
 * where the value is the session's.
 */
export type Verdict<Row extends OutOfRangeRow = OutOfRangeRow> =
  | { readonly kind: "legal" }
  | { readonly kind: "cut"; readonly value: number; readonly bound: Bound }
  | { readonly kind: "refused"; readonly rows: readonly Row[] };

const legal = { kind: "legal" } as const;

/**
 * The {@link Verdict} on `value` past `bound` cut to its end, then checked by
 * `rowsAt` at what would be written: refused for any row there, cut where the
 * end differs from `value`, and legal otherwise.
 */
function verdictOf<Row extends OutOfRangeRow>(
  value: number,
  quantity: Quantity,
  bound: Bound | undefined,
  rowsAt: (written: number) => readonly Row[],
): Verdict<Row> {
  const written = bound && breaksBound(quantity, bound, value) ? nearestEnd(value, bound) : value;
  const rows = rowsAt(written);
  if (rows.length > 0) {
    return { kind: "refused", rows };
  }
  return bound && written !== value ? { kind: "cut", value: written, bound } : legal;
}

/**
 * The verdict on entering `value` for `quantity` in `slot` under `model`
 * (ADR-0002 decision 84, rules 2 and 3): its own bound, {@link enteredBound},
 * then every entry of the slot as it would be, by {@link outOfRangeRows}, so
 * a value whose own bound is read at another entry, a humidity entry's at the
 * dry bulb, refuses that entry's move. Judged at decision 56's precision, and
 * without running the model.
 */
export function entryVerdict(
  slot: Slot,
  model: RegisteredModel,
  atmosphericPressure: number,
  quantity: Quantity,
  value: number,
): Verdict {
  const slotWith = (entered: number) => withEnteredValues(slot, new Map([[quantity, entered]]));
  // No bound is read at the entry it bounds, so the bound at `value` is the bound at the end it cuts to.
  const bound = enteredBound(model, quantity, slotWith(value), atmosphericPressure);
  return verdictOf(value, quantity, bound, (written) => outOfRangeRows(slotWith(written), model, atmosphericPressure));
}

/**
 * The verdict on the atmospheric pressure `value` (ADR-0002 decisions 49 and
 * 84): its kind's bound, then the humidity entry of every slot in `slots`,
 * the session's every held slot, read at it, since that entry's bound alone
 * reads the pressure. A refusal's rows name their slot.
 */
export function atmosphericPressureVerdict(
  slots: readonly { readonly position: SlotPosition; readonly slot: Slot }[],
  model: RegisteredModel,
  value: number,
): Verdict<SlotOutOfRangeRow> {
  return verdictOf(value, q.p_atm, kindBounds[q.p_atm.kind], (written) =>
    slots.flatMap(({ position, slot }) =>
      outOfRangeRows(slot, model, written)
        .filter((row) => row.quantity === slot.humidity?.mode.quantity)
        .map((row) => ({ ...row, position })),
    ),
  );
}

/** The end of `bound` that `value` is beyond; `value` itself when it is beyond neither. */
export function nearestEnd(value: number, bound: Bound): number {
  if (bound.min !== undefined && value < bound.min) {
    return bound.min;
  }
  if (bound.max !== undefined && value > bound.max) {
    return bound.max;
  }
  return value;
}

/**
 * Whether the session's atmospheric pressure breaks its kind's bound. Judged
 * apart from {@link outOfRangeRows}: that list is what a model switch asks
 * about and adjusts in the slot, and the pressure is neither held in a slot
 * nor dependent on the model (ADR-0002 decision 49). {@link enteredBound}
 * applies a kind's bound only to a quantity the model takes, so it never
 * reaches the pressure.
 */
export function isAtmosphericPressureOutOfRange(atmosphericPressure: number): boolean {
  return atmosphericPressureRow(atmosphericPressure) !== undefined;
}

/**
 * The session's atmospheric pressure as a row the gate stops, with its kind's
 * bound, or `undefined` while it is within it ({@link isAtmosphericPressureOutOfRange}).
 */
export function atmosphericPressureRow(atmosphericPressure: number): OutOfRangeRow | undefined {
  const bound = kindBounds[q.p_atm.kind];
  return bound !== undefined && breaksBound(q.p_atm, bound, atmosphericPressure)
    ? { quantity: q.p_atm, value: atmosphericPressure, bound }
    : undefined;
}

/** Which quantities {@link outOfRangeRows} names — what the input panel marks. */
export function outOfRangeQuantities(slot: Slot, model: RegisteredModel, atmosphericPressure: number): Quantity[] {
  return outOfRangeRows(slot, model, atmosphericPressure).map((row) => row.quantity);
}

/**
 * The rows a completed run broke, as the library reports them on the result's
 * `warnings` (ADR-0002 decision 23) — the app finds no row of its own. Each
 * row's key is reconciled to a quantity through `quantityFor`; a key the table
 * lacks is dropped. A row on what an activity-adjusted group the model has
 * gives it is reported on the group's quantity entered under `modes`, the row
 * the person sees, and stays `bounded` by the corrected quantity
 * ({@link reportedRow}; ADR-0002 decision 84's note of 2026-10-28, rule 2):
 * `vr` on the entered `v` or `vr`, and the dynamic clothing insulation the
 * library calls `clo` on the entered clothing insulation or dynamic clothing
 * insulation. The gate holds an entered `v` or clothing insulation to its
 * kind's bound alone, so such a row arrives whenever a metabolic rate, an air
 * speed or a clothing insulation takes what the model is given past its row. A
 * quantity can break several limits in one role (PMV (ASHRAE 55)'s fixed
 * air-speed row plus its no-control rows): those merge into one row over the
 * narrowest bound, so the person reads one sentence; the individual bounds
 * are not kept. A row is only a value shown outside its bound, as the gate
 * judges an entry.
 */
export function violationRows(model: RegisteredModel, result: ModelResult, modes: ValueEntryModes): ViolationRow[] {
  const rows: ViolationRow[] = [];
  for (const { key, role, value, bound } of resultWarnings(model, result)) {
    const keyed = quantityFor(key);
    if (!keyed) {
      continue;
    }
    const { quantity, bounded } = reportedRow(model, keyed, modes);
    // The library judges its bounds exactly, and the app at the precision a row
    // shows (ADR-0002 decision 56): a warning on a value a hair over its bound,
    // which no row shows as outside, is not a row and is dropped silently.
    if (!breaksBound(bounded, bound, value)) {
      continue;
    }
    const index = rows.findIndex((row) => row.quantity === quantity && row.role === role);
    if (index === -1) {
      rows.push({ quantity, bounded, role, value, bound });
    } else {
      // Keeps the first row's `bounded`: a model that takes `vr` reports `vr` rows and no `v` rows, and `clo` rows as dynamic.
      rows[index] = { ...rows[index], bound: intersect([rows[index].bound, bound]) };
    }
  }
  return rows;
}

/**
 * Where the library's row for `keyed` is reported under `modes`, and the
 * quantity its bound and value are of: both `keyed` itself, but for what an
 * activity-adjusted group of the model gives it, reported on the group's
 * entry in `modes` and bounding the corrected quantity, read off the group's
 * {@link EntryCorrection}.
 */
function reportedRow(model: RegisteredModel, keyed: Quantity, modes: ValueEntryModes): Pick<ViolationRow, "quantity" | "bounded"> {
  for (const group of valueEntryGroups) {
    if (group.correction?.taken === keyed && group.appliesTo(model)) {
      return { quantity: group.modeOf(modes).axis, bounded: group.correction.corrected.axis };
    }
  }
  return { quantity: keyed, bounded: keyed };
}

/**
 * Whether the rows `now` break a limit the rows `before` did not, what a
 * slot's toast is raised for (ADR-0002 decision 84, rule 8). A limit is the
 * quantity it bounds and its role: not the row it is reported on, which an
 * entry-mode switch moves, nor its numbers, as PMV (ASHRAE 55)'s air-speed
 * rule builds its bound per call, so the same limit moves with the
 * temperature.
 */
export function breaksNewLimit(before: readonly ViolationRow[], now: readonly ViolationRow[]): boolean {
  const isSameLimit = (a: ViolationRow, b: ViolationRow) => a.bounded === b.bounded && a.role === b.role;
  return now.some((row) => !before.some((earlier) => isSameLimit(row, earlier)));
}

/**
 * `bound` on `quantity` in its display unit under `system`, formatted, without
 * the unit symbol. Each end is written as any number is, nearest: `0 – 1.88`
 * for a maximum of 1.875; where that end typed back would be stopped by the
 * gate, which judges in the quantity's SI display unit, it steps one shown
 * digit inward: `≤ 0.79` inHg for 2700 Pa (`formatBoundEnd`). The end a person
 * reads is accepted (ADR-0002 decision 56).
 */
export function formatBound(bound: Bound, quantity: Quantity, system: UnitSystem): string {
  const unit = displayUnitFor(quantity, system);
  const judgedIn = gateUnitFor(quantity);
  const min = bound.min !== undefined ? formatBoundEnd(bound.min, "min", unit, judgedIn) : undefined;
  const max = bound.max !== undefined ? formatBoundEnd(bound.max, "max", unit, judgedIn) : undefined;
  if (min !== undefined && max !== undefined) {
    return `${min} – ${max}`;
  }
  return min !== undefined ? `≥ ${min}` : `≤ ${max}`;
}

/**
 * The sentence that `quantity` must be within `bound`, from its label, the
 * bound and its display unit under `system`: what a violation row and an entry
 * out of range both say, so a summary line and its row's bound read alike.
 */
export function boundSentence(quantity: Quantity, bound: Bound, system: UnitSystem): string {
  const unit = displayUnitFor(quantity, system);
  return copy.applicabilityWarning(quantity.label, valueWithUnit(formatBound(bound, quantity, system), unit));
}

/** The sentence a violation row shows the user, of the bounded quantity ({@link boundSentence}). */
export function warningFor(row: ViolationRow, unitSystem: UnitSystem): string {
  return boundSentence(row.bounded, row.bound, unitSystem);
}

/**
 * The lines naming the limits a run broke, a result row's icon's and an Image's Input summary's: the heading, then
 * one sentence a limit; none for a run that broke none.
 */
export function limitsBrokenLines(rows: readonly ViolationRow[], unitSystem: UnitSystem): string[] {
  return rows.length === 0 ? [] : [copy.limitsBrokenHeading, ...rows.map((row) => warningFor(row, unitSystem))];
}
