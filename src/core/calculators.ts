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
import { outOfRangeRows, type Bound } from "./applicability";
import { inputsOf, type DeclaredQuantity, type RegisteredModel } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import { defaultEntryModes, enteredValue, panelRows, requireValue, valueEntryGroups, withEnteredValues, type Slot } from "./slot";

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
 * The calculators `model`'s panel offers for `slot`: the distinct ones over
 * its {@link panelRows} in row order, a row folded into another's included,
 * so the one list the entry names and the dialog's tabs follow (ADR-0002
 * decision 75 rule 6). A row stands for the quantities of its entry group,
 * so the list is the same under every entry mode.
 */
export function panelCalculators(model: RegisteredModel, slot: Slot): Calculator[] {
  return [...new Set(panelRows(model, slot).flatMap((row) => ("option" in row ? [] : row.calculators)))];
}

/** The row a slot's panel shows for a calculator, its entered value before and after Apply. */
export interface ShownRow {
  readonly quantity: Quantity;
  readonly before: number;
  /** Not a number while there is no result. */
  readonly after: number;
  /** The row's bound where the after is outside it, as the panel would mark it; absent otherwise. */
  readonly brokenBound?: Bound;
}

/**
 * The row `slot`'s panel shows for `calculator` under `model`, in the slot's
 * own entry modes, with what it holds before and after Apply of `result`
 * ({@link withCalculatorResult}), each read as the panel reads it
 * (`enteredValue`) (ADR-0002 decision 75 rule 6 (d)). So under dynamic
 * clothing entry it is the dynamic clothing insulation, the standard's
 * correction of the result after, and under operative entry the operative
 * temperature, folded from the raised mean radiant temperature after. With no
 * result the after is not a number. Whether the after is out of range is
 * the gate's `outOfRangeRows` over the written slot, the panel's own reader.
 */
export function shownRow(
  slot: Slot,
  calculator: Calculator,
  result: CalculatorResult | undefined,
  model: RegisteredModel,
  atmosphericPressure: number,
): ShownRow {
  const row = panelRows(model, slot).find((entry) => !("option" in entry) && entry.calculators.includes(calculator));
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
  if (!result) {
    return { quantity, before, after: Number.NaN };
  }
  const written = withCalculatorResult(slot, calculator, result, model);
  const broken = outOfRangeRows(written, model, atmosphericPressure).find((row) => row.quantity === quantity);
  return { quantity, before, after: valueIn(written), ...(broken && { brokenBound: broken.bound }) };
}

/** The row Apply writes: its value as the slot holds it in the entry group's first mode, and after the result meets it. */
export interface WrittenRow {
  readonly quantity: Quantity;
  readonly before: number;
  readonly after: number;
}

/**
 * The row of `model` that declares `calculator`, before and after Apply of
 * `result` on `slot` (decision 75 rule 3): read in its entry group's first
 * mode, the one the declaration writes its inputs in, so under operative
 * entry the mean radiant temperature is the one the operative temperature
 * expands to. A solar dialog shows it as the slot's mean radiant temperature
 * before and after; a second Apply starts from the raised one.
 */
export function writtenRow(slot: Slot, calculator: Calculator, result: CalculatorResult, model: RegisteredModel): WrittenRow {
  const { quantity, before, after } = writeOf(slot, calculator, result, model);
  return { quantity, before, after };
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
  const { quantity, after, group, entered } = writeOf(slot, calculator, result, model);
  const written = withEnteredValues(entered, new Map([[quantity, after]]));
  return group ? group.convert(written, group.modeOf(slot), model) : written;
}

/**
 * What Apply does on `slot`: the row `calculator` writes in `model`, before
 * and after `result` meets it, its entry group, and `slot` put into that
 * group's first mode, where the row is read and written.
 */
function writeOf(slot: Slot, calculator: Calculator, result: CalculatorResult, model: RegisteredModel) {
  const row = inputsOf(model).find((entry) => entry.calculators?.includes(calculator));
  if (!row) {
    throw new Error(`${model.info.label} declares ${calculator.label} on no row`);
  }
  const { quantity } = row;
  const group = valueEntryGroups.find((candidate) => candidate.modes.some((mode) => mode.panel.includes(quantity)));
  const entered = group ? group.convert(slot, group.modeOf(defaultEntryModes), model) : slot;
  const before = requireValue(entered.values, quantity);
  return { quantity, before, after: calculator.meets(before, outputOf(calculator, result)), group, entered };
}
