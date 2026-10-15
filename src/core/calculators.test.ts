import { describe, expect, it } from "vitest";
import {
  CLO_INDIVIDUAL_GARMENT_GROUPS,
  clo_dynamic_ashrae,
  clo_individual_garments,
  clo_tout,
  CLO_TOUT_INFO,
  solar_gain,
  SOLAR_GAIN_INFO,
  t_o,
} from "jsthermalcomfort";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { calculatorBound, enteredBound, outOfRangeCalculatorInputs } from "./applicability";
import {
  clothingFromOutdoorTemperature,
  customEnsemble,
  meeting,
  outputOf,
  panelCalculators,
  shownRow,
  solarGainOnOccupants,
  startingInputs,
  wearGarment,
  withCalculatorResult,
  type Calculator,
  type CalculatorResult,
} from "./calculators";
import { enteredSlotFor, entryModesWithClothing, entryModesWithTemperature } from "./declarationTestSlots";
import { clothingMode, humidityMode, temperatureMode } from "./entryModes";
import { optionsOf, type RegisteredModel } from "./modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "./quantities";
import { startingSlot, withClothingMode, withHumidityMode, withOption, withTemperatureMode, type Slot } from "./slot";

const q = quantities;

describe("customEnsemble", () => {
  it("is labelled, replaces the clothing insulation and asks garments from the library's groups and table", () => {
    expect(customEnsemble.label).toBe("Custom ensemble");
    expect(customEnsemble.meets).toBe(meeting.replaces);
    expect(customEnsemble.output).toBe(q.clo);
    expect(customEnsemble.groups).toBe(CLO_INDIVIDUAL_GARMENT_GROUPS);
    expect(customEnsemble.garments).toBe(clo_individual_garments);
  });

  it("sums the library's values of the chosen garments, chairs among them", () => {
    const chosen = ["Men's underwear", "Long-sleeve dress shirt", "Thick trousers", "Standard office chair"];
    const sum = chosen.reduce((total, garment) => total + clo_individual_garments[garment], 0);
    expect(outputOf(customEnsemble, customEnsemble.compute(chosen))).toBe(sum);
  });

  it("sums nothing to 0 and reports no warnings", () => {
    const result = customEnsemble.compute([]);
    expect(outputOf(customEnsemble, result)).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("throws naming a garment the library's table lacks", () => {
    expect(() => customEnsemble.compute(["Spacesuit"])).toThrow("Spacesuit");
  });

  it("holds one chair, the library's last group, Chairs", () => {
    expect(customEnsemble.chairs).toBe(CLO_INDIVIDUAL_GARMENT_GROUPS[CLO_INDIVIDUAL_GARMENT_GROUPS.length - 1]);
    expect(customEnsemble.chairs.group).toBe("Chairs");
  });
});

describe("wearGarment", () => {
  it("adds a garment after those worn, once", () => {
    const worn = wearGarment(customEnsemble, ["Ankle socks"], "Shoes or sandals");
    expect(worn).toEqual(["Ankle socks", "Shoes or sandals"]);
    expect(wearGarment(customEnsemble, worn, "Ankle socks")).toEqual(worn);
  });

  it("puts a chair in place of the chair worn, the garments kept", () => {
    const worn = wearGarment(customEnsemble, ["Executive chair", "Ankle socks"], "Wooden stool");
    expect(worn).toEqual(["Ankle socks", "Wooden stool"]);
  });
});

describe("clothingFromOutdoorTemperature", () => {
  it("is labelled, replaces the clothing insulation, reads CLO_TOUT_INFO and asks the outdoor temperature from 20 °C", () => {
    expect(clothingFromOutdoorTemperature.label).toBe("Clothing from outdoor temperature");
    expect(clothingFromOutdoorTemperature.meets).toBe(meeting.replaces);
    expect(clothingFromOutdoorTemperature.output).toBe(q.clo);
    expect(clothingFromOutdoorTemperature.info).toBe(CLO_TOUT_INFO);
    expect(clothingFromOutdoorTemperature.asks).toEqual([{ quantity: q.tout, value: 20 }]);
    expect(clothingFromOutdoorTemperature.outputs).toEqual([q.clo]);
    expect(clothingFromOutdoorTemperature.postures).toBeUndefined();
  });

  it("is the library's clo_tout in SI, below, between and above the formula's flat ends", () => {
    for (const tout of [-10, 20, 30]) {
      const result = clothingFromOutdoorTemperature.compute({ values: new Map([[q.tout, tout]]) });
      expect([...result.outputs.keys()]).toEqual(clothingFromOutdoorTemperature.outputs);
      expect(outputOf(clothingFromOutdoorTemperature, result), `${tout} °C`).toBe(clo_tout({ tout }).clo_tout);
      expect(result.warnings).toEqual([]);
    }
  });
});

describe("solarGainOnOccupants", () => {
  it("is labelled, adds to the mean radiant temperature and reads SOLAR_GAIN_INFO", () => {
    expect(solarGainOnOccupants.label).toBe("Solar gain on occupants");
    expect(solarGainOnOccupants.meets).toBe(meeting.adds);
    expect(solarGainOnOccupants.output).toBe(q.delta_mrt);
    expect(solarGainOnOccupants.info).toBe(SOLAR_GAIN_INFO);
    expect(solarGainOnOccupants.outputs).toEqual([q.erf, q.delta_mrt]);
  });

  it("asks Table C-2's seven numbers with the spec's defaults, in dialog order", () => {
    expect(solarGainOnOccupants.asks).toEqual([
      { quantity: q.sol_altitude, value: 45 },
      { quantity: q.sharp, value: 0 },
      { quantity: q.sol_radiation_dir, value: 900 },
      { quantity: q.sol_transmittance, value: 0.8 },
      { quantity: q.f_svv, value: 0.2 },
      { quantity: q.f_bes, value: 0.5 },
      { quantity: q.asw, value: 0.7 },
    ]);
  });

  it("asks the library's three postures labelled as the standard says them, Seated first", () => {
    expect(solarGainOnOccupants.postures).toEqual([
      { value: "sitting", label: "Seated" },
      { value: "standing", label: "Standing" },
      { value: "supine", label: "Supine" },
    ]);
    expect(startingInputs(solarGainOnOccupants).posture).toBe("sitting");
  });

  const defaults = startingInputs(solarGainOnOccupants);
  /** The library's `solar_gain` at the dialog's starting values, as the app calls it. */
  const libraryAt = (posture: "sitting" | "standing") =>
    solar_gain({
      sol_altitude: 45,
      sharp: 0,
      sol_radiation_dir: 900,
      sol_transmittance: 0.8,
      f_svv: 0.2,
      f_bes: 0.5,
      asw: 0.7,
      posture,
      round_output: false,
    });

  it("is the library's solar_gain unrounded at the defaults, its warnings carried", () => {
    const result = solarGainOnOccupants.compute(defaults);
    const library = libraryAt("sitting");
    expect(result.outputs).toEqual(new Map<Quantity, number>([[q.erf, library.erf], [q.delta_mrt, library.delta_mrt]]));
    expect([...result.outputs.keys()]).toEqual(solarGainOnOccupants.outputs);
    expect(outputOf(solarGainOnOccupants, result)).toBe(library.delta_mrt);
    expect(result.warnings).toEqual(library.warnings);
  });

  it("is the library's solar_gain at Standing", () => {
    const result = solarGainOnOccupants.compute({ ...defaults, posture: "standing" });
    expect(outputOf(solarGainOnOccupants, result)).toBe(libraryAt("standing").delta_mrt);
    expect(outputOf(solarGainOnOccupants, result)).not.toBe(libraryAt("sitting").delta_mrt);
  });

  it("carries the library's warnings row for an input out of its range", () => {
    const values = new Map(defaults.values).set(q.sol_radiation_dir, 1200);
    const [warning] = solarGainOnOccupants.compute({ ...defaults, values }).warnings;
    expect(warning).toMatchObject({ value: 1200, bound: SOLAR_GAIN_INFO.inputs.sol_radiation_dir.applicability });
  });
});

describe("startingInputs", () => {
  it("is each asked quantity at its default and no posture, for a calculator that asks none", () => {
    expect(startingInputs(clothingFromOutdoorTemperature)).toEqual({ values: new Map([[q.tout, 20]]) });
  });
});

describe("calculatorBound", () => {
  it("is SOLAR_GAIN_INFO's row for the solar altitude, SHARP, direct beam and absorptivity", () => {
    for (const quantity of [q.sol_altitude, q.sharp, q.sol_radiation_dir, q.asw]) {
      expect(calculatorBound(solarGainOnOccupants, quantity), quantity.label).toEqual(
        SOLAR_GAIN_INFO.inputs[quantity.key].applicability,
      );
    }
  });

  it("is the fraction kind's 0 to 1 for the three fractions the info leaves unbounded", () => {
    for (const quantity of [q.sol_transmittance, q.f_svv, q.f_bes]) {
      expect(calculatorBound(solarGainOnOccupants, quantity), quantity.label).toEqual({ min: 0, max: 1 });
    }
  });

  it("is nothing for the outdoor temperature", () => {
    expect(calculatorBound(clothingFromOutdoorTemperature, q.tout)).toBeUndefined();
  });
});

describe("outOfRangeCalculatorInputs", () => {
  const withValue = (quantity: Quantity, value: number) => {
    const inputs = startingInputs(solarGainOnOccupants);
    return { ...inputs, values: new Map(inputs.values).set(quantity, value) };
  };

  it("is none at the defaults", () => {
    expect(outOfRangeCalculatorInputs(solarGainOnOccupants, startingInputs(solarGainOnOccupants))).toEqual([]);
  });

  it("names an input past its info row, and one past its kind bound", () => {
    expect(outOfRangeCalculatorInputs(solarGainOnOccupants, withValue(q.sol_altitude, 95))).toEqual([q.sol_altitude]);
    expect(outOfRangeCalculatorInputs(solarGainOnOccupants, withValue(q.f_svv, 1.2))).toEqual([q.f_svv]);
  });

  it("judges an end as a row shows it, as the gate does", () => {
    expect(outOfRangeCalculatorInputs(solarGainOnOccupants, withValue(q.sol_altitude, 90.001))).toEqual([]);
  });

  it("passes nothing the library warns of: at every end of every bound, Solar gain's result carries no warnings", () => {
    for (const { quantity } of solarGainOnOccupants.asks) {
      const bound = calculatorBound(solarGainOnOccupants, quantity)!;
      for (const end of [bound.min, bound.max]) {
        const inputs = withValue(quantity, end!);
        expect(outOfRangeCalculatorInputs(solarGainOnOccupants, inputs), `${quantity.key} ${end}`).toEqual([]);
        expect(solarGainOnOccupants.compute(inputs).warnings, `${quantity.key} ${end}`).toEqual([]);
      }
    }
  });

  it("names nothing for an input with no bound", () => {
    const inputs = { values: new Map([[q.tout, -80]]) };
    expect(outOfRangeCalculatorInputs(clothingFromOutdoorTemperature, inputs)).toEqual([]);
  });
});

/** A result whose output is `value`, as a calculator's compute gives it. */
const resultOf = (output: Quantity, value: number): CalculatorResult => ({ outputs: new Map([[output, value]]), warnings: [] });
const clothing = resultOf(q.clo, 0.83);
const increase = resultOf(q.delta_mrt, 4.2);

// Not the declaration's defaults where it matters: 1.5 met, above the 1.2 met
// ASHRAE 55 corrects from, and a mean radiant temperature apart from the air.
const room = withOption(
  withHumidityMode(enteredSlotFor(pmvPpdAshrae, { tdb: 24, tr: 27, v: 0.3, met: 1.5 }), humidityMode.dewPoint, DEFAULT_ATMOSPHERIC_PRESSURE),
  optionsOf(pmvPpdAshrae)[0],
  true,
);

describe("withCalculatorResult", () => {
  /** What a write must leave as it was: the humidity entry, the air speed and the options. */
  function expectUntouched(written: Slot, slot: Slot) {
    expect(written.humidity).toEqual(slot.humidity);
    expect(written.values.get(q.v)).toBe(slot.values.get(q.v));
    expect(written.airSpeed).toBe(slot.airSpeed);
    expect(written.options).toEqual(slot.options);
  }

  it("replaces the clothing insulation under clothing entry", () => {
    const written = withCalculatorResult(room, clothingFromOutdoorTemperature, clothing, pmvPpdAshrae);
    expect(written.values.get(q.clo)).toBeCloseTo(0.83, 2);
    expect(written.clothing).toBe(room.clothing);
    expectUntouched(written, room);
  });

  it("writes the standard's correction of the result under dynamic clothing entry", () => {
    const dynamic = withClothingMode(room, clothingMode.corrected, pmvPpdAshrae);
    const written = withCalculatorResult(dynamic, customEnsemble, clothing, pmvPpdAshrae);
    expect(written.values.get(q.clo_dynamic)).toBeCloseTo(clo_dynamic_ashrae(0.83, 1.5), 2);
    expect(written.values.has(q.clo)).toBe(false);
    expect(written.clothing.mode).toBe(clothingMode.corrected);
    expectUntouched(written, dynamic);
  });

  it("raises the mean radiant temperature by the increase under separate entry, leaving the air's", () => {
    const written = withCalculatorResult(room, solarGainOnOccupants, increase, pmvPpdAshrae);
    expect(written.values.get(q.tr)).toBeCloseTo(27 + 4.2, 2);
    expect(written.values.get(q.tdb)).toBeCloseTo(24, 2);
    expectUntouched(written, room);
  });

  it("raises again on a second write", () => {
    const once = withCalculatorResult(room, solarGainOnOccupants, increase, pmvPpdAshrae);
    const twice = withCalculatorResult(once, solarGainOnOccupants, increase, pmvPpdAshrae);
    expect(twice.values.get(q.tr)).toBeCloseTo(27 + 2 * 4.2, 2);
    expectUntouched(twice, room);
  });

  it("folds the raised mean radiant temperature and the expanded air temperature into the operative one at the model's standard", () => {
    const operative = withTemperatureMode(room, temperatureMode.operative, pmvPpdAshrae);
    const entered = operative.values.get(q.operative_tmp)!;
    const written = withCalculatorResult(operative, solarGainOnOccupants, increase, pmvPpdAshrae);
    expect(written.values.get(q.operative_tmp)).toBeCloseTo(t_o(entered, entered + 4.2, 0.3, pmvPpdAshrae.standard), 2);
    expect(written.values.has(q.tdb)).toBe(false);
    expect(written.values.has(q.tr)).toBe(false);
    expect(written.temperature.mode).toBe(temperatureMode.operative);
    expectUntouched(written, operative);
  });

  it("throws naming a calculator the model does not declare", () => {
    expect(() => withCalculatorResult(startingSlot(pmvPpdAshrae), solarGainOnOccupants, increase, { ...pmvPpdAshrae, inputs: [] })).toThrow(
      "Solar gain on occupants",
    );
  });
});

describe("panelCalculators", () => {
  const expected: [RegisteredModel, Calculator[]][] = [
    [pmvPpdAshrae, [solarGainOnOccupants, customEnsemble, clothingFromOutdoorTemperature]],
    [pmvPpdIso, [customEnsemble]],
    [adaptiveAshrae, []],
    [heatIndexRothfusz, []],
  ];

  for (const [model, calculators] of expected) {
    it(`gives ${model.info.label}'s calculators in row order, the same under operative and dynamic clothing entry`, () => {
      const starting = startingSlot(model);
      expect(panelCalculators(model, starting)).toEqual(calculators);
      expect(panelCalculators(model, { ...starting, ...entryModesWithTemperature(temperatureMode.operative) })).toEqual(calculators);
      expect(panelCalculators(model, { ...starting, ...entryModesWithClothing(clothingMode.corrected) })).toEqual(calculators);
    });
  }
});

describe("shownRow", () => {
  const P = DEFAULT_ATMOSPHERIC_PRESSURE;

  it("is the clothing insulation under clothing entry, the result after", () => {
    const row = shownRow(room, clothingFromOutdoorTemperature, clothing, pmvPpdAshrae, P);
    expect(row.quantity).toBe(q.clo);
    expect(row.before).toBe(room.values.get(q.clo));
    expect(row.after).toBeCloseTo(0.83, 2);
  });

  it("is the dynamic clothing insulation under dynamic clothing entry, the standard's correction of the result after", () => {
    const dynamic = withClothingMode(room, clothingMode.corrected, pmvPpdAshrae);
    const row = shownRow(dynamic, customEnsemble, clothing, pmvPpdAshrae, P);
    expect(row.quantity).toBe(q.clo_dynamic);
    expect(row.before).toBe(dynamic.values.get(q.clo_dynamic));
    expect(row.after).toBeCloseTo(clo_dynamic_ashrae(0.83, 1.5), 2);
  });

  it("is the mean radiant temperature under separate entry, raised by the increase after", () => {
    const row = shownRow(room, solarGainOnOccupants, increase, pmvPpdAshrae, P);
    expect([row.quantity, row.before]).toEqual([q.tr, 27]);
    expect(row.after).toBeCloseTo(27 + 4.2, 2);
  });

  it("is the operative temperature under operative entry, folded at the model's standard after", () => {
    const operative = withTemperatureMode(room, temperatureMode.operative, pmvPpdAshrae);
    const entered = operative.values.get(q.operative_tmp)!;
    const row = shownRow(operative, solarGainOnOccupants, increase, pmvPpdAshrae, P);
    expect(row.quantity).toBe(q.operative_tmp);
    expect(row.before).toBe(entered);
    expect(row.after).toBeCloseTo(t_o(entered, entered + 4.2, 0.3, pmvPpdAshrae.standard), 2);
  });

  it("is what the next Apply starts from once written: a second raise from the raised value", () => {
    const once = withCalculatorResult(room, solarGainOnOccupants, increase, pmvPpdAshrae);
    const row = shownRow(once, solarGainOnOccupants, increase, pmvPpdAshrae, P);
    expect(row.before).toBeCloseTo(27 + 4.2, 2);
    expect(row.after).toBeCloseTo(27 + 2 * 4.2, 2);
  });

  it("has an after that is not a number while there is no result", () => {
    const row = shownRow(room, solarGainOnOccupants, undefined, pmvPpdAshrae, P);
    expect([row.quantity, row.before, row.after]).toEqual([q.tr, 27, Number.NaN]);
    expect(row.brokenBound).toBeUndefined();
  });

  it("carries the row's bound where the after is outside it, as the panel marks it, and none inside it", () => {
    const past = resultOf(q.delta_mrt, 20);
    const raised = shownRow(room, solarGainOnOccupants, past, pmvPpdAshrae, P);
    expect(raised.brokenBound).toBeDefined();
    expect(raised.brokenBound).toEqual(enteredBound(pmvPpdAshrae, q.tr, room, P));
    expect(shownRow(room, solarGainOnOccupants, increase, pmvPpdAshrae, P).brokenBound).toBeUndefined();
  });

  it("carries the operative row's bound under operative entry, where the folded after is outside it", () => {
    // The fold weighs the raise by 0.4 at this air speed, so 20 K moves it 8 K and stays inside: 50 K is needed.
    const operative = withTemperatureMode(room, temperatureMode.operative, pmvPpdAshrae);
    const raised = shownRow(operative, solarGainOnOccupants, resultOf(q.delta_mrt, 50), pmvPpdAshrae, P);
    expect(raised.brokenBound).toBeDefined();
    expect(raised.brokenBound).toEqual(enteredBound(pmvPpdAshrae, q.operative_tmp, operative, P));
  });
});
