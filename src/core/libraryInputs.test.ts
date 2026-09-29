import { describe, expect, it } from "vitest";
import { v_relative } from "jsthermalcomfort";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { enteredSlotFor } from "./declarationTestSlots";
import { humidityMode, type HumidityMode } from "./entryModes";
import { optionsReader, resolveQuantities, toLibraryInputs, valuesReader } from "./libraryInputs";
import type { OptionSpec } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";
import { relativeHumidityOf, startingSlot, type Slot } from "./slot";

const q = quantities;

/** PMV (ISO 7730)'s own defaults, which the slots below start from. */
const { tdb, v, met } = valuesReader(startingSlot(pmvPpdIso).values);
const rh = relativeHumidityOf(startingSlot(pmvPpdIso));

describe("resolveQuantities", () => {
  it("resolves exactly the quantities the PMV wrapper takes, in SI", () => {
    const resolved = resolveQuantities(startingSlot(pmvPpdIso), pmvPpdIso);
    expect(new Set(resolved.keys())).toEqual(new Set([q.tdb, q.tr, q.vr, q.rh, q.met, q.clo]));
    expect(resolved.get(q.rh)).toBe(rh);
  });

  it("derives vr with the library's v_relative when the model asks for it", () => {
    const resolved = resolveQuantities(startingSlot(pmvPpdIso), pmvPpdIso);
    expect(resolved.get(q.vr)).toBe(v_relative(v, met));
    expect(resolved.get(q.vr)).toBeGreaterThan(v);
  });

  it("passes v through untouched when the model does not", () => {
    const inputs = Object.fromEntries(Object.entries(pmvPpdIso.info.inputs).filter(([key]) => key !== q.vr.key));
    const withoutRelative = { ...pmvPpdIso, info: { ...pmvPpdIso.info, inputs } };
    const resolved = resolveQuantities(startingSlot(pmvPpdIso), withoutRelative);
    expect(resolved.get(q.v)).toBe(v);
    expect(resolved.has(q.vr)).toBe(false);
  });

  it("expands operative temperature to tdb = tr", () => {
    const resolved = resolveQuantities(enteredSlotFor(pmvPpdIso, { operative_tmp: 24 }), pmvPpdIso);
    expect(resolved.get(q.tdb)).toBe(24);
    expect(resolved.get(q.tr)).toBe(24);
    expect(resolved.has(q.operative_tmp)).toBe(false);
  });

  // ADR §7's acceptance item 9 asks for all five representations.
  //
  // The library's `psy_ta_rh` returns `t_dp` and `t_wb` rounded to 0.1 °C, so
  // entering the dew point it reports and converting back lands 0.055 %rh away
  // (wet bulb 0.012), while the other three round-trip exactly. The tolerance
  // is that rounding, measured, not slack for the inverses: the dew point
  // holds to the whole percent, the wet bulb to one decimal.
  const roundTripDigits = new Map<HumidityMode, number>([
    [humidityMode.rh, 9],
    [humidityMode.humidityRatio, 9],
    [humidityMode.vapourPressure, 9],
    [humidityMode.wetBulb, 1],
    [humidityMode.dewPoint, 0],
  ]);

  it("derives rh from every humidity representation, at the slot's dry-bulb temperature", () => {
    // A mode without a tolerance is a mode this test does not round-trip.
    expect(new Set(roundTripDigits.keys())).toEqual(new Set(Object.values(humidityMode)));
    for (const [mode, digits] of roundTripDigits) {
      const slot: Slot = { ...startingSlot(pmvPpdIso), humidity: { mode, value: mode.fromRelativeHumidity(rh, tdb) } };
      const resolved = resolveQuantities(slot, pmvPpdIso);
      expect(resolved.get(q.rh), mode.id).toBeCloseTo(rh, digits);
      // Only the library's own rh reaches the call; the entered representation does not.
      expect(resolved.has(mode.quantity), mode.id).toBe(mode.quantity === q.rh);
    }
  });

  it("resolves no rh for a model whose inputs do not name it", () => {
    const withoutHumidity = { ...pmvPpdIso, inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.rh) };
    expect(resolveQuantities(startingSlot(pmvPpdIso), withoutHumidity).has(q.rh)).toBe(false);
  });

  it("does not expand an operative entry for a model without separate temperatures", () => {
    const withoutTemperatures = {
      ...pmvPpdIso,
      inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.tdb && entry.quantity !== q.tr),
    };
    const resolved = resolveQuantities(enteredSlotFor(pmvPpdIso, { operative_tmp: 24 }), withoutTemperatures);
    expect(resolved.has(q.tdb)).toBe(false);
    expect(resolved.has(q.tr)).toBe(false);
    expect(resolved.get(q.operative_tmp)).toBe(24);
  });
});

describe("toLibraryInputs", () => {
  it("feeds the declared model a finite result end to end", () => {
    const result = pmvPpdIso.run(toLibraryInputs(startingSlot(pmvPpdIso), pmvPpdIso));
    expect(Number.isFinite(result.pmv)).toBe(true);
    expect(result.tsv).toBeDefined();
  });
});

describe("valuesReader", () => {
  it("answers each quantity under its own key", () => {
    const resolved = new Map<Quantity, number>([
      [q.tdb, 25],
      [q.rh, 50],
    ]);
    const values = valuesReader(resolved);
    expect([values.rh, values.tdb, values.rh]).toEqual([50, 25, 50]);
  });

  it("throws naming the quantity the map does not carry, rather than answering undefined", () => {
    const values = valuesReader(resolveQuantities(startingSlot(pmvPpdIso), pmvPpdIso));
    expect(() => values.wme).toThrow(`Slot has no value for ${q.wme.label}`);
  });
});

describe("optionsReader", () => {
  const control: OptionSpec = { key: "airspeed_control", label: "Occupants control the air speed", default: false };

  it("answers what the map holds for the option, not its default", () => {
    expect(optionsReader(new Map([[control, true]]))(control)).toBe(true);
  });

  it("throws naming the option the map does not carry, rather than answering undefined", () => {
    expect(() => optionsReader(new Map())(control)).toThrow(`Slot has no value for ${control.label}`);
  });
});
