import { describe, expect, it } from "vitest";
import { t_o, v_relative } from "jsthermalcomfort";
import { Standard } from "jsthermalcomfort";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { humidityMode, temperatureMode } from "./entryModes";
import {
  enteredQuantities,
  enteredValue,
  operativeTemperatureOf,
  optionsReader,
  resolveQuantities,
  toLibraryInputs,
  valuesReader,
  withEnteredValues,
  withTemperatureMode,
  type SlotInputs,
} from "./libraryInputs";
import type { OptionSpec, RegisteredModel } from "./modelDeclaration";
import { quantities, type Quantity } from "./quantities";

const q = quantities;

/** A model with a temperature entry group and no standard: the library's default decides. */
const withoutStandard = { ...pmvPpdIso, standard: undefined };

function separateSlot(overrides: Partial<Record<"tdb" | "tr" | "v" | "met" | "clo", number>> = {}): SlotInputs {
  const values = { tdb: 25, tr: 25, v: 0.1, met: 1.1, clo: 0.5, ...overrides };
  return {
    values: new Map<Quantity, number>([
      [q.tdb, values.tdb],
      [q.tr, values.tr],
      [q.v, values.v],
      [q.met, values.met],
      [q.clo, values.clo],
    ]),
    humidity: { mode: humidityMode.rh, value: 50 },
    temperature: { mode: temperatureMode.separate },
    options: new Map(),
  };
}

function operativeSlot(operative: number): SlotInputs {
  return {
    values: new Map<Quantity, number>([
      [q.operative_tmp, operative],
      [q.v, 0.1],
      [q.met, 1.1],
      [q.clo, 0.5],
    ]),
    humidity: { mode: humidityMode.rh, value: 50 },
    temperature: { mode: temperatureMode.operative },
    options: new Map(),
  };
}

describe("resolveQuantities", () => {
  it("resolves exactly the quantities the PMV wrapper takes, in SI", () => {
    const resolved = resolveQuantities(separateSlot(), pmvPpdIso);
    expect(new Set(resolved.keys())).toEqual(new Set([q.tdb, q.tr, q.vr, q.rh, q.met, q.clo]));
    expect(resolved.get(q.rh)).toBe(50);
  });

  it("derives vr with the library's v_relative when the model asks for it", () => {
    const resolved = resolveQuantities(separateSlot({ v: 0.1, met: 1.1 }), pmvPpdIso);
    expect(resolved.get(q.vr)).toBe(v_relative(0.1, 1.1));
    expect(resolved.get(q.vr)).toBeGreaterThan(0.1);
  });

  it("passes v through untouched when the model does not", () => {
    const withoutRelative = { ...pmvPpdIso, relativeAirSpeed: false };
    const resolved = resolveQuantities(separateSlot(), withoutRelative);
    expect(resolved.get(q.v)).toBe(0.1);
    expect(resolved.has(q.vr)).toBe(false);
  });

  it("expands operative temperature to tdb = tr", () => {
    const resolved = resolveQuantities(operativeSlot(24), pmvPpdIso);
    expect(resolved.get(q.tdb)).toBe(24);
    expect(resolved.get(q.tr)).toBe(24);
    expect(resolved.has(q.operative_tmp)).toBe(false);
  });

  // ADR §7.10 item 9 asks for all five representations. The block asserted two
  // until 2026-09-22, when ticket 12 rewrote it onto the resolved map.
  //
  // One decimal, not more: the library's `psy_ta_rh` returns `t_dp` and `t_wb`
  // rounded to 0.1 °C, so entering the dew point it reports and converting back
  // lands 0.055 %rh away (wet bulb 0.012; the other three round-trip exactly).
  // The tolerance is that rounding, measured, not slack for the inverses.
  it("derives rh from every humidity representation, at the slot's dry-bulb temperature", () => {
    for (const mode of Object.values(humidityMode)) {
      const slot: SlotInputs = { ...separateSlot(), humidity: { mode, value: mode.fromRelativeHumidity(50, 25) } };
      const resolved = resolveQuantities(slot, pmvPpdIso);
      expect(resolved.get(q.rh), mode.id).toBeCloseTo(50, 0);
      // Only the library's own rh reaches the call; the entered representation does not.
      expect(resolved.has(mode.quantity), mode.id).toBe(mode.quantity === q.rh);
    }
  });

  it("resolves no rh for a model whose inputs do not name it", () => {
    const withoutHumidity = { ...pmvPpdIso, inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.rh) };
    expect(resolveQuantities(separateSlot(), withoutHumidity).has(q.rh)).toBe(false);
  });

  it("does not expand an operative entry for a model without separate temperatures", () => {
    const withoutTemperatures = {
      ...pmvPpdIso,
      inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.tdb && entry.quantity !== q.tr),
    };
    const resolved = resolveQuantities(operativeSlot(24), withoutTemperatures);
    expect(resolved.has(q.tdb)).toBe(false);
    expect(resolved.has(q.tr)).toBe(false);
    expect(resolved.get(q.operative_tmp)).toBe(24);
  });
});

describe("toLibraryInputs", () => {
  it("feeds the declared model a finite result end to end", () => {
    const result = pmvPpdIso.run(toLibraryInputs(separateSlot(), pmvPpdIso));
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
    const values = valuesReader(resolveQuantities(separateSlot(), pmvPpdIso));
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

describe("operativeTemperatureOf", () => {
  // One room, 24 / 28 °C at 0.6 m/s: ASHRAE 55 weighs the air temperature by
  // 0.7 at this speed, ISO 7726 by √(10v), and neither is the plain mean 26.
  const room = separateSlot({ tdb: 24, tr: 28, v: 0.6 });

  it("is the library's t_o by the model's own standard under separate entry", () => {
    expect(operativeTemperatureOf(room, adaptiveAshrae)).toBeCloseTo(25.2);
    expect(operativeTemperatureOf(room, pmvPpdIso)).toBeCloseTo(25.16, 2);
  });

  it("passes no standard for a model that declares none, and the library's default decides", () => {
    expect(operativeTemperatureOf(room, withoutStandard)).toBe(t_o(24, 28, 0.6));
  });

  it("is the entered operative temperature under operative entry", () => {
    expect(operativeTemperatureOf(operativeSlot(26), adaptiveAshrae)).toBe(26);
  });

  it("is what the slot answers for operative_tmp in either entry mode", () => {
    expect(enteredValue(room, q.operative_tmp, adaptiveAshrae)).toBe(operativeTemperatureOf(room, adaptiveAshrae));
    expect(enteredValue(operativeSlot(26), q.operative_tmp, adaptiveAshrae)).toBe(26);
  });

  it("is where the switch into operative entry lands, so the click does not move the marker", () => {
    for (const model of [adaptiveAshrae, pmvPpdIso, withoutStandard]) {
      const switched = withTemperatureMode(room, temperatureMode.operative, model);
      expect(enteredValue(switched, q.operative_tmp, model)).toBe(enteredValue(room, q.operative_tmp, model));
    }
  });
});

describe("entered values", () => {
  it("reads the humidity entry from where the slot keeps it", () => {
    expect(enteredValue(separateSlot(), q.rh, pmvPpdIso)).toBe(50);
    expect(enteredValue(separateSlot({ tdb: 27 }), q.tdb, pmvPpdIso)).toBe(27);
    expect(enteredValue(separateSlot(), q.vr, pmvPpdIso)).toBeUndefined();
  });

  it("lists the panel rows of the current temperature mode", () => {
    expect(enteredQuantities(pmvPpdIso, temperatureMode.separate)).toEqual([q.tdb, q.tr, q.v, q.rh, q.met, q.clo]);
    expect(enteredQuantities(pmvPpdIso, temperatureMode.operative)).toEqual([q.operative_tmp, q.v, q.rh, q.met, q.clo]);
  });

  it("lists only the inputs of a model without the temperature entry group, in either mode", () => {
    const model = {
      ...pmvPpdIso,
      inputs: pmvPpdIso.inputs.filter(({ quantity }) => quantity === q.tdb || quantity === q.rh),
    } satisfies RegisteredModel;
    expect(enteredQuantities(model, temperatureMode.separate)).toEqual([q.tdb, q.rh]);
    expect(enteredQuantities(model, temperatureMode.operative)).toEqual([q.tdb, q.rh]);
  });

  it("keeps a lone mean radiant temperature, which is not the first of the separate rows", () => {
    const model = {
      ...pmvPpdIso,
      inputs: pmvPpdIso.inputs.filter(({ quantity }) => quantity === q.tr || quantity === q.rh),
    } satisfies RegisteredModel;
    expect(enteredQuantities(model, temperatureMode.separate)).toEqual([q.tr, q.rh]);
    expect(enteredQuantities(model, temperatureMode.operative)).toEqual([q.tr, q.rh]);
  });

  it("re-derives everything downstream of a swept value", () => {
    const swept = withEnteredValues(separateSlot(), new Map([[q.v, 0.6]]));
    expect(resolveQuantities(swept, pmvPpdIso).get(q.vr)).toBe(v_relative(0.6, 1.1));
    expect(separateSlot().values.get(q.v)).toBe(0.1);
  });

  it("sweeps the humidity entry as well, without touching the original", () => {
    const slot = separateSlot();
    const swept = withEnteredValues(slot, new Map([[q.rh, 80]]));
    expect(resolveQuantities(swept, pmvPpdIso).get(q.rh)).toBe(80);
    expect(slot.humidity.value).toBe(50);
  });

  it("derives rh from a dew-point entry at the slot's dry-bulb temperature", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(50, 25);
    const slot: SlotInputs = { ...separateSlot(), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(resolveQuantities(slot, pmvPpdIso).get(q.rh)).toBeCloseTo(50, 0);
    expect(enteredValue(slot, q.dew_point_tmp, pmvPpdIso)).toBe(dewPoint);
    expect(enteredValue(slot, q.rh, pmvPpdIso)).toBeCloseTo(50, 0);
  });

  it("derives rh from the operative temperature under operative entry", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(50, 24);
    const slot: SlotInputs = { ...operativeSlot(24), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(resolveQuantities(slot, pmvPpdIso).get(q.rh)).toBeCloseTo(50, 0);
  });

  it("sweeps rh as rh whatever the entry mode", () => {
    const slot: SlotInputs = { ...separateSlot(), humidity: { mode: humidityMode.dewPoint, value: 10 } };
    const swept = withEnteredValues(slot, new Map([[q.rh, 70]]));
    expect(swept.humidity).toEqual({ mode: humidityMode.rh, value: 70 });
    expect(resolveQuantities(swept, pmvPpdIso).get(q.rh)).toBe(70);
    expect(slot.humidity.mode).toBe(humidityMode.dewPoint);
  });

  it("expands a swept operative temperature to both temperatures", () => {
    const swept = withEnteredValues(operativeSlot(24), new Map([[q.operative_tmp, 28]]));
    const resolved = resolveQuantities(swept, pmvPpdIso);
    expect(resolved.get(q.tdb)).toBe(28);
    expect(resolved.get(q.tr)).toBe(28);
  });
});

describe("withTemperatureMode", () => {
  // One room, 24 / 28 °C at 0.6 m/s: ASHRAE 55 weighs the air temperature by
  // 0.7 at this speed, ISO 7726 by √(10v) (ADR-0002 decision 39).
  const room = separateSlot({ tdb: 24, tr: 28, v: 0.6 });

  it("converts separate → operative by the model's own standard", () => {
    expect(withTemperatureMode(room, temperatureMode.operative, adaptiveAshrae).values.get(q.operative_tmp)).toBeCloseTo(25.2);
    expect(withTemperatureMode(room, temperatureMode.operative, pmvPpdIso).values.get(q.operative_tmp)).toBeCloseTo(25.16, 2);
  });

  it("passes no standard for a model that declares none, and the library's default decides", () => {
    const converted = withTemperatureMode(room, temperatureMode.operative, withoutStandard);
    expect(converted.values.get(q.operative_tmp)).toBe(t_o(24, 28, 0.6));
  });

  it("sets both temperatures to the operative entry going back", () => {
    const converted = withTemperatureMode(operativeSlot(26), temperatureMode.separate, adaptiveAshrae);
    expect([converted.values.get(q.tdb), converted.values.get(q.tr)]).toEqual([26, 26]);
    expect(converted.values.has(q.operative_tmp)).toBe(false);
  });
});

describe("standard", () => {
  it("pins ISO 7730:2005", () => {
    expect(pmvPpdIso.standard).toBe(Standard.iso_7730_2005);
  });
});
