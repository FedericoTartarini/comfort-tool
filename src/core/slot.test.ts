import { describe, expect, it } from "vitest";
import { t_o, v_relative } from "jsthermalcomfort";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { enteredSlotFor } from "./declarationTestSlots";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";
import { resolveQuantities, valuesReader } from "./libraryInputs";
import type { RegisteredModel } from "./modelDeclaration";
import { quantities } from "./quantities";
import {
  enteredQuantities,
  enteredValue,
  operativeTemperatureOf,
  panelQuantities,
  relativeHumidityOf,
  startingSlot,
  withEnteredValues,
  withHumidityMode,
  withTemperatureMode,
  type Slot,
} from "./slot";

const q = quantities;

/** A model with a temperature entry group and no standard: the library's default decides. */
const withoutStandard = { ...pmvPpdIso, standard: undefined };

/** PMV (ISO 7730)'s own defaults, which the slots below start from. */
const { tdb, v, met } = valuesReader(startingSlot(pmvPpdIso).values);
const rh = relativeHumidityOf(startingSlot(pmvPpdIso));

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
    expect(enteredValue(startingSlot(pmvPpdIso), q.rh, pmvPpdIso)).toBe(rh);
    expect(enteredValue(enteredSlotFor(pmvPpdIso, { tdb: 27 }), q.tdb, pmvPpdIso)).toBe(27);
    expect(enteredValue(startingSlot(pmvPpdIso), q.vr, pmvPpdIso)).toBeUndefined();
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
    function slotEnteredAs(temperature: TemperatureMode, humidity: HumidityMode): Slot {
      return { ...startingSlot(pmvPpdIso), temperature: { mode: temperature }, humidity: { mode: humidity, value: 0 } };
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
    const slot = startingSlot(pmvPpdIso);
    const swept = withEnteredValues(slot, new Map([[q.v, 0.6]]));
    expect(resolveQuantities(swept, pmvPpdIso).get(q.vr)).toBe(v_relative(0.6, met));
    expect(slot.values.get(q.v)).toBe(v);
  });

  it("sweeps the humidity entry as well, without touching the original", () => {
    const slot = startingSlot(pmvPpdIso);
    const swept = withEnteredValues(slot, new Map([[q.rh, 80]]));
    expect(resolveQuantities(swept, pmvPpdIso).get(q.rh)).toBe(80);
    expect(slot.humidity?.value).toBe(rh);
  });

  it("reads a dew-point entry as entered, and rh as derived from it at the slot's dry-bulb temperature", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(rh, tdb);
    const slot: Slot = { ...startingSlot(pmvPpdIso), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(enteredValue(slot, q.dew_point_tmp, pmvPpdIso)).toBe(dewPoint);
    expect(enteredValue(slot, q.rh, pmvPpdIso)).toBeCloseTo(rh, 0);
  });

  it("derives rh from the operative temperature under operative entry", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(rh, 24);
    const slot: Slot = { ...enteredSlotFor(pmvPpdIso, { operative_tmp: 24 }), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(resolveQuantities(slot, pmvPpdIso).get(q.rh)).toBeCloseTo(rh, 0);
  });

  it("sweeps rh as rh whatever the entry mode", () => {
    const slot: Slot = { ...startingSlot(pmvPpdIso), humidity: { mode: humidityMode.dewPoint, value: 10 } };
    const swept = withEnteredValues(slot, new Map([[q.rh, 70]]));
    expect(swept.humidity).toEqual({ mode: humidityMode.rh, value: 70 });
    expect(resolveQuantities(swept, pmvPpdIso).get(q.rh)).toBe(70);
    expect(slot.humidity?.mode).toBe(humidityMode.dewPoint);
  });

  for (const entered of Object.values(humidityMode)) {
    it(`sets the humidity entry to ${entered.id} on entering its quantity, whatever mode the slot was in, or none`, () => {
      for (const held of [undefined, ...Object.values(humidityMode)]) {
        const slot: Slot = { ...startingSlot(pmvPpdIso), humidity: held && { mode: held, value: 1 } };
        const written = withEnteredValues(slot, new Map([[entered.quantity, 2]]));
        expect(written.humidity).toEqual({ mode: entered, value: 2 });
        for (const mode of Object.values(humidityMode)) {
          expect(written.values.has(mode.quantity)).toBe(false);
        }
      }
    });
  }

  it("expands a swept operative temperature to both temperatures", () => {
    const swept = withEnteredValues(enteredSlotFor(pmvPpdIso, { operative_tmp: 24 }), new Map([[q.operative_tmp, 28]]));
    const resolved = resolveQuantities(swept, pmvPpdIso);
    expect(resolved.get(q.tdb)).toBe(28);
    expect(resolved.get(q.tr)).toBe(28);
  });
});

/** Adaptive (ASHRAE 55) takes no humidity, so the slot it starts on holds none. */
describe("a slot that holds no humidity", () => {
  const holdsNone = startingSlot(adaptiveAshrae);

  it("holds none from its start", () => {
    expect(holdsNone.humidity).toBeUndefined();
  });

  it("throws, naming humidity, when its relative humidity is read", () => {
    expect(() => relativeHumidityOf(holdsNone)).toThrow(/humidity/);
  });

  it("has no entered value for any humidity quantity", () => {
    for (const mode of Object.values(humidityMode)) {
      expect(enteredValue(holdsNone, mode.quantity, pmvPpdIso), mode.id).toBeUndefined();
    }
  });

  it("throws, naming humidity, when its humidity entry mode is changed", () => {
    for (const mode of Object.values(humidityMode)) {
      expect(() => withHumidityMode(holdsNone, mode), mode.id).toThrow(/humidity/);
    }
  });
});

describe("withHumidityMode", () => {
  const room: Slot = { ...enteredSlotFor(pmvPpdIso, { tdb: 27 }), humidity: { mode: humidityMode.rh, value: 35 } };

  it("re-expresses the entry at the slot's dry-bulb temperature, leaving the original untouched", () => {
    const converted = withHumidityMode(room, humidityMode.dewPoint);
    expect(converted.humidity).toEqual({ mode: humidityMode.dewPoint, value: humidityMode.dewPoint.fromRelativeHumidity(35, 27) });
    expect(room.humidity).toEqual({ mode: humidityMode.rh, value: 35 });
  });

  it("returns the slot unchanged for the mode it is already in", () => {
    expect(withHumidityMode(room, humidityMode.rh)).toBe(room);
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
