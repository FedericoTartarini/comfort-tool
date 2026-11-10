/**
 * The input calculators (ADR-0002 decision 75): Custom ensemble, Clothing
 * prediction and Solar gain on people, each an object
 * referred to by identity, as an option is (decision 36), and declared on the
 * row it writes (`DeclaredQuantity.calculators`); and the one rule by which
 * an output is written into a slot. Each computes by calling the library in
 * SI, except for the ensemble's plain sum of the library's garment values
 * (ASHRAE 55 §5.2.2.2(c)), which no library function takes garment names
 * for. A dialog's bounds are `core/applicability.ts`'s `calculatorBound`: the
 * library's model info, within the kind's own bound.
 */
import {
  CLO_INDIVIDUAL_GARMENT_GROUPS,
  clo_individual_garments,
  clo_tout,
  CLO_TOUT_INFO,
  solar_gain,
  SOLAR_GAIN_INFO,
  type ModelInfo,
  type ModelWarning,
  type SolarGainInputs,
} from "jsthermalcomfort";
import { copy } from "$lib/text/copy";
import { entryVerdict, type Bound } from "./applicability";
import { declaredQuantitiesOf, type DeclaredQuantity, type ModelDeclaration } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import { defaultEntryModes, enteredValue, panelRows, requireValue, valueEntryGroups, withEnteredValues, type Slot } from "./slot";

const q = quantities;

/** How the value a calculator computes meets the value its row holds: the row's value after Apply. */
export type Meeting = (held: number, computed: number) => number;

export const meeting = {
  /** The computed value is the row's new value: a clothing insulation. */
  replaces: (held, computed) => computed,
  /** The computed value is added to the row's value: a mean radiant temperature increase. */
  adds: (held, computed) => held + computed,
} as const satisfies Record<string, Meeting>;

/**
 * What a calculator computes: each output the dialog shows, by quantity, in
 * SI, and the rows of its model info the inputs broke, as the library reports
 * them on `warnings`; none for a calculation the library bounds nothing of.
 */
export interface CalculatorOutputs {
  readonly values: ReadonlyMap<Quantity, number>;
  readonly warnings: readonly ModelWarning[];
}

/** A posture value `solar_gain` takes, one of `SOLAR_GAIN_INFO.inputs.posture.allowed`. */
type Posture = NonNullable<SolarGainInputs["posture"]>;

/** A posture `solar_gain` takes, the library's value under the standard's word. */
export interface PostureChoice {
  readonly value: Posture;
  readonly label: string;
}

/** The standard's word for each posture value the library allows; a value the library adds fails the type check. */
const postureWords = {
  sitting: copy.postureSeated,
  standing: copy.postureStanding,
  supine: copy.postureSupine,
} as const satisfies Record<Posture, string>;

/** The postures `SOLAR_GAIN_INFO` allows, its default first, then the rest in the library's order, each under its word. */
function solarGainPostures(): [PostureChoice, ...PostureChoice[]] {
  const { allowed, default: libraryDefaultPosture } = SOLAR_GAIN_INFO.inputs.posture;
  const choice = (value: Posture): PostureChoice => ({ value, label: postureWords[value] });
  return [choice(libraryDefaultPosture), ...allowed.filter((value) => value !== libraryDefaultPosture).map(choice)];
}

/** What a form dialog holds: each asked quantity's SI value, and the posture where one is asked. */
export interface CalculatorInputs {
  readonly values: ReadonlyMap<Quantity, number>;
  readonly posture?: Posture;
}

/** What every calculator says of itself, whatever its dialog asks. */
interface CommonCalculator {
  /** Its tab's label in the dialog, and its label on the button. */
  readonly label: string;
  /** The line its tab opens with, naming the standard's method. */
  readonly method: string;
  /** How its output meets the row it is declared on. */
  readonly meets: Meeting;
  /** The quantity among its outputs that meets the row. */
  readonly output: Quantity;
}

/**
 * A calculator whose dialog is a form: quantity rows, each the panel's box,
 * and the posture where one is asked. The members mark each other's fields
 * `never`, as `DeclaredChart`'s do, so the dialog is told apart by what it asks.
 */
export interface FormCalculator extends CommonCalculator {
  /** The library's model info, which the dialog's bounds are read from (`calculatorBound`). */
  readonly info: ModelInfo;
  /** The quantities it asks, each with the SI value its dialog starts at, in dialog order. */
  readonly asks: readonly Pick<DeclaredQuantity, "quantity" | "value">[];
  /** The postures it offers, the first the default; absent for a calculator that asks none. */
  readonly postures?: readonly [PostureChoice, ...PostureChoice[]];
  /** The quantities its outputs hold, in the order its dialog shows them, which it shows without outputs too. */
  readonly outputs: readonly [Quantity, ...Quantity[]];
  /** Its outputs, or `null` where the library gives no value for an output, which the dialog then shows as it shows no outputs. */
  readonly compute: (inputs: CalculatorInputs) => CalculatorOutputs | null;
  readonly groups?: never;
  readonly garments?: never;
}

/** A calculator whose tab wears the library's garments, group by group. */
export interface GarmentCalculator extends CommonCalculator {
  /** The garment keys under their headings, in the library's order. */
  readonly groups: typeof CLO_INDIVIDUAL_GARMENT_GROUPS;
  /** The group of the chairs, of which one is worn at a time (ASHRAE 55 Table 5.2.2.2C). */
  readonly chairs: GarmentGroup;
  /** Each garment's insulation in clo, by key. */
  readonly garments: typeof clo_individual_garments;
  /** The ensemble of the chosen garment keys. */
  readonly compute: (garments: readonly string[]) => CalculatorOutputs;
  readonly info?: never;
  readonly asks?: never;
  readonly postures?: never;
  readonly outputs?: never;
}

/** One of the library's garment groups: its heading and its garment keys, in the library's order. */
export type GarmentGroup = (typeof CLO_INDIVIDUAL_GARMENT_GROUPS)[number];

export type Calculator = FormCalculator | GarmentCalculator;

/**
 * ASHRAE 55 §5.2.2.2 (c) and (d): the ensemble is the plain sum of the
 * garments' and the chair's values, uncorrected. The labels are the library's
 * keys, untranscribed (decision 20).
 */
export const customEnsemble: GarmentCalculator = {
  label: copy.customEnsemble,
  method: copy.customEnsembleMethod,
  meets: meeting.replaces,
  output: q.clo,
  groups: CLO_INDIVIDUAL_GARMENT_GROUPS,
  chairs: requireGroup("Chairs"),
  garments: clo_individual_garments,
  compute: (garments) => {
    const sum = garments.reduce((total, garment) => total + requireGarment(garment), 0);
    return { values: new Map([[q.clo, sum]]), warnings: [] };
  },
};

/** The library's garment group headed `heading`, or a throw naming a heading it lacks. */
function requireGroup(heading: string): GarmentGroup {
  const group = CLO_INDIVIDUAL_GARMENT_GROUPS.find((candidate) => candidate.group === heading);
  if (group === undefined) {
    throw new Error(`The library has no garment group ${heading}`);
  }
  return group;
}

/** The garments worn after `garment` is put on: it joins those worn once, and a chair takes the place of the chair worn. */
export function withGarment(calculator: GarmentCalculator, worn: readonly string[], garment: string): readonly string[] {
  if (calculator.chairs.garments.includes(garment)) {
    return [...worn.filter((other) => !calculator.chairs.garments.includes(other)), garment];
  }
  return worn.includes(garment) ? worn : [...worn, garment];
}

/** The library's insulation of `garment` in clo, or a throw naming a key its table lacks. */
export function requireGarment(garment: string): number {
  const insulation = clo_individual_garments[garment];
  if (insulation === undefined) {
    throw new Error(`The library has no garment ${garment}`);
  }
  return insulation;
}

/**
 * Figure 5-1's clothing of the day from the outdoor air temperature at 6
 * a.m. The library rounds it to two decimals with no switch (decision 75
 * rule 8) and bounds nothing, so there are no warnings. The box starts at
 * 20 °C, which no source gives: between the formula's two flat ends, so the
 * prediction moves as the box does.
 */
export const cloTout: FormCalculator = {
  label: CLO_TOUT_INFO.label,
  method: copy.cloToutMethod,
  meets: meeting.replaces,
  output: q.clo,
  info: CLO_TOUT_INFO,
  asks: [{ quantity: q.tout, value: 20 }],
  outputs: [q.clo],
  compute: ({ values }) => ({
    values: new Map([[q.clo, clo_tout({ tout: requireValue(values, q.tout) }).clo_tout]]),
    warnings: [],
  }),
};

/**
 * Normative Appendix C's solar gain, as the increase of the mean radiant
 * temperature it is equivalent to. Its eight inputs are Table C-2's; the
 * floor reflectance is not passed, the library's default being the
 * standard's fixed value. Defaults by one order of sources: the library's
 * (absorptivity 0.7, Seated), else Table C-2's "Allowable Default Value"
 * (direct beam 900 W/m², where the deployed tool has 700), else the deployed
 * tool's (the rest).
 */
export const solarGain: FormCalculator = {
  label: SOLAR_GAIN_INFO.label,
  method: copy.solarGainMethod,
  meets: meeting.adds,
  output: q.delta_mrt,
  info: SOLAR_GAIN_INFO,
  asks: [
    { quantity: q.sol_altitude, value: 45 },
    { quantity: q.sharp, value: 0 },
    { quantity: q.sol_radiation_dir, value: 900 },
    { quantity: q.sol_transmittance, value: 0.8 },
    { quantity: q.f_svv, value: 0.2 },
    { quantity: q.f_bes, value: 0.5 },
    { quantity: q.asw, value: 0.7 },
  ],
  postures: solarGainPostures(),
  outputs: [q.erf, q.delta_mrt],
  compute: ({ values, posture }) => {
    const { erf, delta_mrt, warnings } = solar_gain({
      sol_altitude: requireValue(values, q.sol_altitude),
      sharp: requireValue(values, q.sharp),
      sol_radiation_dir: requireValue(values, q.sol_radiation_dir),
      sol_transmittance: requireValue(values, q.sol_transmittance),
      f_svv: requireValue(values, q.f_svv),
      f_bes: requireValue(values, q.f_bes),
      asw: requireValue(values, q.asw),
      posture,
      round_output: false,
    });
    // `null` for an altitude or a SHARP the library clips, both past the dialog's bounds.
    if (erf === null || delta_mrt === null) {
      return null;
    }
    return {
      values: new Map<Quantity, number>([
        [q.erf, erf],
        [q.delta_mrt, delta_mrt],
      ]),
      warnings,
    };
  },
};

/** What `calculator`'s form dialog starts at: each asked quantity at its default, and the first posture offered. */
export function defaultInputs(calculator: FormCalculator): CalculatorInputs {
  const values = new Map(calculator.asks.map(({ quantity, value }) => [quantity, value]));
  return calculator.postures ? { values, posture: calculator.postures[0].value } : { values };
}

/** The value among `outputs` that meets `calculator`'s row. */
export function outputOf(calculator: Calculator, outputs: CalculatorOutputs): number {
  return requireValue(outputs.values, calculator.output);
}

/**
 * The calculators `model`'s panel offers for `slot`: the distinct ones over
 * its {@link panelRows} in row order, a row folded into another's included,
 * so the one list the button names and the dialog's tabs follow (ADR-0002
 * decision 75 rule 6). A row stands for the quantities of its entry group,
 * so the list is the same under every entry mode.
 */
export function panelCalculators(model: ModelDeclaration, slot: Slot): Calculator[] {
  return [...new Set(panelRows(model, slot).flatMap((row) => ("option" in row ? [] : row.calculators)))];
}

/** The row a slot's panel shows for a calculator, its entered value before and after Apply. */
export interface ShownRow {
  readonly quantity: Quantity;
  readonly before: number;
  /** What Apply commits, cut to the row's bound; not a number while there are no outputs. */
  readonly after: number;
  /** The row's bound where the output met with the row is past it, and the after is its end; absent otherwise. */
  readonly cutTo?: Bound;
}

/**
 * The row `slot`'s panel shows for `calculator` under `model`, in the slot's
 * own entry modes, with what it holds before and after Apply of `outputs`
 * ({@link withCalculatorOutputs}), each read as the panel reads it
 * (`enteredValue`) (ADR-0002 decision 75 rule 6 (d)). So under dynamic
 * clothing entry it is the dynamic clothing insulation, the standard's
 * correction of the output after, and under operative entry the operative
 * temperature, folded from the raised mean radiant temperature after. With no
 * outputs the after is not a number. The after is judged as a typed value of
 * the row is, by the gate's `entryVerdict`, and is the bound's end where the
 * written value is past it, which Apply then commits (ADR-0002 decision 84,
 * rule 5): the dock shows what Apply writes.
 */
export function shownRow(
  slot: Slot,
  calculator: Calculator,
  outputs: CalculatorOutputs | undefined,
  model: ModelDeclaration,
  atmosphericPressure: number,
): ShownRow {
  const row = panelRows(model, slot).find((candidate) => !("option" in candidate) && candidate.calculators.includes(calculator));
  if (!row || "option" in row) {
    throw new Error(`${model.info.label} offers ${calculator.label} on no row`);
  }
  const { quantity } = row;
  const valueIn = (held: Slot) => {
    const value = enteredValue(held, quantity, model, atmosphericPressure);
    if (value === undefined) {
      throw new Error(`Slot has no value for ${quantity.label}`);
    }
    return value;
  };
  const before = valueIn(slot);
  if (!outputs) {
    return { quantity, before, after: Number.NaN };
  }
  const after = valueIn(withCalculatorOutputs(slot, calculator, outputs, model));
  const verdict = entryVerdict(slot, model, atmosphericPressure, quantity, after);
  return verdict.kind === "cut" ? { quantity, before, after: verdict.value, cutTo: verdict.bound } : { quantity, before, after };
}

/**
 * `slot` after Apply of `calculator`'s `outputs`, on the row of `model` that
 * declares it (decision 75 rule 3): the slot is put into its entry group's
 * first mode, the one the declaration writes its inputs in, the output meets
 * the row there, and the slot is put back into its own mode by the same
 * conversion. So under dynamic clothing entry the written clothing insulation
 * becomes the standard's correction of it, and under operative entry the
 * raised mean radiant temperature and the expanded air temperature fold back
 * into an operative temperature at the model's standard. A slot already in
 * the first mode is written and left. The value is not gated here: Apply
 * commits the row's value as a typed value is committed ({@link shownRow}).
 */
export function withCalculatorOutputs(slot: Slot, calculator: Calculator, outputs: CalculatorOutputs, model: ModelDeclaration): Slot {
  const row = declaredQuantitiesOf(model).find((input) => input.calculators?.includes(calculator));
  if (!row) {
    throw new Error(`${model.info.label} declares ${calculator.label} on no row`);
  }
  const { quantity } = row;
  const group = valueEntryGroups.find((candidate) => candidate.modes.some((mode) => mode.panel.includes(quantity)));
  const entered = group ? group.convert(slot, group.modeOf(defaultEntryModes), model) : slot;
  const after = calculator.meets(requireValue(entered.values, quantity), outputOf(calculator, outputs));
  const written = withEnteredValues(entered, new Map([[quantity, after]]));
  return group ? group.convert(written, group.modeOf(slot), model) : written;
}
