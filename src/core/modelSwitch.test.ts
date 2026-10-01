import { describe, expect, it } from "vitest";
import { humidityMode, temperatureMode } from "./entryModes";
import { enteredValue, type SlotInputs } from "./libraryInputs";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { quantities, type Quantity } from "./quantities";
import { adjustToBounds, rehearseSwitch } from "./modelSwitch";

const q = quantities;

/** A slot in the plain shape core/ reads, so no state/ class is needed here. */
function slotOf(values: ReadonlyMap<Quantity, number>, overrides: Partial<SlotInputs> = {}): SlotInputs {
  return {
    values: new Map(values),
    humidity: { mode: humidityMode.rh, value: 50 },
    temperature: { mode: temperatureMode.separate },
    // A model with no options; the switch carries the bag through untouched.
    options: new Map(),
    ...overrides,
  };
}

const pmvSlot = (): SlotInputs =>
  slotOf(
    new Map<Quantity, number>([
      [q.tdb, 25],
      [q.tr, 25],
      [q.v, 0.1],
      [q.met, 1.1],
      [q.clo, 0.5],
    ]),
  );

describe("rehearseSwitch", () => {
  it("mutates neither the slot nor its map", () => {
    const slot = pmvSlot();
    const before = new Map(slot.values);
    rehearseSwitch(slot, heatIndexRothfusz);
    expect(slot.values).toEqual(before);
    expect(slot.temperature.mode).toBe(temperatureMode.separate);
  });

  it("keeps the values the new model shares with the old one", () => {
    const { inputs } = rehearseSwitch(pmvSlot(), heatIndexRothfusz);
    expect(enteredValue(inputs, q.tdb)).toBe(25);
    expect(inputs.humidity.value).toBe(50);
  });

  it("seeds an input the slot has no value for from the new model's own default", () => {
    const sparse = slotOf(new Map<Quantity, number>([[q.tdb, 25]]));
    const { inputs } = rehearseSwitch(sparse, pmvPpdIso);
    for (const { quantity, value } of pmvPpdIso.inputs) {
      const held = enteredValue(inputs, quantity);
      expect(held, quantity.label).toBeDefined();
      if (quantity !== q.tdb) {
        expect(held, quantity.label).toBe(value);
      }
    }
    expect(enteredValue(inputs, q.tdb)).toBe(25);
  });

  it("converts an operative entry back to separate temperatures for a model without the group", () => {
    const operative = slotOf(new Map<Quantity, number>([[q.operative_tmp, 24]]), {
      temperature: { mode: temperatureMode.operative },
    });
    const { inputs } = rehearseSwitch(operative, heatIndexRothfusz);
    expect(inputs.temperature.mode).toBe(temperatureMode.separate);
    expect(enteredValue(inputs, q.tdb)).toBe(24);
  });

  it("keeps the operative entry for a model that takes both temperatures", () => {
    const operative = slotOf(new Map<Quantity, number>([[q.operative_tmp, 24]]), {
      temperature: { mode: temperatureMode.operative },
    });
    const { inputs } = rehearseSwitch(operative, pmvPpdIso);
    expect(inputs.temperature.mode).toBe(temperatureMode.operative);
  });

  it("reports nothing out of range when every value is acceptable", () => {
    expect(rehearseSwitch(pmvSlot(), pmvPpdIso).outOfRangeRows).toEqual([]);
  });

  it("reports the rows the new model's applicability rules out, with the entered value", () => {
    const hot = slotOf(new Map<Quantity, number>([[q.tdb, 15]]));
    const { outOfRangeRows } = rehearseSwitch(hot, heatIndexRothfusz);
    const row = outOfRangeRows.find((entry) => entry.quantity === q.tdb);
    expect(row, "Heat Index has a minimum dry-bulb temperature above 15 °C").toBeDefined();
    expect(row?.value).toBe(15);
  });
});

describe("adjustToBounds", () => {
  it("moves a value to the end of the bound it is beyond, and no further", () => {
    const slot = slotOf(new Map<Quantity, number>([[q.tdb, 15]]));
    const { inputs, outOfRangeRows } = rehearseSwitch(slot, heatIndexRothfusz);
    const adjusted = adjustToBounds(inputs, outOfRangeRows);
    const bound = outOfRangeRows.find((row) => row.quantity === q.tdb)?.bound;
    expect(bound?.min).toBeDefined();
    expect(enteredValue(adjusted, q.tdb)).toBe(bound?.min);
  });

  it("changes nothing when no row is listed", () => {
    const { inputs } = rehearseSwitch(pmvSlot(), pmvPpdIso);
    expect(adjustToBounds(inputs, [])).toEqual(inputs);
  });

  it("leaves a value inside its bound where it is", () => {
    const { inputs } = rehearseSwitch(pmvSlot(), pmvPpdIso);
    const inside = [{ quantity: q.tdb, value: 25, bound: { min: 10, max: 40 } }];
    expect(enteredValue(adjustToBounds(inputs, inside), q.tdb)).toBe(25);
  });

  it("moves a one-ended bound only towards the end it has", () => {
    const { inputs } = rehearseSwitch(pmvSlot(), pmvPpdIso);
    const oneEnded = [{ quantity: q.met, value: 0.5, bound: { min: 0.8 } }];
    expect(enteredValue(adjustToBounds(inputs, oneEnded), q.met)).toBe(0.8);
    const above = [{ quantity: q.met, value: 9, bound: { min: 0.8 } }];
    expect(enteredValue(adjustToBounds(inputs, above), q.met)).toBe(9);
  });

  it("adjusts the humidity entry through its own mode", () => {
    const { inputs } = rehearseSwitch(pmvSlot(), pmvPpdIso);
    const rows = [{ quantity: q.rh, value: 120, bound: { min: 0, max: 100 } }];
    const adjusted = adjustToBounds(inputs, rows);
    expect(adjusted.humidity.value).toBe(100);
    expect(adjusted.humidity.mode).toBe(humidityMode.rh);
  });
});