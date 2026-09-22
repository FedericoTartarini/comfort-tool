/**
 * What setting a model would do to a slot, worked out without touching it
 * (ADR-0002 decision 32). A pure function of one slot and one model: it reads
 * the slot in the plain shape `core/` already reads, returns what the slot
 * would hold, and mutates nothing. The session lands the answer; Compare will
 * ask it once per slot.
 *
 * The two steps are ordered, and the order is the point — converting the entry
 * mode changes which quantities the slot holds, so seeding has to see the
 * converted slot and not the original one. The third step of decision 32,
 * asking the pre-call gate what the rehearsed slot breaks, belongs to the
 * dialog and is not here yet.
 */
import { temperatureMode, underTemperatureMode } from "./entryModes";
import { enteredValue, withEnteredValues, withTemperatureMode, type SlotInputs } from "./libraryInputs";
import { hasTemperatureGroup, type RegisteredModel } from "./modelDeclaration";
import type { Quantity } from "./quantities";

/** What `slot` would hold under `model`: converted, then seeded. */
export function rehearseSwitch(slot: SlotInputs, model: RegisteredModel): SlotInputs {
  const converted = convertEntryMode(slot, model);
  return seedDeclaredDefaults(converted, model);
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
  // Always a copy, empty defaults included: what comes back is the plain shape
  // decision 32 rehearses on, never the caller's own slot under another name.
  return withEnteredValues(slot, defaults);
}
