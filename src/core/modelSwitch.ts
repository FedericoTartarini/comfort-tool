/**
 * What setting a model would do to a slot, worked out without touching it
 * (ADR-0002 decision 32). A pure function of one slot, the model it is on and
 * the model asked for: it reads the slot in the plain shape `core/` already
 * reads, returns what the slot would hold, and mutates nothing. The session asks it once for each slot
 * that holds values and lands the answers together (decision 52).
 *
 * The three steps are ordered, and the order is the point — converting the
 * entry mode changes which quantities the slot holds, so seeding has to see
 * the converted slot and not the original one, and the gate has to see what
 * seeding left. The gate is asked, never second-guessed: the rows are
 * `core/applicability.ts`'s and the app has no other notion of out of range.
 * It is asked again at the slot with its rows adjusted, because a bound may
 * be read at another entry (see {@link rehearseSwitch}).
 */
import { outOfRangeRows, type Bound, type OutOfRangeRow } from "./applicability";
import type { RegisteredModel } from "./modelDeclaration";
import type { Quantity } from "./quantities";
import { defaultEntryModes, seedDeclaredDefaults, valueEntryGroups, withEnteredValues, type Slot } from "./slot";

/** What a switch would do to one slot: the slot it would leave, and what the new model would not accept. */
export interface RehearsedSwitch {
  /** What the rehearsed slot would hold: converted, then seeded. Nothing entered is adjusted here. */
  readonly slot: Slot;
  /**
   * The entered values the new model's Applicability rules out, as the pre-call
   * gate reports them, each against the bound it has at the values a "Yes" would leave.
   */
  readonly outOfRangeRows: readonly OutOfRangeRow[];
}

/**
 * What `slot`, held under the model `from`, would hold under `model`, and
 * what `model` would not accept of it at `atmosphericPressure`, which the
 * switch keeps (ADR-0002 decision 49).
 * A bound may be read at another entry: the humidity entry's at the dry-bulb
 * temperature (ADR-0002 decision 46), an entered air speed's at the metabolic
 * rate, an entered clothing insulation's at that and the air speed (decision
 * 54). So each entry is judged at the values a "Yes" would leave, and listed
 * with the bound it has there: the gate is asked again at the slot with the
 * rows so far adjusted, until a pass lists what the pass before did. Each pass
 * settles the rows read at entries the pass before settled, and no bound is
 * read at the entry it bounds, so there are no more passes than the slot has
 * values. A "Yes" then leaves nothing out of range, except
 * while `atmosphericPressure` is out of range: a humidity-ratio entry has no
 * bound then and is not listed, so it may be out of range once the pressure
 * returns (ADR-0002 decision 53).
 */
export function rehearseSwitch(slot: Slot, from: RegisteredModel, model: RegisteredModel, atmosphericPressure: number): RehearsedSwitch {
  const seeded = seedDeclaredDefaults(convertEntryModes(slot, from, model), model);
  let rows = outOfRangeRows(seeded, model, atmosphericPressure);
  for (let pass = 0; pass < seeded.values.size; pass += 1) {
    const next = outOfRangeRows(seeded, model, atmosphericPressure, adjustToBounds(seeded, rows));
    if (areSameRows(rows, next)) {
      break;
    }
    rows = next;
  }
  return { slot: seeded, outOfRangeRows: rows };
}

/** Whether `a` and `b` list the same quantities against the same bounds, in one order. */
function areSameRows(a: readonly OutOfRangeRow[], b: readonly OutOfRangeRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((row, index) => row.quantity === b[index].quantity && row.bound.min === b[index].bound.min && row.bound.max === b[index].bound.max)
  );
}

/**
 * `slot` with each listed value moved to the end of its bound it is beyond,
 * and no further; a bound with one end moves a value only towards that end.
 * The end itself, and not a rounding of it (ADR-0002 decision 56): a slot
 * holds the full-precision number, and the gate judges at the precision a row
 * shows, so the end passes it and reads as the range beside the row does. A
 * converted end has more decimals than a row shows (1.934… clo for ISO 7730's
 * 2 clo in still air at 1 met), and the model may be given a hair over its own
 * bound for it; the run's violation rows judge that at the same precision.
 *
 * The only place the app adjusts a value the person entered, and it is reached
 * only by their yes (ADR-0002 decision 32). Everywhere else Applicability is a
 * gate: a value outside it stays as typed and the result is withheld.
 */
export function adjustToBounds(slot: Slot, rows: readonly OutOfRangeRow[]): Slot {
  const adjusted = new Map<Quantity, number>();
  for (const { quantity, value, bound } of rows) {
    adjusted.set(quantity, nearestEnd(value, bound));
  }
  return withEnteredValues(slot, adjusted);
}

/** The end of `bound` that `value` is beyond; `value` itself when it is beyond neither. */
function nearestEnd(value: number, bound: Bound): number {
  if (bound.min !== undefined && value < bound.min) {
    return bound.min;
  }
  if (bound.max !== undefined && value > bound.max) {
    return bound.max;
  }
  return value;
}

/**
 * `slot` in the default entry mode of every entry group the new model does
 * not have: a slot in operative entry becomes separate entry for a model
 * without the temperature entry group, because such a model needs the
 * dry-bulb temperature the operative entry is standing in for. Converted as
 * the group's control converts under `from`, the model the slot is on: the
 * dynamic clothing insulation is inverted by that model's standard's rule,
 * which the new model, having no clothing group, does not have.
 */
function convertEntryModes(slot: Slot, from: RegisteredModel, model: RegisteredModel): Slot {
  return valueEntryGroups.reduce(
    (converted, group) => (group.appliesTo(model) ? converted : group.convert(converted, group.modeOf(defaultEntryModes), from)),
    slot,
  );
}
