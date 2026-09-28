import { describe, expect, it } from "vitest";
import { t_o, v_relative } from "jsthermalcomfort";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { defaultSlot, enteredSlotFor } from "./declarationTestSlots";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";
import {
  enteredQuantities,
  enteredValue,
  operativeTemperatureOf,
  optionsReader,
  panelQuantities,
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

/** PMV (ISO 7730)'s own defaults, which the slots below start from. */
const { tdb, v, met } = valuesReader(defaultSlot(pmvPpdIso).values);
const rh = defaultSlot(pmvPpdIso).humidity.value;

describe("resolveQuantities", () => {
  it("resolves exactly the quantities the PMV wrapper takes, in SI", () => {
    const resolved = resolveQuantities(defaultSlot(pmvPpdIso), pmvPpdIso);
    expect(new Set(resolved.keys())).toEqual(new Set([q.tdb, q.tr, q.vr, q.rh, q.met, q.clo]));
    expect(resolved.get(q.rh)).toBe(rh);
  });

  it("derives vr with the library's v_relative when the model asks for it", () => {
    const resolved = resolveQuantities(defaultSlot(pmvPpdIso), pmvPpdIso);
    expect(resolved.get(q.vr)).toBe(v_relative(v, met));
    expect(resolved.get(q.vr)).toBeGreaterThan(v);
  });

  it("passes v through untouched when the model does not", () => {
    const withoutRelative = { ...pmvPpdIso, relativeAirSpeed: false };
    const resolved = resolveQuantities(defaultSlot(pmvPpdIso), withoutRelative);
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
      const slot: SlotInputs = { ...defaultSlot(pmvPpdIso), humidity: { mode, value: mode.fromRelativeHumidity(rh, tdb) } };
      const resolved = resolveQuantities(slot, pmvPpdIso);
      expect(resolved.get(q.rh), mode.id).toBeCloseTo(rh, digits);
      // Only the library's own rh reaches the call; the entered representation does not.
      expect(resolved.has(mode.quantity), mode.id).toBe(mode.quantity === q.rh);
    }
  });

  it("resolves no rh for a model whose inputs do not name it", () => {
    const withoutHumidity = { ...pmvPpdIso, inputs: pmvPpdIso.inputs.filter((entry) => entry.quantity !== q.rh) };
    expect(resolveQuantities(defaultSlot(pmvPpdIso), withoutHumidity).has(q.rh)).toBe(false);
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
    const result = pmvPpdIso.run(toLibraryInputs(defaultSlot(pmvPpdIso), pmvPpdIso));
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
    const values = valuesReader(resolveQuantities(defaultSlot(pmvPpdIso), pmvPpdIso));
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
  const room = enteredSlotFor(pmvPpdIso, { tdb: 24, tr: 28, v: 0.6 });

  it("is the library's t_o by the model's own standard under separate entry", () => {
    expect(operativeTemperatureOf(room, adaptiveAshrae)).toBeCloseTo(25.2);
    expect(operativeTemperatureOf(room, pmvPpdIso)).toBeCloseTo(25.16, 2);
  });

  it("passes no standard for a model that declares none, and the library's default decides", () => {
    expect(operativeTemperatureOf(room, withoutStandard)).toBe(t_o(24, 28, 0.6));
  });

  it("is the entered operative temperature under operative entry", () => {
    expect(operativeTemperatureOf(enteredSlotFor(pmvPpdIso, { operative_tmp: 26 }), adaptiveAshrae)).toBe(26);
  });

  it("is what the slot answers for operative_tmp in either entry mode", () => {
    expect(enteredValue(room, q.operative_tmp, adaptiveAshrae)).toBe(operativeTemperatureOf(room, adaptiveAshrae));
    expect(enteredValue(enteredSlotFor(pmvPpdIso, { operative_tmp: 26 }), q.operative_tmp, adaptiveAshrae)).toBe(26);
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
    expect(enteredValue(defaultSlot(pmvPpdIso), q.rh, pmvPpdIso)).toBe(rh);
    expect(enteredValue(enteredSlotFor(pmvPpdIso, { tdb: 27 }), q.tdb, pmvPpdIso)).toBe(27);
    expect(enteredValue(defaultSlot(pmvPpdIso), q.vr, pmvPpdIso)).toBeUndefined();
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

  describe("the panel's rows", () => {
    /** A slot in `temperature` and `humidity` entry; the rows depend on nothing else. */
    function slotEnteredAs(temperature: TemperatureMode, humidity: HumidityMode): SlotInputs {
      return { ...defaultSlot(pmvPpdIso), temperature: { mode: temperature }, humidity: { mode: humidity, value: 0 } };
    }

    for (const humidity of Object.values(humidityMode)) {
      it(`shows the entered ${humidity.id} in rh's place, in either temperature mode`, () => {
        const h = humidity.quantity;
        expect(panelQuantities(pmvPpdIso, slotEnteredAs(temperatureMode.separate, humidity))).toEqual([q.tdb, q.tr, q.v, h, q.met, q.clo]);
        expect(panelQuantities(pmvPpdIso, slotEnteredAs(temperatureMode.operative, humidity))).toEqual([q.operative_tmp, q.v, h, q.met, q.clo]);
        expect(panelQuantities(heatIndexRothfusz, slotEnteredAs(temperatureMode.separate, humidity))).toEqual([q.tdb, h]);
        expect(panelQuantities(heatIndexRothfusz, slotEnteredAs(temperatureMode.operative, humidity))).toEqual([q.tdb, h]);
      });

      it(`lists a model without the humidity entry group unchanged under ${humidity.id}`, () => {
        expect(panelQuantities(adaptiveAshrae, slotEnteredAs(temperatureMode.separate, humidity))).toEqual([q.tdb, q.tr, q.t_running_mean, q.v]);
        expect(panelQuantities(adaptiveAshrae, slotEnteredAs(temperatureMode.operative, humidity))).toEqual([q.operative_tmp, q.t_running_mean, q.v]);
      });
    }

    it("leaves the entered quantities with rh, which the axis picker offers", () => {
      const slot = slotEnteredAs(temperatureMode.separate, humidityMode.dewPoint);
      expect(panelQuantities(pmvPpdIso, slot)).not.toContain(q.rh);
      expect(enteredQuantities(pmvPpdIso, slot.temperature.mode)).toContain(q.rh);
    });
  });

  it("re-derives everything downstream of a swept value", () => {
    const slot = defaultSlot(pmvPpdIso);
    const swept = withEnteredValues(slot, new Map([[q.v, 0.6]]));
    expect(resolveQuantities(swept, pmvPpdIso).get(q.vr)).toBe(v_relative(0.6, met));
    expect(slot.values.get(q.v)).toBe(v);
  });

  it("sweeps the humidity entry as well, without touching the original", () => {
    const slot = defaultSlot(pmvPpdIso);
    const swept = withEnteredValues(slot, new Map([[q.rh, 80]]));
    expect(resolveQuantities(swept, pmvPpdIso).get(q.rh)).toBe(80);
    expect(slot.humidity.value).toBe(rh);
  });

  it("reads a dew-point entry as entered, and rh as derived from it at the slot's dry-bulb temperature", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(rh, tdb);
    const slot: SlotInputs = { ...defaultSlot(pmvPpdIso), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(enteredValue(slot, q.dew_point_tmp, pmvPpdIso)).toBe(dewPoint);
    expect(enteredValue(slot, q.rh, pmvPpdIso)).toBeCloseTo(rh, 0);
  });

  it("derives rh from the operative temperature under operative entry", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(rh, 24);
    const slot: SlotInputs = { ...enteredSlotFor(pmvPpdIso, { operative_tmp: 24 }), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(resolveQuantities(slot, pmvPpdIso).get(q.rh)).toBeCloseTo(rh, 0);
  });

  it("sweeps rh as rh whatever the entry mode", () => {
    const slot: SlotInputs = { ...defaultSlot(pmvPpdIso), humidity: { mode: humidityMode.dewPoint, value: 10 } };
    const swept = withEnteredValues(slot, new Map([[q.rh, 70]]));
    expect(swept.humidity).toEqual({ mode: humidityMode.rh, value: 70 });
    expect(resolveQuantities(swept, pmvPpdIso).get(q.rh)).toBe(70);
    expect(slot.humidity.mode).toBe(humidityMode.dewPoint);
  });

  it("expands a swept operative temperature to both temperatures", () => {
    const swept = withEnteredValues(enteredSlotFor(pmvPpdIso, { operative_tmp: 24 }), new Map([[q.operative_tmp, 28]]));
    const resolved = resolveQuantities(swept, pmvPpdIso);
    expect(resolved.get(q.tdb)).toBe(28);
    expect(resolved.get(q.tr)).toBe(28);
  });
});

describe("withTemperatureMode", () => {
  // One room, 24 / 28 °C at 0.6 m/s: ASHRAE 55 weighs the air temperature by
  // 0.7 at this speed, ISO 7726 by √(10v) (ADR-0002 decision 39).
  const room = enteredSlotFor(pmvPpdIso, { tdb: 24, tr: 28, v: 0.6 });

  it("converts separate → operative by the model's own standard", () => {
    expect(withTemperatureMode(room, temperatureMode.operative, adaptiveAshrae).values.get(q.operative_tmp)).toBeCloseTo(25.2);
    expect(withTemperatureMode(room, temperatureMode.operative, pmvPpdIso).values.get(q.operative_tmp)).toBeCloseTo(25.16, 2);
  });

  it("passes no standard for a model that declares none, and the library's default decides", () => {
    const converted = withTemperatureMode(room, temperatureMode.operative, withoutStandard);
    expect(converted.values.get(q.operative_tmp)).toBe(t_o(24, 28, 0.6));
  });

  it("sets both temperatures to the operative entry going back", () => {
    const converted = withTemperatureMode(enteredSlotFor(pmvPpdIso, { operative_tmp: 26 }), temperatureMode.separate, adaptiveAshrae);
    expect([converted.values.get(q.tdb), converted.values.get(q.tr)]).toEqual([26, 26]);
    expect(converted.values.has(q.operative_tmp)).toBe(false);
  });
});
