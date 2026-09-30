/**
 * The model-switch question, split out of `session.svelte.test.ts` when that
 * file passed ADR §6's line band: the bound fixtures, and every case that turns
 * on a value the new model does not accept. What a landing does to the slot
 * stays in the sibling file.
 *
 * The seam is that file's, and nothing flushes for the reason
 * `compute.svelte.test.ts` gives: the outputs are a derivation, so reading one
 * after a change is what recomputes it. The models here are fixtures, not
 * registry entries: each spreads PMV (ISO 7730)'s declaration and overrides
 * the one thing it is about.
 */
import { clo_dynamic_iso, psy_ta_rh } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { formatBound, outOfRangeRows } from "$lib/core/applicability";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import { formatNumber } from "$lib/core/numberFormat";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";
import { listedRowsOf, resultValueOf, shapeOf, withBounds } from "./sessionTestReaders";

const q = quantities;

// The slot starts at tdb 25, which each of these puts outside the new model's
// applicability — from above, from below, and by a bound with one end only.
const belowTheSlot = withBounds({ tdb: { min: 10, max: 20 } });
const aboveTheSlot = withBounds({ tdb: { min: 28, max: 40 } });
// clo starts at 0.5, so a minimum of 1 is the one-sided bound, of the dynamic
// clothing insulation the model is given; met's maximum is removed, so a met
// of 6 breaks nothing under it.
const oneSidedBounds = withBounds({ clo: { min: 1 }, met: { min: 0.8 } });
// The slot starts at 50 % relative humidity, which a maximum of 40 rules out.
const drierThanTheSlot = withBounds({ rh: { max: 40 } });
// The slot as it stands satisfies this one, so the switch has nothing to ask.
const acceptsTheSlot = withBounds({ tdb: { min: 10, max: 40 } });

/**
 * What requesting a model does when a value the person entered is outside its
 * Applicability (ADR-0002 decision 32, "The session owns the question"): the
 * request changes nothing and leaves the question pending, and the person's
 * answer lands it or drops it. Asserted at the same seam as the rest — a
 * session in, its state and its outputs out — because the dialog renders the
 * pending switch and decides nothing.
 */
describe("Session.requestModel, when the new model does not accept a value", () => {
  it("leaves the model and the slot as they were and holds the question", () => {
    const session = new Session(pmvPpdIso);
    const before = shapeOf(session.slots[0]);

    session.requestModel(belowTheSlot);

    expect(session.model).toBe(pmvPpdIso);
    expect(shapeOf(session.slots[0])).toEqual(before);
    expect(session.pendingSwitch?.model).toBe(belowTheSlot);
  });

  it("lists exactly what the gate reports for the rehearsed slot, with the entered value and the bound", () => {
    const session = new Session(pmvPpdIso);

    session.requestModel(belowTheSlot);

    expect(listedRowsOf(session)).toEqual([{ quantity: q.tdb, value: 25, bound: { min: 10, max: 20 } }]);
    expect(listedRowsOf(session)).toEqual(outOfRangeRows(session.slots[0], belowTheSlot, DEFAULT_ATMOSPHERIC_PRESSURE));
  });

  it("lists the operative temperature against the range both temperatures allow at once", () => {
    const session = new Session(pmvPpdIso);
    session.setTemperatureMode(temperatureMode.operative);
    const operative = session.slots[0].values.get(q.operative_tmp);

    // tdb is 10–20 here and tr is the registered 10–40, so the row is 10–20.
    session.requestModel(belowTheSlot);

    expect(listedRowsOf(session)).toEqual([
      { quantity: q.operative_tmp, value: operative, bound: { min: 10, max: 20 } },
    ]);
  });

  it("gives a one-ended row for a bound with one end, and adjusts only towards it", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setEntered(q.met, 6);

    session.requestModel(oneSidedBounds);

    // The bound converted into the clothing insulation entered: at 6 met and 0.1 m/s ISO 7730's rule gives 1.66 clo as 1.
    const [row] = listedRowsOf(session) ?? [];
    expect(listedRowsOf(session)).toEqual([{ quantity: q.clo, value: 0.5, bound: { min: row.bound.min } }]);
    expect(row.bound.min).toBeCloseTo(1.66, 2);
    expect(clo_dynamic_iso(row.bound.min ?? Number.NaN, 6, 0.1)).toBeCloseTo(1, 2);
    expect(clo_dynamic_iso(row.bound.min ?? Number.NaN, 6, 0.1)).toBeGreaterThanOrEqual(1);

    session.acceptSwitch();

    expect(session.slots[0].values.get(q.clo)).toBe(row.bound.min);
    expect(session.slots[0].values.get(q.met)).toBe(6);
  });

  it("moves each listed value to the end of its bound it was beyond, and nothing else", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.slots[0].setEntered(q.v, 0.2);
    session.slots[0].setEntered(q.rh, 35);

    session.requestModel(aboveTheSlot);
    session.acceptSwitch();

    expect(session.model).toBe(aboveTheSlot);
    expect(session.pendingSwitch).toBeNull();
    expect(session.slots[0].values.get(q.tdb)).toBe(28);
    expect(session.slots[0].values.get(q.tr)).toBe(25);
    expect(session.slots[0].values.get(q.v)).toBe(0.2);
    expect(session.slots[0].humidity?.value).toBe(35);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBeTypeOf("number");
  });

  it("leaves, on a yes in IP, the same ends held, each read in its box as the range beside it reads", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.unitSystem = unitSystem.ip;
    session.setHumidityMode(humidityMode.humidityRatio);
    session.slots[0].setEntered(q.hr, 0.017);

    session.requestModel(belowTheSlot);
    const rows = listedRowsOf(session) ?? [];
    session.acceptSwitch();

    // 20 °C is 68 °F; saturated air at 20 °C holds 14.7 g/kg, 14.7 lb/klb.
    const boxOf = (quantity: Quantity, value: number | undefined) => formatNumber(displayUnitFor(quantity, unitSystem.ip).fromSi(value ?? Number.NaN));
    expect(rows.map((row) => row.quantity)).toEqual([q.tdb, q.hr]);
    expect(session.slots[0].values.get(q.tdb)).toBe(20);
    expect(session.slots[0].humidity?.value).toBe(psy_ta_rh(20, 100).hr);
    expect(boxOf(q.tdb, session.slots[0].values.get(q.tdb))).toBe("68");
    expect(formatBound(rows[0].bound, q.tdb, unitSystem.ip)).toBe("50 – 68");
    expect(formatBound(rows[1].bound, q.hr, unitSystem.ip)).toBe(`0 – ${boxOf(q.hr, session.slots[0].humidity?.value)}`);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(outputs.slots[0].violations).toEqual([]);
  });

  it("lists a humidity entry the new model's relative-humidity bound rules out, in the entry's own unit, and moves it to the converted end", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setHumidityMode(humidityMode.humidityRatio);
    const entered = session.slots[0].humidity?.value;
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);

    session.requestModel(drierThanTheSlot);

    expect(listedRowsOf(session)).toEqual([
      { quantity: q.hr, value: entered, bound: { min: psy_ta_rh(25, 0).hr, max: psy_ta_rh(25, 40).hr } },
    ]);

    session.acceptSwitch();

    expect(session.slots[0].humidity).toEqual({ mode: humidityMode.humidityRatio, value: psy_ta_rh(25, 40).hr });
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
  });

  it("checks the humidity entry at the temperature the switch would leave, and lists it when that rules it out", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.setHumidityMode(humidityMode.humidityRatio);
    // About 85 % at the slot's 25 °C, but above saturation at the 20 °C "Yes" moves tdb to.
    session.slots[0].setEntered(q.hr, 0.017);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);

    session.requestModel(belowTheSlot);

    expect(listedRowsOf(session)).toEqual([
      { quantity: q.tdb, value: 25, bound: { min: 10, max: 20 } },
      { quantity: q.hr, value: 0.017, bound: { min: psy_ta_rh(20, 0).hr, max: psy_ta_rh(20, 100).hr } },
    ]);

    session.acceptSwitch();

    expect(session.slots[0].values.get(q.tdb)).toBe(20);
    expect(session.slots[0].humidity).toEqual({ mode: humidityMode.humidityRatio, value: psy_ta_rh(20, 100).hr });
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
  });

  it("leaves everything as it was on a decline", () => {
    const session = new Session(pmvPpdIso);
    session.setHumidityMode(humidityMode.dewPoint);
    session.setTemperatureMode(temperatureMode.operative);
    const before = shapeOf(session.slots[0]);

    session.requestModel(belowTheSlot);
    session.declineSwitch();

    expect(session.model).toBe(pmvPpdIso);
    expect(session.pendingSwitch).toBeNull();
    expect(shapeOf(session.slots[0])).toEqual(before);
  });

  it("leaves the outputs the current model's while the question is pending", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const before = outputs.slots[0].result;

    session.requestModel(belowTheSlot);

    expect(outputs.slots[0].result).toBe(before);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
  });

  it("replaces a pending question with the next one asked", () => {
    const session = new Session(pmvPpdIso);

    session.requestModel(belowTheSlot);
    session.requestModel(aboveTheSlot);

    expect(session.pendingSwitch?.model).toBe(aboveTheSlot);
    expect(listedRowsOf(session)).toEqual([{ quantity: q.tdb, value: 25, bound: { min: 28, max: 40 } }]);
  });

  it("drops a pending question when the model asked for is the current one", () => {
    const session = new Session(pmvPpdIso);
    const before = shapeOf(session.slots[0]);

    session.requestModel(belowTheSlot);
    session.requestModel(pmvPpdIso);

    expect(session.pendingSwitch).toBeNull();
    expect(session.model).toBe(pmvPpdIso);
    expect(shapeOf(session.slots[0])).toEqual(before);
  });

  it("asks nothing, and lands, when every entered value is acceptable", () => {
    const session = new Session(pmvPpdIso);

    session.requestModel(acceptsTheSlot);

    expect(session.pendingSwitch).toBeNull();
    expect(session.model).toBe(acceptsTheSlot);
  });

  it("never asks on the address's path: setting adjusts nothing and holds no question", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);

    session.setModel(belowTheSlot);

    expect(session.model).toBe(belowTheSlot);
    expect(session.pendingSwitch).toBeNull();
    expect(session.slots[0].values.get(q.tdb)).toBe(25);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.tdb]);
  });

});
