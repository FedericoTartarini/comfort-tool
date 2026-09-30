import { describe, expect, it } from "vitest";
import { clo_dynamic_ashrae, clo_dynamic_iso, clo_dynamic_iso_vr, hr_to_rh, psy_ta_rh, t_o, v_relative } from "jsthermalcomfort";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { enteredSlotFor, entryModesWithAirSpeed, entryModesWithClothing, entryModesWithTemperature } from "./declarationTestSlots";
import { airSpeedMode, clothingMode, humidityMode, temperatureMode, type HumidityMode, type TemperatureMode } from "./entryModes";
import { resolveQuantities, valuesReader } from "./libraryInputs";
import type { RegisteredModel } from "./modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "./quantities";
import {
  areSameEntryModes,
  defaultEntryModes,
  dynamicClothingOf,
  enteredQuantities,
  enteredValue,
  entryModesOf,
  operativeTemperatureOf,
  panelQuantities,
  relativeAirSpeedOf,
  relativeHumidityOf,
  startingSlot,
  underEntryModes,
  valueEntryGroups,
  withAirSpeedMode,
  withClothingMode,
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

  it("weighs by the entered relative air speed under relative air speed entry, the one air speed the slot holds", () => {
    const entered = enteredSlotFor(pmvPpdIso, { tdb: 24, tr: 28, vr: 0.6 });
    expect(operativeTemperatureOf(entered, pmvPpdIso)).toBe(operativeTemperatureOf(room, pmvPpdIso));
    const operative = withTemperatureMode(entered, temperatureMode.operative, pmvPpdIso);
    expect(operative.values.get(q.operative_tmp)).toBe(t_o(24, 28, 0.6, pmvPpdIso.standard));
    expect(operative.values.get(q.vr)).toBe(0.6);
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

  it("lists the relative air speed where the air speed stood, under relative air speed entry", () => {
    const corrected = entryModesWithAirSpeed(airSpeedMode.corrected);
    expect(enteredQuantities(pmvPpdIso, corrected)).toEqual([q.tdb, q.tr, q.vr, q.rh, q.met, q.clo]);
    expect(enteredQuantities(pmvPpdIso, { ...corrected, temperature: { mode: temperatureMode.operative } })).toEqual([
      q.operative_tmp,
      q.vr,
      q.rh,
      q.met,
      q.clo,
    ]);
  });

  it("lists the dynamic clothing insulation where the clothing insulation stood, under dynamic clothing entry", () => {
    const corrected = entryModesWithClothing(clothingMode.corrected);
    expect(enteredQuantities(pmvPpdIso, defaultEntryModes)).toEqual([q.tdb, q.tr, q.v, q.rh, q.met, q.clo]);
    expect(enteredQuantities(pmvPpdIso, corrected)).toEqual([q.tdb, q.tr, q.v, q.rh, q.met, q.clo_dynamic]);
  });

  it("lists the air speed of a model whose info names no relative air speed, in either mode", () => {
    const rows = enteredQuantities(adaptiveAshrae, defaultEntryModes);
    expect(rows).toContain(q.v);
    expect(enteredQuantities(adaptiveAshrae, entryModesWithAirSpeed(airSpeedMode.corrected))).toEqual(rows);
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

describe("withAirSpeedMode", () => {
  const moving = enteredSlotFor(pmvPpdIso, { v: 0.4, met: 2 });

  it("writes the relative air speed the model was given into the entry, at the slot's own air speed and metabolic rate", () => {
    const converted = withAirSpeedMode(moving, airSpeedMode.corrected);
    expect(converted.airSpeed.mode).toBe(airSpeedMode.corrected);
    expect(converted.values.get(q.vr)).toBe(v_relative(0.4, 2));
    expect(converted.values.get(q.vr)).toBe(resolveQuantities(moving, pmvPpdIso, DEFAULT_ATMOSPHERIC_PRESSURE).get(q.vr));
    expect(converted.values.has(q.v)).toBe(false);
  });

  // The expected air speed is whatever `v_relative` turns back into the entry:
  // the inverse is pinned against the library's function, not against 0.3.
  it.each([
    { name: "above 1 met takes the activity's share off", vr: 0.7, met: 2, v: 0.4 },
    { name: "at exactly 1 met keeps the number", vr: 0.7, met: 1, v: 0.7 },
    { name: "below 1 met keeps the number", vr: 0.7, met: 0.8, v: 0.7 },
  ])("inverts the correction going back: $name", ({ vr, met, v }) => {
    const converted = withAirSpeedMode(enteredSlotFor(pmvPpdIso, { vr, met }), airSpeedMode.uncorrected);
    expect(converted.airSpeed.mode).toBe(airSpeedMode.uncorrected);
    expect(converted.values.get(q.v)).toBe(v);
    expect(v_relative(v, met)).toBe(vr);
    expect(relativeAirSpeedOf(converted)).toBe(vr);
    expect(converted.values.has(q.vr)).toBe(false);
  });

  it("gives a negative air speed back for a relative air speed below the activity's share", () => {
    const converted = withAirSpeedMode(enteredSlotFor(pmvPpdIso, { vr: 0.1, met: 2 }), airSpeedMode.uncorrected);
    expect(converted.values.get(q.v)).toBe(-0.2);
    expect(relativeAirSpeedOf(converted)).toBe(0.1);
  });

  /** `slot` switched into relative air speed entry and back. */
  function roundTripped(slot: Slot): Slot {
    return withAirSpeedMode(withAirSpeedMode(slot, airSpeedMode.corrected), airSpeedMode.uncorrected);
  }

  // `v_relative` rounds the activity's share to 0.001, so taking 0.3·(met − 1)
  // off still air's relative air speed leaves up to 0.0005 either side of 0
  // (-0.0002 at 1.004 met), and an air speed below 0 is one the gate stops.
  it("gives still air back as exactly 0 at every metabolic rate", () => {
    for (let thousandths = 800; thousandths <= 4000; thousandths += 1) {
      const still = enteredSlotFor(pmvPpdIso, { v: 0, met: thousandths / 1000 });
      expect(roundTripped(still).values.get(q.v), `at ${thousandths / 1000} met`).toBe(0);
    }
  });

  // The tolerance is the library's: `v_relative` rounds to 0.001 above 1 met,
  // so an air speed cannot come back closer than that, and it need not, since
  // the model is given the relative air speed and that does not move. At
  // 1.005 met the share, 0.0015, is half way between two steps of 0.001, where
  // an inverse itself rounded to 0.001 would add 0.001 every round trip.
  it.each([
    { v: 0.1234, met: 2 },
    { v: 1.199, met: 1.005 },
    { v: 0.14, met: 1.005 },
    { v: 0.6, met: 3.337 },
  ])("gives $v m/s at $met met back to the library's 0.001, the relative air speed unmoved and no further round trip moving either", ({ v, met }) => {
    const entered = enteredSlotFor(pmvPpdIso, { v, met });
    const once = roundTripped(entered);
    expect(Math.abs((once.values.get(q.v) ?? NaN) - v)).toBeLessThanOrEqual(0.001);
    expect(relativeAirSpeedOf(once)).toBe(relativeAirSpeedOf(entered));
    expect(roundTripped(roundTripped(once)).values).toEqual(once.values);
  });

  it("hands back the slot itself when it is in the mode already", () => {
    expect(withAirSpeedMode(moving, airSpeedMode.uncorrected)).toBe(moving);
  });

  it("answers the relative air speed of a slot in either mode", () => {
    expect(relativeAirSpeedOf(moving)).toBe(v_relative(0.4, 2));
    expect(relativeAirSpeedOf(enteredSlotFor(pmvPpdIso, { vr: 0.7, met: 2 }))).toBe(0.7);
  });
});

describe("withClothingMode", () => {
  /** Above ASHRAE 55's 1.2 met, in moving air: both standards' rules correct, to different numbers. */
  const active = { v: 0.4, met: 2, clo: 1 };

  it("writes the dynamic clothing insulation the model was given into the entry, by the rule of the model's standard", () => {
    for (const [model, dynamic] of [
      [pmvPpdAshrae, clo_dynamic_ashrae(active.clo, active.met)],
      [pmvPpdIso, clo_dynamic_iso(active.clo, active.met, active.v)],
    ] as const) {
      const slot = enteredSlotFor(model, active);
      const converted = withClothingMode(slot, clothingMode.corrected, model);
      expect(converted.clothing.mode, model.info.label).toBe(clothingMode.corrected);
      expect(converted.values.get(q.clo_dynamic), model.info.label).toBe(dynamic);
      expect(converted.values.get(q.clo_dynamic)).toBe(resolveQuantities(slot, model, DEFAULT_ATMOSPHERIC_PRESSURE).get(q.clo));
      expect(converted.values.has(q.clo), model.info.label).toBe(false);
    }
    expect(clo_dynamic_ashrae(active.clo, active.met)).not.toBe(clo_dynamic_iso(active.clo, active.met, active.v));
  });

  it("corrects at the relative air speed the slot holds under relative air speed entry, by ISO 7730's rule", () => {
    const slot = enteredSlotFor(pmvPpdIso, { vr: 0.7, met: 2, clo: 1 });
    expect(withClothingMode(slot, clothingMode.corrected, pmvPpdIso).values.get(q.clo_dynamic)).toBe(clo_dynamic_iso_vr(1, 2, 0.7));
    // The same number the air speed that gives this relative air speed is corrected to.
    expect(clo_dynamic_iso_vr(1, 2, 0.7)).toBe(clo_dynamic_iso(1, 2, 0.4));
  });

  // The expected clothing insulation is whatever the model's standard's rule
  // turns back into the entry: the inverse is pinned against the library's
  // corrections (ADR-0002 decision 54 as revised a third time).
  it.each([
    { model: pmvPpdAshrae, name: "ASHRAE 55 above 1.2 met", entries: { clo_dynamic: 0.8, met: 2 }, clo: 1 },
    { model: pmvPpdAshrae, name: "ASHRAE 55 below 1.2 met, where nothing is corrected", entries: { clo_dynamic: 0.8, met: 1.1 }, clo: 0.8 },
    { model: pmvPpdIso, name: "ISO 7730", entries: { clo_dynamic: clo_dynamic_iso(1, 2, 0.4), met: 2, v: 0.4 }, clo: 1 },
    { model: pmvPpdIso, name: "ISO 7730 under relative air speed entry", entries: { clo_dynamic: clo_dynamic_iso_vr(1, 2, 0.7), met: 2, vr: 0.7 }, clo: 1 },
  ])("inverts the correction going back: $name", ({ model, entries, clo }) => {
    const kept = enteredSlotFor(model, entries);
    const converted = withClothingMode(kept, clothingMode.uncorrected, model);
    expect(converted.clothing.mode).toBe(clothingMode.uncorrected);
    expect(converted.values.get(q.clo)).toBe(clo);
    expect(dynamicClothingOf(converted, model)).toBe(entries.clo_dynamic);
    expect(converted.values.has(q.clo_dynamic)).toBe(false);
  });

  it("inverts a dynamic clothing insulation no entry of few decimals gives, to one that reads the same", () => {
    const kept = enteredSlotFor(pmvPpdIso, { clo_dynamic: 0.8, met: 2 });
    const converted = withClothingMode(kept, clothingMode.uncorrected, pmvPpdIso);
    expect(dynamicClothingOf(converted, pmvPpdIso)).toBeCloseTo(0.8, 2);
    expect(converted.values.get(q.clo)).not.toBe(0.8);
  });

  /** `slot` switched into dynamic clothing entry and back. */
  function roundTripped(slot: Slot, model: RegisteredModel): Slot {
    return withClothingMode(withClothingMode(slot, clothingMode.corrected, model), clothingMode.uncorrected, model);
  }

  it.each([pmvPpdAshrae, pmvPpdIso])("gives the clothing insulation back after any number of round trips, on $info.label", (model) => {
    for (const met of [1, 1.2, 2, 4]) {
      const slot = enteredSlotFor(model, { ...active, met });
      const once = roundTripped(slot, model);
      expect(once.values.get(q.clo), `${met} met`).toBe(active.clo);
      expect(dynamicClothingOf(once, model), `${met} met`).toBe(dynamicClothingOf(slot, model));
      expect(roundTripped(roundTripped(once, model), model).values, `${met} met`).toEqual(slot.values);
    }
  });

  it("gives 0 clo back as 0", () => {
    for (const model of [pmvPpdAshrae, pmvPpdIso]) {
      expect(roundTripped(enteredSlotFor(model, { clo: 0, met: 2 }), model).values.get(q.clo), model.info.label).toBe(0);
    }
  });

  // Nothing corrects it, so nothing is inverted: the group's conversion for a
  // model without the group, which the model switch never asks for.
  it("keeps the number going back for a model whose standard has no correction", () => {
    const uncorrecting = { ...pmvPpdIso, standard: undefined };
    const converted = withClothingMode(enteredSlotFor(pmvPpdIso, { clo_dynamic: 0.8, met: 2 }), clothingMode.uncorrected, uncorrecting);
    expect(converted.values.get(q.clo)).toBe(0.8);
  });

  it("moves nothing at or below 1.2 met under ASHRAE 55", () => {
    const converted = withClothingMode(enteredSlotFor(pmvPpdAshrae, { met: 1.2, clo: 1 }), clothingMode.corrected, pmvPpdAshrae);
    expect(converted.values.get(q.clo_dynamic)).toBe(1);
  });

  it("hands back the slot itself when it is in the mode already", () => {
    const slot = enteredSlotFor(pmvPpdIso, active);
    expect(withClothingMode(slot, clothingMode.uncorrected, pmvPpdIso)).toBe(slot);
  });

  it("answers the dynamic clothing insulation of a slot in either mode", () => {
    expect(dynamicClothingOf(enteredSlotFor(pmvPpdIso, active), pmvPpdIso)).toBe(clo_dynamic_iso(active.clo, active.met, active.v));
    expect(dynamicClothingOf(enteredSlotFor(pmvPpdIso, { clo_dynamic: 0.8, met: 2 }), pmvPpdIso)).toBe(0.8);
  });

  it("answers the clothing insulation as entered for a model whose standard has no correction", () => {
    expect(dynamicClothingOf(enteredSlotFor(pmvPpdIso, active), { ...pmvPpdIso, standard: undefined })).toBe(active.clo);
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

  it("stand the relative air speed in for the air speed under relative air speed entry, and back", () => {
    expect(underEntryModes(q.v, entryModesWithAirSpeed(airSpeedMode.corrected))).toBe(q.vr);
    expect(underEntryModes(q.vr, defaultEntryModes)).toBe(q.v);
    expect(underEntryModes(q.v, defaultEntryModes)).toBe(q.v);
  });

  it("stand the dynamic clothing insulation in for the clothing insulation under dynamic clothing entry, and back", () => {
    expect(underEntryModes(q.clo, entryModesWithClothing(clothingMode.corrected))).toBe(q.clo_dynamic);
    expect(underEntryModes(q.clo_dynamic, defaultEntryModes)).toBe(q.clo);
    expect(underEntryModes(q.clo, defaultEntryModes)).toBe(q.clo);
  });

  // Adaptive (ASHRAE 55) is under a standard with a correction and takes no
  // clothing; Heat Index takes none and has no standard.
  it("have the clothing group on a model that takes the clothing under a standard with a correction, and on no other", () => {
    const clothing = valueEntryGroups.find((group) => group.modes.includes(clothingMode.corrected));
    expect([pmvPpdIso, pmvPpdAshrae, adaptiveAshrae, heatIndexRothfusz].map((model) => clothing?.appliesTo(model))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(clothing?.appliesTo({ ...pmvPpdIso, standard: undefined })).toBe(false);
  });

  it("have the air-speed group on a model whose info names the relative air speed, and on no other", () => {
    const airSpeed = valueEntryGroups.find((group) => group.modes.includes(airSpeedMode.corrected));
    expect([pmvPpdIso, pmvPpdAshrae, adaptiveAshrae, heatIndexRothfusz].map((model) => airSpeed?.appliesTo(model))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("convert a slot by every group whose mode differs", () => {
    const modes = {
      temperature: { mode: temperatureMode.operative },
      airSpeed: { mode: airSpeedMode.corrected },
      clothing: { mode: clothingMode.corrected },
    };
    expect(withEntryModes(separate, modes, pmvPpdIso)).toEqual(
      withClothingMode(
        withAirSpeedMode(withTemperatureMode(separate, temperatureMode.operative, pmvPpdIso), airSpeedMode.corrected),
        clothingMode.corrected,
        pmvPpdIso,
      ),
    );
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
