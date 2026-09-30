import { describe, expect, it } from "vitest";
import { hr_to_rh, psy_ta_rh, t_o, v_relative } from "jsthermalcomfort";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { enteredSlotFor, entryModesWithTemperature } from "./declarationTestSlots";
import { humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";
import { resolveQuantities, valuesReader } from "./libraryInputs";
import type { RegisteredModel } from "./modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "./quantities";
import {
  areSameEntryModes,
  defaultEntryModes,
  enteredQuantities,
  enteredValue,
  entryModesOf,
  operativeTemperatureOf,
  panelQuantities,
  relativeHumidityOf,
  startingSlot,
  underEntryModes,
  valueEntryGroups,
  withEnteredValues,
  withEntryModes,
  withHumidityMode,
  withTemperatureMode,
  type Slot,
} from "./slot";

const q = quantities;

/** An atmospheric pressure other than the default, about 1 950 m above sea level. */
const LOWER_PRESSURE = 80000;

/** A model with a temperature entry group and no standard: the library's default decides. */
const withoutStandard = { ...pmvPpdIso, standard: undefined };

/** PMV (ISO 7730)'s own defaults, which the slots below start from. */
const { tdb, v, met } = valuesReader(startingSlot(pmvPpdIso).values);
const rh = relativeHumidityOf(startingSlot(pmvPpdIso), DEFAULT_ATMOSPHERIC_PRESSURE);

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
    expect(enteredValue(room, q.operative_tmp, adaptiveAshrae, DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(operativeTemperatureOf(room, adaptiveAshrae));
    expect(enteredValue(enteredSlotFor(pmvPpdIso, { operative_tmp: 26 }), q.operative_tmp, adaptiveAshrae, DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(26);
  });

  it("is where the switch into operative entry lands, so the click does not move the marker", () => {
    for (const model of [adaptiveAshrae, pmvPpdIso, withoutStandard]) {
      const switched = withTemperatureMode(room, temperatureMode.operative, model);
      expect(enteredValue(switched, q.operative_tmp, model, DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(enteredValue(room, q.operative_tmp, model, DEFAULT_ATMOSPHERIC_PRESSURE));
    }
  });
});

describe("entered values", () => {
  it("reads the humidity entry from where the slot keeps it", () => {
    expect(enteredValue(startingSlot(pmvPpdIso), q.rh, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(rh);
    expect(enteredValue(enteredSlotFor(pmvPpdIso, { tdb: 27 }), q.tdb, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(27);
    expect(enteredValue(startingSlot(pmvPpdIso), q.vr, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toBeUndefined();
  });

  it("lists the panel rows of the current temperature mode", () => {
    expect(enteredQuantities(pmvPpdIso, entryModesWithTemperature(temperatureMode.separate))).toEqual([q.tdb, q.tr, q.v, q.rh, q.met, q.clo]);
    expect(enteredQuantities(pmvPpdIso, entryModesWithTemperature(temperatureMode.operative))).toEqual([q.operative_tmp, q.v, q.rh, q.met, q.clo]);
  });

  it("lists only the inputs of a model without the temperature entry group, in either mode", () => {
    const model = {
      ...pmvPpdIso,
      inputs: pmvPpdIso.inputs.filter(({ quantity }) => quantity === q.tdb || quantity === q.rh),
    } satisfies RegisteredModel;
    expect(enteredQuantities(model, entryModesWithTemperature(temperatureMode.separate))).toEqual([q.tdb, q.rh]);
    expect(enteredQuantities(model, entryModesWithTemperature(temperatureMode.operative))).toEqual([q.tdb, q.rh]);
  });

  it("keeps a lone mean radiant temperature, which is not the first of the separate rows", () => {
    const model = {
      ...pmvPpdIso,
      inputs: pmvPpdIso.inputs.filter(({ quantity }) => quantity === q.tr || quantity === q.rh),
    } satisfies RegisteredModel;
    expect(enteredQuantities(model, entryModesWithTemperature(temperatureMode.separate))).toEqual([q.tr, q.rh]);
    expect(enteredQuantities(model, entryModesWithTemperature(temperatureMode.operative))).toEqual([q.tr, q.rh]);
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
      expect(enteredQuantities(pmvPpdIso, slot)).toContain(q.rh);
    });
  });

  it("re-derives everything downstream of a swept value", () => {
    const slot = startingSlot(pmvPpdIso);
    const swept = withEnteredValues(slot, new Map([[q.v, 0.6]]));
    expect(resolveQuantities(swept, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE).get(q.vr)).toBe(v_relative(0.6, met));
    expect(slot.values.get(q.v)).toBe(v);
  });

  it("sweeps the humidity entry as well, without touching the original", () => {
    const slot = startingSlot(pmvPpdIso);
    const swept = withEnteredValues(slot, new Map([[q.rh, 80]]));
    expect(resolveQuantities(swept, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE).get(q.rh)).toBe(80);
    expect(slot.humidity?.value).toBe(rh);
  });

  it("reads a dew-point entry as entered, and rh as derived from it at the slot's dry-bulb temperature", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(rh, tdb, DEFAULT_ATMOSPHERIC_PRESSURE);
    const slot: Slot = { ...startingSlot(pmvPpdIso), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(enteredValue(slot, q.dew_point_tmp, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(dewPoint);
    expect(enteredValue(slot, q.rh, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE)).toBeCloseTo(rh, 0);
  });

  it("derives rh from the operative temperature under operative entry", () => {
    const dewPoint = humidityMode.dewPoint.fromRelativeHumidity(rh, 24, DEFAULT_ATMOSPHERIC_PRESSURE);
    const slot: Slot = { ...enteredSlotFor(pmvPpdIso, { operative_tmp: 24 }), humidity: { mode: humidityMode.dewPoint, value: dewPoint } };
    expect(resolveQuantities(slot, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE).get(q.rh)).toBeCloseTo(rh, 0);
  });

  it("sweeps rh as rh whatever the entry mode", () => {
    const slot: Slot = { ...startingSlot(pmvPpdIso), humidity: { mode: humidityMode.dewPoint, value: 10 } };
    const swept = withEnteredValues(slot, new Map([[q.rh, 70]]));
    expect(swept.humidity).toEqual({ mode: humidityMode.rh, value: 70 });
    expect(resolveQuantities(swept, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE).get(q.rh)).toBe(70);
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
    const resolved = resolveQuantities(swept, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE);
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
    expect(() => relativeHumidityOf(holdsNone, DEFAULT_ATMOSPHERIC_PRESSURE)).toThrow(/humidity/);
  });

  it("has no entered value for any humidity quantity", () => {
    for (const mode of Object.values(humidityMode)) {
      expect(enteredValue(holdsNone, mode.quantity, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE), mode.id).toBeUndefined();
    }
  });

  it("throws, naming humidity, when its humidity entry mode is changed", () => {
    for (const mode of Object.values(humidityMode)) {
      expect(() => withHumidityMode(holdsNone, mode, DEFAULT_ATMOSPHERIC_PRESSURE), mode.id).toThrow(/humidity/);
    }
  });
});

describe("withHumidityMode", () => {
  const room: Slot = { ...enteredSlotFor(pmvPpdIso, { tdb: 27 }), humidity: { mode: humidityMode.rh, value: 35 } };

  it("re-expresses the entry at the slot's dry-bulb temperature, leaving the original untouched", () => {
    const converted = withHumidityMode(room, humidityMode.dewPoint, DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(converted.humidity).toEqual({ mode: humidityMode.dewPoint, value: humidityMode.dewPoint.fromRelativeHumidity(35, 27, DEFAULT_ATMOSPHERIC_PRESSURE) });
    expect(room.humidity).toEqual({ mode: humidityMode.rh, value: 35 });
  });

  it("returns the slot unchanged for the mode it is already in", () => {
    expect(withHumidityMode(room, humidityMode.rh, DEFAULT_ATMOSPHERIC_PRESSURE)).toBe(room);
  });
});

/**
 * The atmospheric pressure reaches a humidity entry only where the library's
 * conversion takes `p_atm`: to and from humidity ratio (ADR-0002 decision 49).
 * Expected values are the library's, called with `p_atm`.
 */
describe("a humidity entry at an atmospheric pressure", () => {
  const room = enteredSlotFor(pmvPpdIso, { tdb: 27 });
  const pressures = [DEFAULT_ATMOSPHERIC_PRESSURE, LOWER_PRESSURE];

  /** `room` with its humidity entered as `value` in `mode`. */
  function enteredAs(mode: HumidityMode, value: number): Slot {
    return { ...room, humidity: { mode, value } };
  }

  it("gives a humidity ratio's relative humidity at that pressure", () => {
    const slot = enteredAs(humidityMode.humidityRatio, 0.01);
    for (const pressure of pressures) {
      expect(relativeHumidityOf(slot, pressure), `${pressure} Pa`).toBe(hr_to_rh(0.01, 27, pressure));
    }
    expect(relativeHumidityOf(slot, LOWER_PRESSURE)).not.toBeCloseTo(relativeHumidityOf(slot, DEFAULT_ATMOSPHERIC_PRESSURE), 0);
  });

  it("re-expresses a relative humidity as the humidity ratio at that pressure", () => {
    const slot = enteredAs(humidityMode.rh, 35);
    for (const pressure of pressures) {
      expect(withHumidityMode(slot, humidityMode.humidityRatio, pressure).humidity?.value, `${pressure} Pa`).toBe(psy_ta_rh(27, 35, pressure).hr);
    }
  });

  it("converts every other entry mode, both ways, the same whatever the pressure", () => {
    const others = [humidityMode.rh, humidityMode.dewPoint, humidityMode.wetBulb, humidityMode.vapourPressure];
    for (const mode of others) {
      const slot = enteredAs(mode, mode.fromRelativeHumidity(35, 27, DEFAULT_ATMOSPHERIC_PRESSURE));
      expect(relativeHumidityOf(slot, LOWER_PRESSURE), mode.id).toBe(relativeHumidityOf(slot, DEFAULT_ATMOSPHERIC_PRESSURE));
      const fromRelativeHumidity = enteredAs(humidityMode.humidityRatio, 0.01);
      expect(withHumidityMode(fromRelativeHumidity, mode, LOWER_PRESSURE).humidity?.value, mode.id).toBe(
        mode.fromRelativeHumidity(hr_to_rh(0.01, 27, LOWER_PRESSURE), 27, DEFAULT_ATMOSPHERIC_PRESSURE),
      );
    }
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

describe("the entry groups held among the values", () => {
  const separate = enteredSlotFor(pmvPpdIso, { tdb: 22, tr: 28 });
  const operative = entryModesWithTemperature(temperatureMode.operative);

  it("start a slot in the modes a declaration writes its inputs in", () => {
    expect(entryModesOf(startingSlot(pmvPpdIso))).toEqual(defaultEntryModes);
    for (const group of valueEntryGroups) {
      expect(group.modes).toContain(group.modeOf(defaultEntryModes));
    }
  });

  it("stand a mode's axis in for a quantity only another mode of the group enters", () => {
    expect(underEntryModes(q.tdb, operative)).toBe(q.operative_tmp);
    expect(underEntryModes(q.tr, operative)).toBe(q.operative_tmp);
    expect(underEntryModes(q.operative_tmp, defaultEntryModes)).toBe(q.tdb);
  });

  it("leave a quantity of the mode entered, and one of no group, as it is", () => {
    expect(underEntryModes(q.tr, defaultEntryModes)).toBe(q.tr);
    expect(underEntryModes(q.operative_tmp, operative)).toBe(q.operative_tmp);
    expect(underEntryModes(q.met, operative)).toBe(q.met);
  });

  it("convert a slot into other entry modes as the entry-mode change does", () => {
    expect(withEntryModes(separate, operative, pmvPpdIso)).toEqual(withTemperatureMode(separate, temperatureMode.operative, pmvPpdIso));
  });

  it("hand back the slot itself when it is in the entry modes already", () => {
    expect(withEntryModes(separate, defaultEntryModes, pmvPpdIso)).toBe(separate);
  });

  it("tell the same entry modes from different ones, whatever object holds them", () => {
    expect(areSameEntryModes(entryModesOf(separate), defaultEntryModes)).toBe(true);
    expect(areSameEntryModes(entryModesOf(separate), operative)).toBe(false);
  });
});
