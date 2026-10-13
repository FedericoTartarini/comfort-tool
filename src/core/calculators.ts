/**
 * The input calculators (ADR-0002 decision 75): Custom ensemble, Clothing
 * from outdoor temperature and Solar gain on occupants, each an object
 * referred to by identity, as an option is (decision 36), and declared on the
 * row it writes (`DeclaredQuantity.calculators`); and the one rule by which
 * a result is written into a slot. Each computes by calling the library in
 * SI; the app holds no formula and no bound of its own. A dialog's bounds are
 * `core/applicability.ts`'s `calculatorBound`.
 */
import {
  CLO_INDIVIDUAL_GARMENT_GROUPS,
  clo_individual_garments,
  clo_tout,
  CLO_TOUT_INFO,
  solar_gain,
  SOLAR_GAIN_INFO,
  type ApplicabilityWarning,
  type ModelInfo,
  type SolarGainParams,
} from "jsthermalcomfort";
import { copy } from "$lib/text/copy";
import { inputsOf, type DeclaredQuantity, type RegisteredModel } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import { defaultEntryModes, requireValue, valueEntryGroups, withEnteredValues, type Slot } from "./slot";

const q = quantities;

/** How a calculator's result meets the value its row holds: the row's value after Apply. */
export type Meeting = (held: number, result: number) => number;

export const meeting = {
  /** The result is the row's new value: a clothing insulation. */
  replaces: (held, result) => result,
  /** The result is added to the row's value: a mean radiant temperature increase. */
  adds: (held, result) => held + result,
} as const satisfies Record<string, Meeting>;

/**
 * What a calculator computes: each output the dialog shows, by quantity, in
 * SI, and the rows of its model info the inputs broke, as the library reports
 * them on `warnings`; none for a calculation the library bounds nothing of.
 */
export interface CalculatorResult {
  readonly outputs: ReadonlyMap<Quantity, number>;
  readonly warnings: readonly ApplicabilityWarning[];
}

/** A posture `solar_gain` takes, the library's value under the standard's word. */
export interface PostureOption {
  readonly value: NonNullable<SolarGainParams["posture"]>;
  readonly label: string;
}

/** What a form dialog holds: each asked quantity's SI value, and the posture where one is asked. */
export interface CalculatorInputs {
  readonly values: ReadonlyMap<Quantity, number>;
  readonly posture?: PostureOption["value"];
}

/** What every calculator says of itself, whatever its dialog asks. */
interface CommonCalculator {
  /** The menu entry and the dialog's title. */
  readonly label: string;
  /** How its result meets the row it is declared on. */
  readonly meets: Meeting;
  /** The output of its result that meets the row. */
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
  readonly postures?: readonly [PostureOption, ...PostureOption[]];
  readonly compute: (inputs: CalculatorInputs) => CalculatorResult;
  readonly groups?: never;
  readonly garments?: never;
}

/** A calculator whose dialog is a checklist of the library's garments. */
export interface GarmentCalculator extends CommonCalculator {
  /** The garment keys under their headings, in the library's order. */
  readonly groups: typeof CLO_INDIVIDUAL_GARMENT_GROUPS;
  /** Each garment's insulation in clo, by key. */
  readonly garments: typeof clo_individual_garments;
  /** The ensemble of the chosen garment keys. */
  readonly compute: (garments: readonly string[]) => CalculatorResult;
  readonly info?: never;
  readonly asks?: never;
  readonly postures?: never;
}

export type Calculator = FormCalculator | GarmentCalculator;

/**
 * ASHRAE 55 §5.2.2.2 (c) and (d): the ensemble is the plain sum of the
 * garments' and the chair's values, uncorrected. The labels are the library's
 * keys, untranscribed (decision 20).
 */
export const customEnsemble: GarmentCalculator = {
  label: copy.customEnsemble,
  meets: meeting.replaces,
  output: q.clo,
  groups: CLO_INDIVIDUAL_GARMENT_GROUPS,
  garments: clo_individual_garments,
  compute: (garments) => {
    const sum = garments.reduce((total, garment) => total + requireGarment(garment), 0);
    return { outputs: new Map([[q.clo, sum]]), warnings: [] };
  },
};

/** The library's insulation of `garment`, or a throw naming a key its table lacks. */
function requireGarment(garment: string): number {
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
export const clothingFromOutdoorTemperature: FormCalculator = {
  label: copy.clothingFromOutdoorTemperature,
  meets: meeting.replaces,
  output: q.clo,
  info: CLO_TOUT_INFO,
  asks: [{ quantity: q.tout, value: 20 }],
  compute: ({ values }) => ({
    outputs: new Map([[q.clo, clo_tout({ tout: requireValue(values, q.tout) }).clo_tout]]),
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
export const solarGainOnOccupants: FormCalculator = {
  label: copy.solarGainOnOccupants,
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
  postures: [
    { value: "sitting", label: copy.postureSeated },
    { value: "standing", label: copy.postureStanding },
    { value: "supine", label: copy.postureSupine },
  ],
  compute: ({ values, posture }) => {
    const result = solar_gain({
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
    return {
      outputs: new Map<Quantity, number>([
        [q.erf, result.erf],
        [q.delta_mrt, result.delta_mrt],
      ]),
      warnings: result.warnings,
    };
  },
};

/** What `calculator`'s form dialog starts at: each asked quantity at its default, and the first posture offered. */
export function startingInputs(calculator: FormCalculator): CalculatorInputs {
  const values = new Map(calculator.asks.map(({ quantity, value }) => [quantity, value]));
  return calculator.postures ? { values, posture: calculator.postures[0].value } : { values };
}

/** The output of `result` that meets `calculator`'s row. */
export function outputOf(calculator: Calculator, result: CalculatorResult): number {
  return requireValue(result.outputs, calculator.output);
}

/**
 * `slot` after Apply of `calculator`'s `result`, on the row of `model` that
 * declares it (decision 75 rule 3): the slot is put into its entry group's
 * first mode, the one the declaration writes its inputs in, the result meets
 * the row there, and the slot is put back into its own mode by the same
 * conversion. So under dynamic clothing entry the written clothing insulation
 * becomes the standard's correction of it, and under operative entry the
 * raised mean radiant temperature and the expanded air temperature fold back
 * into an operative temperature at the model's standard. A slot already in
 * the first mode is written and left. The value is not gated here: the row
 * gates what is written as it gates a typed value.
 */
export function withCalculatorResult(slot: Slot, calculator: Calculator, result: CalculatorResult, model: RegisteredModel): Slot {
  const row = inputsOf(model).find((entry) => entry.calculators?.includes(calculator));
  if (!row) {
    throw new Error(`${model.info.label} declares ${calculator.label} on no row`);
  }
  const target = row.quantity;
  const group = valueEntryGroups.find((candidate) => candidate.modes.some((mode) => mode.panel.includes(target)));
  const entered = group ? group.convert(slot, group.modeOf(defaultEntryModes), model) : slot;
  const met = calculator.meets(requireValue(entered.values, target), outputOf(calculator, result));
  const written = withEnteredValues(entered, new Map([[target, met]]));
  return group ? group.convert(written, group.modeOf(slot), model) : written;
}
