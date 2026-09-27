/**
 * What setting a model would do to a slot, worked out without touching it
 * (ADR-0002 decision 32). A pure function of one slot and one model: it reads
 * the slot in the plain shape `core/` already reads, returns what the slot
 * would hold, and mutates nothing. The session lands the answer; Compare will
 * ask it once per slot.
 *
 * The three steps are ordered, and the order is the point — converting the
 * entry mode changes which quantities the slot holds, so seeding has to see
 * the converted slot and not the original one, and the gate has to see what
 * seeding left. The gate is asked, never second-guessed: the rows are
 * `core/applicability.ts`'s and the app has no other notion of out of range.
 */
import { outOfRangeRows, type Bound, type OutOfRangeRow } from "./applicability";
import { temperatureMode, underTemperatureMode } from "./entryModes";
import { enteredValue, withEnteredValues, withTemperatureMode, type SlotInputs } from "./libraryInputs";
import { hasTemperatureGroup, type RegisteredModel } from "./modelDeclaration";
import type { Quantity } from "./quantities";

/** What a switch would do to one slot: the slot it would leave, and what the new model would not accept. */
export interface RehearsedSwitch {
  /** What `slot` would hold: converted, then seeded. Nothing entered is adjusted here. */
  readonly inputs: SlotInputs;
  /** The entered values the new model's Applicability rules out, as the pre-call gate reports them. */
  readonly outOfRangeRows: readonly OutOfRangeRow[];
}

/** What `slot` would hold under `model`, and what `model` would not accept of it. */
export function rehearseSwitch(slot: SlotInputs, model: RegisteredModel): RehearsedSwitch {
  const converted = convertEntryMode(slot, model);
  const inputs = seedDeclaredDefaults(converted, model);
  return { inputs, outOfRangeRows: outOfRangeRows(inputs, model) };
}

/**
 * `inputs` with each listed value moved to the end of its bound it is beyond,
 * and no further; a bound with one end moves a value only towards that end.
 *
 * The only place the app adjusts a value the person entered, and it is reached
 * only by their yes (ADR-0002 decision 32). Everywhere else Applicability is a
 * gate: a value outside it stays as typed and the result is withheld.
 */
export function adjustToBounds(inputs: SlotInputs, rows: readonly OutOfRangeRow[]): SlotInputs {
  const adjusted = new Map<Quantity, number>();
  for (const { quantity, value, bound } of rows) {
    adjusted.set(quantity, nearestEnd(value, bound));
  }
  return withEnteredValues(inputs, adjusted);
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
function convertEntryMode(slot: SlotInputs, model: RegisteredModel): SlotInputs {
  if (hasTemperatureGroup(model) || slot.temperature.mode !== temperatureMode.operative) {
    return slot;
  }
  return withTemperatureMode(slot, temperatureMode.separate);
}

/**
 * Every input the new model declares that the slot has no value for starts at
 * the declaration's own default; what the slot already holds is kept, whatever
 * model put it there. A temperature input is sought under the slot's own entry
 * mode, so an operative entry answers for the dry-bulb one it stands in for.
 *
 * A humidity input is never missing — a slot carries a humidity entry in some
 * representation at all times — and the defaults are applied through
 * `withEnteredValues`, which puts humidity where the slot keeps it, so no
 * default can land among the values `rh` is excluded from (ADR §4.5).
 *
 * Options are seeded the same way: an option the new model declares and the
 * slot has no value for starts at its default, and every other is kept
 * (ADR-0002 decision 36). The gate never sees them — an option has no range.
 */
function seedDeclaredDefaults(slot: SlotInputs, model: RegisteredModel): SlotInputs {
  const defaults = new Map<Quantity, number>();
  for (const { quantity, value } of model.inputs) {
    const held = underTemperatureMode(quantity, slot.temperature.mode);
    // Two declared temperatures stand in one operative entry, so the first of
    // them — the entry mode's own axis — is the one whose default applies.
    if (enteredValue(slot, held) === undefined && !defaults.has(held)) {
      defaults.set(held, value);
    }
  }
  const options = new Map(slot.options);
  for (const option of model.options) {
    if (!options.has(option)) {
      options.set(option, option.default);
    }
  }
  // Always a copy, empty defaults included: what comes back is the plain shape
  // decision 32 rehearses on, never the caller's own slot under another name.
  return { ...withEnteredValues(slot, defaults), options };
}
