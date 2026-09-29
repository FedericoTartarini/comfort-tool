/**
 * The session's atmospheric pressure (ADR-0002 decision 49): one value for
 * every slot, held by the session in Pa and by no slot, which moves the result
 * only through a humidity-ratio entry. Asserted at the seam the other session
 * tests use — a session in, its state and its outputs out, with no component
 * and no router — and nothing flushes, for the reason
 * `compute.svelte.test.ts` gives.
 *
 * Expected values come from the library called with `p_atm`: a result at a
 * pressure is compared with the result of a relative-humidity entry of
 * `hr_to_rh(hr, tdb, p_atm)`, which no pressure moves.
 */
import { hr_to_rh, psy_ta_rh } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import { humidityMode } from "$lib/core/entryModes";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";
import { resultValueOf } from "./sessionTestReaders";

const q = quantities;

/** An atmospheric pressure other than the default, about 1 950 m above sea level. */
const LOWER_PRESSURE = 80000;

/** PMV (ISO 7730)'s starting dry-bulb temperature, [°C], which every slot here keeps. */
const TDB = 25;

/** The humidity ratio entered below, [kg/kg]: about 50 % at 25 °C and 101 325 Pa. */
const HUMIDITY_RATIO = 0.01;

/** PMV (ISO 7730) with one applicability row replaced, so a switch to it has a question to ask. */
function withBound(key: string, bound: { min?: number; max?: number }): RegisteredModel {
  return {
    ...pmvPpdIso,
    info: {
      ...pmvPpdIso.info,
      name: `fixture_bound_${key}`,
      inputs: { ...pmvPpdIso.info.inputs, [key]: { ...pmvPpdIso.info.inputs[key], applicability: bound } },
    },
  };
}

/** A session on PMV (ISO 7730) at `pressure`, its humidity entered as {@link HUMIDITY_RATIO}. */
function humidityRatioSession(pressure: number): { session: Session; outputs: Outputs } {
  const session = new Session(pmvPpdIso);
  session.atmosphericPressure = pressure;
  session.slots[0].setEntered(q.hr, HUMIDITY_RATIO);
  return { session, outputs: new Outputs(session) };
}

/** The PMV of a session on PMV (ISO 7730) whose relative humidity is entered as `rh`. */
function pmvAtRelativeHumidity(rh: number) {
  const session = new Session(pmvPpdIso);
  session.slots[0].setEntered(q.rh, rh);
  return resultValueOf(new Outputs(session).perSlot[0], q.pmv);
}

describe("the session's atmospheric pressure", () => {
  it("starts at core's default, and no slot holds a pressure", () => {
    const session = new Session(pmvPpdIso);
    expect(session.atmosphericPressure).toBe(DEFAULT_ATMOSPHERIC_PRESSURE);
    for (const slot of session.slots) {
      expect(slot.values.has(q.p_atm)).toBe(false);
    }
  });

  it("is kept by an address arrival, a switch that lands and a switch accepted after its question", () => {
    const session = new Session(pmvPpdIso);
    session.atmosphericPressure = LOWER_PRESSURE;

    session.setModel(adaptiveAshrae);
    expect(session.atmosphericPressure).toBe(LOWER_PRESSURE);

    session.requestModel(pmvPpdIso);
    expect(session.model).toBe(pmvPpdIso);
    expect(session.atmosphericPressure).toBe(LOWER_PRESSURE);

    // The slot's 25 °C is above this fixture's maximum, so the switch asks first.
    session.requestModel(withBound("tdb", { min: 10, max: 20 }));
    expect(session.pendingSwitch).not.toBeNull();
    session.acceptSwitch();
    expect(session.atmosphericPressure).toBe(LOWER_PRESSURE);
  });
});

describe("a change of atmospheric pressure", () => {
  it("under a humidity-ratio entry, moves the result to the library's relative humidity at it and leaves the entry", () => {
    const { session, outputs } = humidityRatioSession(DEFAULT_ATMOSPHERIC_PRESSURE);
    expect(resultValueOf(outputs.perSlot[0], q.pmv)).toBe(pmvAtRelativeHumidity(hr_to_rh(HUMIDITY_RATIO, TDB)));

    session.atmosphericPressure = LOWER_PRESSURE;

    expect(session.slots[0].humidity).toEqual({ mode: humidityMode.humidityRatio, value: HUMIDITY_RATIO });
    expect(resultValueOf(outputs.perSlot[0], q.pmv)).toBe(pmvAtRelativeHumidity(hr_to_rh(HUMIDITY_RATIO, TDB, LOWER_PRESSURE)));
    expect(resultValueOf(outputs.perSlot[0], q.pmv)).not.toBe(pmvAtRelativeHumidity(hr_to_rh(HUMIDITY_RATIO, TDB)));
  });

  it("under a relative-humidity entry, leaves the result", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const before = resultValueOf(outputs.perSlot[0], q.pmv);

    session.atmosphericPressure = LOWER_PRESSURE;

    expect(resultValueOf(outputs.perSlot[0], q.pmv)).toBe(before);
  });

  it("gates a humidity-ratio entry against relative humidity's bound converted at it", () => {
    // 0.022 kg/kg is above saturation at 25 °C and 101 325 Pa, and below it at 80 000 Pa.
    const { session, outputs } = humidityRatioSession(DEFAULT_ATMOSPHERIC_PRESSURE);
    session.slots[0].setEntered(q.hr, 0.022);
    expect(outputs.outOfRangeQuantities).toEqual([q.hr]);

    session.atmosphericPressure = LOWER_PRESSURE;

    expect(outputs.outOfRangeQuantities).toEqual([]);
    expect(resultValueOf(outputs.perSlot[0], q.pmv)).toBe(pmvAtRelativeHumidity(hr_to_rh(0.022, TDB, LOWER_PRESSURE)));
  });

  it("does not move a last valid result kept on screen, which was run at the pressure it remembers", () => {
    const { session, outputs } = humidityRatioSession(LOWER_PRESSURE);
    const kept = resultValueOf(outputs.perSlot[0], q.pmv);
    // PMV (ISO 7730) takes 0 to 2 clo, so 2.5 closes the gate.
    session.slots[0].setEntered(q.clo, 2.5);

    session.atmosphericPressure = DEFAULT_ATMOSPHERIC_PRESSURE;

    expect(outputs.outOfRangeQuantities).toEqual([q.clo]);
    expect(resultValueOf(outputs.perSlot[0], q.pmv)).toBe(kept);
  });
});

describe("a humidity entry and the session's atmospheric pressure", () => {
  it("re-expresses the entry at the session's pressure when the entry mode changes", () => {
    const session = new Session(pmvPpdIso);
    session.atmosphericPressure = LOWER_PRESSURE;

    session.slots[0].setHumidityMode(humidityMode.humidityRatio, session.atmosphericPressure);

    expect(session.slots[0].humidity?.value).toBe(psy_ta_rh(TDB, 50, LOWER_PRESSURE).hr);
  });

  it("asks a model switch about a humidity-ratio entry at the session's pressure", () => {
    const session = new Session(pmvPpdIso);
    session.atmosphericPressure = LOWER_PRESSURE;
    session.slots[0].setHumidityMode(humidityMode.humidityRatio, session.atmosphericPressure);

    // The slot's 50 % is above this fixture's maximum of 40 %.
    session.requestModel(withBound("rh", { max: 40 }));

    expect(session.pendingSwitch?.outOfRangeRows).toEqual([
      {
        quantity: q.hr,
        value: psy_ta_rh(TDB, 50, LOWER_PRESSURE).hr,
        bound: { min: psy_ta_rh(TDB, 0, LOWER_PRESSURE).hr, max: psy_ta_rh(TDB, 40, LOWER_PRESSURE).hr },
      },
    ]);
  });
});
