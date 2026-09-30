/**
 * What setting a model would do to a slot, worked out without touching it
 * (ADR-0002 decision 32). A pure function of one slot and one model: it reads
 * the slot in the plain shape `core/` already reads, returns what the slot
 * would hold, and mutates nothing. The session asks it once for each slot
 * that holds values and lands the answers together (decision 52).
 *
 * The three steps are ordered, and the order is the point — converting the
 * entry mode changes which quantities the slot holds, so seeding has to see
 * the converted slot and not the original one, and the gate has to see what
 * seeding left. The gate is asked, never second-guessed: the rows are
 * `core/applicability.ts`'s and the app has no other notion of out of range.
 * It is asked a second time, on the slot with the other rows adjusted,
 * because the humidity entry's bound depends on the temperature (see
 * {@link rehearseSwitch}).
 */
import { outOfRangeRows, type Bound, type OutOfRangeRow } from "./applicability";
import { temperatureMode } from "./entryModes";
import { hasTemperatureGroup, type RegisteredModel } from "./modelDeclaration";
import type { Quantity } from "./quantities";
import { seedDeclaredDefaults, withEnteredValues, withTemperatureMode, type Slot } from "./slot";

/** What a switch would do to one slot: the slot it would leave, and what the new model would not accept. */
export interface RehearsedSwitch {
  /** What the rehearsed slot would hold: converted, then seeded. Nothing entered is adjusted here. */
  readonly slot: Slot;
  /**
   * The entered values the new model's Applicability rules out, as the pre-call
   * gate reports them; the humidity entry's at the temperature a "Yes" would leave.
   */
  readonly outOfRangeRows: readonly OutOfRangeRow[];
}

/**
 * What `slot` would hold under `model`, and what `model` would not accept of
 * it at `atmosphericPressure`, which the switch keeps (ADR-0002 decision 49).
 * Temperatures first: the humidity entry's bound moves with the dry-bulb
 * temperature (ADR-0002 decision 46), so it is checked at the temperature a
 * "Yes" would leave — the gate asked again on the slot with every other row
 * adjusted — and listed with the bound it has there. A "Yes" then leaves
 * nothing out of range.
 */
export function rehearseSwitch(slot: Slot, model: RegisteredModel, atmosphericPressure: number): RehearsedSwitch {
  const converted = convertEntryMode(slot, model);
  const seeded = seedDeclaredDefaults(converted, model);
  const humidity = seeded.humidity?.mode.quantity;
  const others = outOfRangeRows(seeded, model, atmosphericPressure).filter((row) => row.quantity !== humidity);
  const humidityRow = outOfRangeRows(adjustToBounds(seeded, others), model, atmosphericPressure).find(
    (row) => row.quantity === humidity,
  );
  return { slot: seeded, outOfRangeRows: humidityRow ? [...others, humidityRow] : others };
}

/**
 * `slot` with each listed value moved to the end of its bound it is beyond,
 * and no further; a bound with one end moves a value only towards that end.
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
 * A slot in operative entry becomes separate entry when the new model has no
 * temperature entry group, because such a model needs the dry-bulb
 * temperature the operative entry is standing in for.
 */
function convertEntryMode(slot: Slot, model: RegisteredModel): Slot {
  if (hasTemperatureGroup(model) || slot.temperature.mode !== temperatureMode.operative) {
    return slot;
  }
  return withTemperatureMode(slot, temperatureMode.separate, model);
}
