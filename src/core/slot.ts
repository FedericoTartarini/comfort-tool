/**
 * What a slot holds; the entry groups held among its values and the rules
 * over them; the functions that read what the person entered, enter values,
 * set an option, convert an entry mode, seed a model's defaults and build the
 * slot a model starts on; and the get-or-throws they read through.
 * Turning a slot into the library's params is `core/libraryInputs.ts`'s and
 * adjusting it to bounds `core/modelSwitch.ts`'s; both depend on this module,
 * and this module on neither.
 */
import { t_o, v_relative } from "jsthermalcomfort";
import { clo_dynamic_inverse } from "$lib/temporary-library/clo_dynamic_inverse";
import { v_relative_inverse } from "$lib/temporary-library/v_relative_inverse";
import {
  airSpeedMode,
  clothingMode,
  humidityMode,
  temperatureMode,
  type AirSpeedMode,
  type ClothingMode,
  type HumidityMode,
  type TemperatureMode,
  type ValueEntryMode,
} from "./entryModes";
import {
  clothingCorrectionOf,
  hasClothingGroup,
  hasTemperatureGroup,
  takesRelativeAirSpeed,
  type OptionSpec,
  type RegisteredModel,
} from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";

/**
 * The slice of an input slot that core reads. A plain interface, so core/
 * never imports state/ (ADR §5).
 */
export interface Slot {
  readonly values: ReadonlyMap<Quantity, number>;
  /** Absent until a declaration's default or the person writes it (ADR-0002 decision 32). */
  readonly humidity?: { readonly mode: HumidityMode; readonly value: number };
  readonly temperature: { readonly mode: TemperatureMode };
  readonly airSpeed: { readonly mode: AirSpeedMode };
  readonly clothing: { readonly mode: ClothingMode };
  /** Every option any model put here, by identity: a superset bag like `values` (ADR-0002 decision 36). */
  readonly options: ReadonlyMap<OptionSpec, boolean>;
}

const q = quantities;

/**
 * The entry mode of every entry group held among the values: the slice of a
 * slot that says how its values are entered, so a slot is one of these. The
 * session's are slot 1's, and a chart is drawn in them (ADR-0002 decision 51).
 * Humidity's mode is not among them: it is held with the humidity entry.
 */
export type ValueEntryModes = Pick<Slot, "temperature" | "airSpeed" | "clothing">;

/** The entry modes a slot starts in, which are those a declaration writes its inputs in. */
export const defaultEntryModes: ValueEntryModes = {
  temperature: { mode: temperatureMode.separate },
  airSpeed: { mode: airSpeedMode.uncorrected },
  clothing: { mode: clothingMode.uncorrected },
};

/** The entry modes `slot` is in, apart from the slot. */
export function entryModesOf(slot: ValueEntryModes): ValueEntryModes {
  return { temperature: slot.temperature, airSpeed: slot.airSpeed, clothing: slot.clothing };
}

/** Whether `a` and `b` are the same entry modes, group by group. */
export function areSameEntryModes(a: ValueEntryModes, b: ValueEntryModes): boolean {
  return valueEntryGroups.every((group) => group.modeOf(a) === group.modeOf(b));
}

/**
 * An entry group whose modes put different quantities among a slot's values.
 * Every rule that reads an entry mode is written once over these, so a new
 * group is a row of {@link valueEntryGroups} and a field of the slot, which
 * {@link ValueEntryModes}, {@link defaultEntryModes} and {@link entryModesOf}
 * name beside the others, and which the session's slot, its setter and its
 * control carry as the slot's shape. What a group's entry resolves to for the
 * library is `core/libraryInputs.ts`'s, and the row a library violation is
 * reported on `core/applicability.ts`'s: each names the group there. The
 * bound an entry must satisfy is `core/applicability.ts`'s too, which names
 * no activity-adjusted group: it reads the row's {@link EntryCorrection}.
 *
 * Humidity is an entry group and not one of these: its entry is one quantity
 * held apart from the values (`Slot.humidity`), its modes carry their own
 * conversions, which take the atmospheric pressure, and the dynamic chart's
 * axis is the library's `rh` in every mode ({@link panelQuantities}).
 */
export interface ValueEntryGroup {
  /** Every mode of the group, the one in {@link defaultEntryModes} among them. */
  readonly modes: readonly ValueEntryMode[];
  /** Whether `model` has the group: read from the model, not declared (ADR §4.2). */
  readonly appliesTo: (model: RegisteredModel) => boolean;
  /** The group's mode among `modes`. */
  readonly modeOf: (modes: ValueEntryModes) => ValueEntryMode;
  /**
   * `slot` re-expressed under `mode`, one of the group's, for `model`: the
   * one statement of the conversion a slot undergoes. The session applies it
   * to every slot at an entry-mode change (ADR-0002 decision 51), each chart
   * builder to a slot kept in another mode than the session's
   * ({@link withEntryModes}), and `core/modelSwitch.ts` to a slot bound for a
   * model that has no such group, under the model it leaves.
   */
  readonly convert: (slot: Slot, mode: ValueEntryMode, model: RegisteredModel) => Slot;
  /** Set for an activity-adjusted group, whose model is given the entry of one mode as it is and of the other corrected. */
  readonly correction?: EntryCorrection;
}

/**
 * What an activity-adjusted group tells the pre-call gate (ADR-0002 decision
 * 54 as revised a third time): the model's info bounds the quantity the model
 * takes, so an entry of the corrected mode is held to that row as it is, and
 * an entry of the other mode to that row converted into the entered quantity.
 * `core/applicability.ts` reads it, by one rule for every such group.
 */
export interface EntryCorrection {
  /** The quantity the model's info names what the model is given by, and so bounds. */
  readonly taken: Quantity;
  /** The mode whose entry the model is given as it is. */
  readonly corrected: ValueEntryMode;
  /**
   * The entry of the uncorrected mode that `model` is given `taken` for at the
   * slot's own other values, by the correction's inverse: exactly under a
   * correction that rounds, and to the inverse's own precision under one that
   * does not.
   */
  readonly entryGiving: (taken: number, slot: Slot, model: RegisteredModel) => number;
}

export const valueEntryGroups: readonly ValueEntryGroup[] = [
  {
    modes: Object.values(temperatureMode),
    appliesTo: hasTemperatureGroup,
    modeOf: (modes) => modes.temperature.mode,
    convert: withTemperatureMode,
  },
  {
    modes: Object.values(airSpeedMode),
    appliesTo: takesRelativeAirSpeed,
    modeOf: (modes) => modes.airSpeed.mode,
    convert: withAirSpeedMode,
    correction: { taken: q.vr, corrected: airSpeedMode.corrected, entryGiving: airSpeedGiving },
  },
  {
    modes: Object.values(clothingMode),
    appliesTo: hasClothingGroup,
    modeOf: (modes) => modes.clothing.mode,
    convert: withClothingMode,
    correction: { taken: q.clo, corrected: clothingMode.corrected, entryGiving: clothingGiving },
  },
];

/**
 * The quantity that stands in for `quantity` under `modes`.
 *
 * An entry group's quantities are named per mode, so anything remembered
 * across a mode switch has to be re-pointed: a remembered `tdb` or `tr`
 * becomes `operative_tmp` under operative entry, and `operative_tmp` becomes
 * `tdb` again under separate entry; a remembered `v` becomes `vr` under
 * relative air speed entry, and back, as `clo` and `clo_dynamic` under dynamic
 * clothing entry. A quantity of no group, or of its group's
 * mode in `modes`, is returned untouched.
 */
export function underEntryModes(quantity: Quantity, modes: ValueEntryModes): Quantity {
  for (const group of valueEntryGroups) {
    const mode = group.modeOf(modes);
    if (!mode.panel.includes(quantity) && group.modes.some((other) => other.panel.includes(quantity))) {
      return mode.axis;
    }
  }
  return quantity;
}

export function requireValue(values: ReadonlyMap<Quantity, number>, quantity: Quantity): number {
  const value = values.get(quantity);
  if (value === undefined) {
    throw new Error(`Slot has no value for ${quantity.label}`);
  }
  return value;
}

/** The slot's humidity entry, or a throw naming it for a slot that holds none. */
export function requireHumidity(slot: Slot): NonNullable<Slot["humidity"]> {
  if (slot.humidity === undefined) {
    throw new Error("Slot has no humidity entry");
  }
  return slot.humidity;
}

/**
 * The slot's dry-bulb temperature: the entered `tdb`, or the operative entry
 * standing in for it under operative mode.
 */
export function resolvedTdb(slot: Slot): number {
  return slot.values.get(q.tdb) ?? requireValue(slot.values, q.operative_tmp);
}

/**
 * The slot's humidity as the library's `rh`, converted from whatever the user
 * entered at the slot's dry-bulb temperature (the operative temperature under
 * operative entry, ADR §4.5) and the session's atmospheric pressure, in Pa
 * (ADR-0002 decision 49). The one place the mode's conversion to relative
 * humidity is invoked. Throws for a slot that holds no humidity.
 */
export function relativeHumidityOf(slot: Slot, atmosphericPressure: number): number {
  const { mode, value } = requireHumidity(slot);
  return mode.toRelativeHumidity(value, resolvedTdb(slot), atmosphericPressure);
}

/**
 * The slot's operative temperature: the entry itself under operative entry,
 * else the library's `t_o(tdb, tr, v, model.standard)`, weighed by the model's
 * own standard, or by the library's default for a model that declares none.
 * The air speed it weighs by is the slot's air-speed entry: the relative air
 * speed under relative air speed entry, the one air speed the slot then holds,
 * as the library's own ASHRAE 55 check weighs by the `vr` it is given.
 * How a chart locked on an operative axis marks a slot in separate entry
 * (ADR-0002 decision 37), and the value the switch into operative entry
 * stores ({@link withTemperatureMode}, decision 39), so the click does not
 * move the marker. The one place the app calls `t_o`.
 *
 * Off the deployed chart's marker, the plain mean `(tdb + tr) / 2`, whenever
 * `tdb ≠ tr`, except under ASHRAE 55 below 0.2 m/s and under ISO 7726 at
 * exactly 0.1 m/s, where the library's weighting is one half.
 */
export function operativeTemperatureOf(slot: Slot, model: RegisteredModel): number {
  if (slot.temperature.mode === temperatureMode.operative) {
    return requireValue(slot.values, q.operative_tmp);
  }
  // `t_o` names fewer standards than a model may pin (not ISO 7933), and
  // throws on one it does not; the cast leaves that call to the library.
  const standard = model.standard as Parameters<typeof t_o>[3];
  const airSpeed = requireValue(slot.values, slot.airSpeed.mode.axis);
  return t_o(requireValue(slot.values, q.tdb), requireValue(slot.values, q.tr), airSpeed, standard);
}

/**
 * The slot's relative air speed, which a model that takes `vr` is given: the
 * entry itself under relative air speed entry, else the library's
 * `v_relative(v, met)` of the entered air speed and metabolic rate. What
 * `core/libraryInputs.ts` resolves, and the value the switch into relative air
 * speed entry stores ({@link withAirSpeedMode}), so the person sees the number
 * the model was getting. The one place the app corrects an air speed with
 * `v_relative`.
 */
export function relativeAirSpeedOf(slot: Slot): number {
  if (slot.airSpeed.mode === airSpeedMode.corrected) {
    return requireValue(slot.values, q.vr);
  }
  return v_relative(requireValue(slot.values, q.v), requireValue(slot.values, q.met));
}

/**
 * The slot's dynamic clothing insulation, which a model with the clothing
 * entry group is given as the library's `clo`: the entry itself under dynamic
 * clothing entry, else the entered clothing insulation corrected by the rule
 * of `model`'s standard, at the slot's own metabolic rate and relative air
 * speed ({@link relativeAirSpeedOf}). A model without the group is given the
 * clothing insulation as entered. What `core/libraryInputs.ts` resolves, and
 * the value the switch into dynamic clothing entry stores
 * ({@link withClothingMode}), so the person sees the number the model was
 * getting. The one place the app corrects a clothing insulation, by the one
 * rule {@link withClothingMode} and {@link clothingGiving} invert
 * ({@link clothingCorrectionAt}).
 */
export function dynamicClothingOf(slot: Slot, model: RegisteredModel): number {
  if (slot.clothing.mode === clothingMode.corrected) {
    return requireValue(slot.values, q.clo_dynamic);
  }
  const clothing = requireValue(slot.values, q.clo);
  return clothingCorrectionAt(slot, model)?.(clothing) ?? clothing;
}

/**
 * The clothing correction of `model`'s standard at the slot's own metabolic
 * rate and relative air speed ({@link relativeAirSpeedOf}), a function of the
 * clothing insulation alone: what {@link dynamicClothingOf} corrects by and
 * {@link withClothingMode} and {@link clothingGiving} invert.
 * `undefined` for a model without the
 * clothing entry group.
 */
function clothingCorrectionAt(slot: Slot, model: RegisteredModel): ((clo: number) => number) | undefined {
  const correct = clothingCorrectionOf(model);
  if (!correct) {
    return undefined;
  }
  // Getters: a rule reads only what it takes, so ASHRAE 55's asks for no air speed.
  const resolved = {
    get met() {
      return requireValue(slot.values, q.met);
    },
    get vr() {
      return relativeAirSpeedOf(slot);
    },
  };
  return (clo) => correct(clo, resolved);
}

/**
 * The air speed that gives the relative air speed `vr` at the slot's own
 * metabolic rate: the air-speed group's {@link EntryCorrection.entryGiving}.
 * `v_relative` rounds to 0.001, so the answer is given exactly `vr`.
 */
function airSpeedGiving(vr: number, slot: Slot): number {
  return v_relative_inverse({ vr, met: requireValue(slot.values, q.met) });
}

/**
 * The clothing insulation `model`'s rule corrects to `dynamic` at the slot's
 * own values ({@link clothingCorrectionAt}), by the temporary library's
 * `clo_dynamic_inverse`: the clothing group's {@link EntryCorrection.entryGiving}.
 * The number itself for a model without a rule.
 */
function clothingGiving(dynamic: number, slot: Slot, model: RegisteredModel): number {
  const correction = clothingCorrectionAt(slot, model);
  return correction ? clo_dynamic_inverse({ clo_dynamic: dynamic, correction }) : dynamic;
}

/**
 * Writes the operative entry into `tdb` and `tr` and removes `operative_tmp`,
 * in place. An entry convention, not an equation (ADR-0002 decision 21).
 */
export function expandOperative(values: Map<Quantity, number>): void {
  const operative = requireValue(values, q.operative_tmp);
  values.set(q.tdb, operative);
  values.set(q.tr, operative);
  values.delete(q.operative_tmp);
}

/**
 * The quantities the user actually types, in panel order: the model's inputs
 * with the rows of each entry group it has replaced by those of the group's
 * mode in `modes`, where the first of them stood. The input panel lays these
 * out, humidity as entered ({@link panelQuantities}), and the dynamic chart
 * offers them as axes. A model without a group has no rows of it to replace:
 * without the temperature entry group, its inputs in either temperature mode.
 */
export function enteredQuantities(model: RegisteredModel, modes: ValueEntryModes): Quantity[] {
  let rows = model.inputs.map(({ quantity }) => quantity);
  for (const group of valueEntryGroups) {
    if (!group.appliesTo(model)) {
      continue;
    }
    const declared = group.modeOf(defaultEntryModes).panel;
    const entered = group.modeOf(modes).panel;
    rows = rows.flatMap((quantity) => {
      if (!declared.includes(quantity)) {
        return [quantity];
      }
      return quantity === declared[0] ? entered : [];
    });
  }
  return rows;
}

/**
 * The rows the input panel lists for `slot`: {@link enteredQuantities} under
 * the slot's entry modes, with the slot's humidity entry in `rh`'s place,
 * or `rh` itself for a slot that holds none. Only the panel swaps humidity;
 * the dynamic chart's axes keep the library's `rh`.
 */
export function panelQuantities(model: RegisteredModel, slot: Slot): Quantity[] {
  return enteredQuantities(model, slot).map((quantity) =>
    quantity === q.rh ? (slot.humidity?.mode.quantity ?? quantity) : quantity,
  );
}

/**
 * What the user entered for `quantity`, humidity included. `rh` is answered
 * in every mode, at `atmosphericPressure` — the dynamic chart sweeps and marks
 * the library's `rh`, not the entered representation — and so is
 * `operative_tmp`, which a chart with locked axes marks under separate entry
 * too, at `model`'s {@link operativeTemperatureOf}. A slot that holds no
 * humidity has no entered value for any humidity quantity.
 */
export function enteredValue(slot: Slot, quantity: Quantity, model: RegisteredModel, atmosphericPressure: number): number | undefined {
  const { humidity } = slot;
  if (quantity === humidity?.mode.quantity) {
    return humidity.value;
  }
  if (quantity === q.rh) {
    return humidity === undefined ? undefined : relativeHumidityOf(slot, atmosphericPressure);
  }
  if (quantity === q.operative_tmp) {
    return operativeTemperatureOf(slot, model);
  }
  return slot.values.get(quantity);
}

/**
 * `slot` with `changes` in place of its own fields: the one place this module
 * builds a slot from another, so every change to a slot keeps what it did not
 * change.
 * The fields are read one by one, since the session's slot holds them behind
 * getters a spread does not copy; no change removes a held humidity.
 */
function changedSlot(slot: Slot, changes: Partial<Slot>): Slot {
  return {
    values: changes.values ?? slot.values,
    humidity: changes.humidity ?? slot.humidity,
    temperature: changes.temperature ?? slot.temperature,
    airSpeed: changes.airSpeed ?? slot.airSpeed,
    clothing: changes.clothing ?? slot.clothing,
    options: changes.options ?? slot.options,
  };
}

/** Each humidity entry mode by the quantity it enters. */
const humidityModeByQuantity = new Map<Quantity, HumidityMode>(Object.values(humidityMode).map((mode) => [mode.quantity, mode]));

/** Whether `quantity` is the quantity some humidity entry mode enters. */
export function isHumidityQuantity(quantity: Quantity): boolean {
  return humidityModeByQuantity.has(quantity);
}

/**
 * The same slot with some entered values replaced — how the person enters a
 * value and how the dynamic chart sweeps its axes. Replacing before
 * resolution keeps the derivations honest: an overridden `v` is still turned
 * into `vr`, an overridden `vr` is given to the model as it is, an overridden `operative_tmp` still expands to `tdb = tr`.
 *
 * A value whose quantity is any humidity entry mode's sets the humidity entry
 * to that mode and value, so no humidity quantity lands among the values. An
 * `rh` sweep is one case: it overrides the entry outright, since the chart's
 * axis is the library's `rh`.
 */
export function withEnteredValues(slot: Slot, overrides: ReadonlyMap<Quantity, number>): Slot {
  const values = new Map(slot.values);
  let humidity = slot.humidity;
  for (const [quantity, value] of overrides) {
    const mode = humidityModeByQuantity.get(quantity);
    if (mode) {
      humidity = { mode, value };
    } else {
      values.set(quantity, value);
    }
  }
  return changedSlot(slot, { values, humidity });
}

/** The same slot with `option` set to `value`: how the person ticks an option. */
export function withOption(slot: Slot, option: OptionSpec, value: boolean): Slot {
  const options = new Map(slot.options);
  options.set(option, value);
  return changedSlot(slot, { options });
}

/**
 * The same slot with its temperatures re-expressed under `mode`. Separate →
 * operative stores {@link operativeTemperatureOf}'s answer, the library's `t_o`
 * by the model's own standard as pythermalcomfort's models weigh it (ADR-0002
 * decision 39), so the slot lands where the chart marked it; operative →
 * separate sets `tdb = tr = operative_tmp`. Lossy and one-way, and a removal
 * from the bag: the two representations never coexist. The
 * deployed tool converts nothing here — its checkbox copies the air
 * temperature into mean radiant.
 *
 * The temperature group's {@link ValueEntryGroup.convert}, which says who
 * applies it. `resolveQuantities`'s expansion (`core/libraryInputs.ts`) is a
 * different act — it stands the operative entry in for the two temperatures of
 * one library call and changes no entry mode.
 */
export function withTemperatureMode(slot: Slot, mode: TemperatureMode, model: RegisteredModel): Slot {
  if (mode === slot.temperature.mode) {
    return slot;
  }
  const values = new Map(slot.values);
  if (mode === temperatureMode.operative) {
    values.set(q.operative_tmp, operativeTemperatureOf(slot, model));
    values.delete(q.tdb);
    values.delete(q.tr);
  } else {
    expandOperative(values);
  }
  return changedSlot(slot, { values, temperature: { mode } });
}

/**
 * The same slot with its air speed re-expressed under `mode`. Uncorrected →
 * corrected stores {@link relativeAirSpeedOf}'s answer, the relative air speed
 * the model was given at the slot's own air speed and metabolic rate;
 * corrected → uncorrected stores the temporary library's `v_relative_inverse`,
 * the air speed that gives that relative air speed at the slot's metabolic
 * rate (ADR-0002 decision 54 as revised). Exact both ways to `v_relative`'s
 * rounding of 0.001: the model is given the same relative air speed before and
 * after, but for an entry finer than that rounding, which comes back rounded. Unlike
 * {@link withTemperatureMode}, which is lossy; the two representations never
 * coexist.
 * The deployed tool converts nothing here: its checkbox passes the entry as
 * the relative air speed under the label "Air speed".
 *
 * The air-speed group's {@link ValueEntryGroup.convert}, which says who
 * applies it.
 */
export function withAirSpeedMode(slot: Slot, mode: AirSpeedMode): Slot {
  if (mode === slot.airSpeed.mode) {
    return slot;
  }
  const values = new Map(slot.values);
  if (mode === airSpeedMode.corrected) {
    values.set(q.vr, relativeAirSpeedOf(slot));
    values.delete(q.v);
  } else {
    values.set(q.v, airSpeedGiving(requireValue(values, q.vr), slot));
    values.delete(q.vr);
  }
  return changedSlot(slot, { values, airSpeed: { mode } });
}

/**
 * The same slot with its clothing re-expressed under `mode`. Uncorrected →
 * corrected stores {@link dynamicClothingOf}'s answer, the dynamic clothing
 * insulation `model` was given at the slot's own values, by its standard's
 * rule; corrected → uncorrected stores the clothing insulation that rule
 * corrects to the entry, by the temporary library's `clo_dynamic_inverse`,
 * which searches the rule itself: ISO 7730's has no closed inverse, and the
 * app writes neither standard's formula (ADR-0002 decision 54 as revised a
 * third time). So `model` is given the same dynamic clothing insulation
 * before and after, as {@link withAirSpeedMode} leaves the relative air
 * speed: exactly for a clothing insulation a person entered, and within the
 * rule's rounding for a dynamic one typed in that no such entry gives (under
 * ASHRAE 55 the inverse moves it by up to 0.001; see `clo_dynamic_inverse`).
 * `model` is the model the slot is on: the rule inverted is the one that
 * corrected the entry, and for a model without the group nothing did, so the
 * number is kept. The two representations never coexist.
 * The deployed tool corrects on its ASHRAE pages and shows nothing of it; its
 * EN page takes the dynamic value and corrects nothing.
 *
 * The clothing group's {@link ValueEntryGroup.convert}, which says who
 * applies it.
 */
export function withClothingMode(slot: Slot, mode: ClothingMode, model: RegisteredModel): Slot {
  if (mode === slot.clothing.mode) {
    return slot;
  }
  const values = new Map(slot.values);
  if (mode === clothingMode.corrected) {
    values.set(q.clo_dynamic, dynamicClothingOf(slot, model));
    values.delete(q.clo);
  } else {
    values.set(q.clo, clothingGiving(requireValue(values, q.clo_dynamic), slot, model));
    values.delete(q.clo_dynamic);
  }
  return changedSlot(slot, { values, clothing: { mode } });
}

/**
 * `slot` in `modes`: converted by every entry group whose mode differs, each
 * by its own {@link ValueEntryGroup.convert}, and the slot itself when none
 * does. How a chart builder draws a slot kept in other entry modes than the
 * session's (ADR-0002 decision 51).
 */
export function withEntryModes(slot: Slot, modes: ValueEntryModes, model: RegisteredModel): Slot {
  return valueEntryGroups.reduce((converted, group) => group.convert(converted, group.modeOf(modes), model), slot);
}

/**
 * The same slot with its humidity entry re-expressed under `mode`, at the
 * slot's {@link resolvedTdb}: the entered dry-bulb temperature, or the
 * operative temperature under operative entry, and at the session's
 * atmospheric pressure. Lossy and one-way, like {@link withTemperatureMode}.
 * Throws for a slot that holds no humidity: there is nothing to re-express.
 */
export function withHumidityMode(slot: Slot, mode: HumidityMode, atmosphericPressure: number): Slot {
  if (mode === slot.humidity?.mode) {
    return slot;
  }
  const tdb = resolvedTdb(slot);
  const humidity = { mode, value: mode.fromRelativeHumidity(relativeHumidityOf(slot, atmosphericPressure), tdb, atmosphericPressure) };
  return changedSlot(slot, { humidity });
}

/**
 * Whether the slot holds an entry for `quantity`: {@link enteredValue}'s
 * question without its conversion, so asking needs no atmospheric pressure.
 */
function holdsEntry(slot: Slot, quantity: Quantity): boolean {
  if (quantity === q.rh || quantity === slot.humidity?.mode.quantity) {
    return slot.humidity !== undefined;
  }
  return slot.values.has(quantity);
}

/**
 * Every input the new model declares that the slot has no value for starts at
 * the declaration's own default; what the slot already holds is kept, whatever
 * model put it there. An input of an entry group is sought under the slot's
 * own entry mode, so an operative entry answers for the dry-bulb one it
 * stands in for, an entered relative air speed for the air speed, and an
 * entered dynamic clothing insulation for the clothing insulation.
 *
 * A humidity input is missing only from a slot that holds no humidity, which
 * then starts at the declared default: in relative-humidity entry, since a
 * declaration declares `rh`. A held humidity answers for `rh` in whatever mode
 * it was entered. The defaults are applied through `withEnteredValues`, which
 * puts humidity where the slot keeps it, so no default can land among the
 * values `rh` is excluded from (ADR §4.5).
 *
 * Options are seeded the same way: an option the new model declares and the
 * slot has no value for starts at its default, and every other is kept
 * (ADR-0002 decision 36). The gate never sees them — an option has no range.
 */
export function seedDeclaredDefaults(slot: Slot, model: RegisteredModel): Slot {
  const defaults = new Map<Quantity, number>();
  for (const { quantity, value } of model.inputs) {
    const held = underEntryModes(quantity, slot);
    // Two declared temperatures stand in one operative entry, so the first of
    // them — the entry mode's own axis — is the one whose default applies.
    if (!holdsEntry(slot, held) && !defaults.has(held)) {
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
  return changedSlot(withEnteredValues(slot, defaults), { options });
}

/**
 * The slot `model` starts on: the empty slot, in {@link defaultEntryModes},
 * holding no humidity and no option, put through {@link seedDeclaredDefaults}
 * as a switch is, so starting and switching are one rule.
 */
export function startingSlot(model: RegisteredModel): Slot {
  return seedDeclaredDefaults({ values: new Map(), ...defaultEntryModes, options: new Map() }, model);
}
