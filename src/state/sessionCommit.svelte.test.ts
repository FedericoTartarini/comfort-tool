/**
 * A committed value is always within its bounds (ADR-0002 decision 84, rules
 * 1 and 2): the session's commit of a slot's entry and of the atmospheric
 * pressure judges the value, then writes it, writes it cut to its bound's end,
 * or writes nothing, and says which; its verdict answers the same without
 * writing. Asserted at the seam the other session tests use, a session in and
 * its state out.
 */
import { describe, expect, it } from "vitest";
import { humidityMode } from "$lib/core/entryModes";
import { DEFAULT_ATMOSPHERIC_PRESSURE, kindBounds, quantities } from "$lib/core/quantities";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { Session } from "./session.svelte";
import { heldSlot, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;

/** PMV (ASHRAE 55)'s dry-bulb temperature bound, [°C]. */
const DRY_BULB_BOUND = { min: 10, max: 40 };

/**
 * An air speed PMV (ASHRAE 55) takes at its starting 1.1 met and not at
 * 3 met, [m/s]: the info's 2 m/s of relative air speed converted into the
 * entry is about 1.97 m/s at 1.1 met and 1.4 m/s at 3 met.
 */
const FAST_AIR = 1.5;

/** A humidity ratio at 25 °C, [kg/kg]: below saturation at 101 325 Pa (0.0201), above it at 110 000 Pa (0.0185). */
const NEAR_SATURATION = 0.019;

/** A session on PMV (ASHRAE 55) whose air speed is {@link FAST_AIR}. */
function fastAirSession(): Session {
  const session = new Session(pmvPpdAshrae);
  session.commitEntry(0, q.v, FAST_AIR);
  return session;
}

/** A session on PMV (ASHRAE 55) whose humidity is entered as a dew point of 15 °C, under its dry bulb of 25 °C. */
function dewPointSession(): Session {
  const session = new Session(pmvPpdAshrae);
  session.setHumidityMode(humidityMode.dewPoint);
  session.commitEntry(0, q.dew_point_tmp, 15);
  return session;
}

/** A session on PMV (ASHRAE 55) comparing three slots, the second's humidity entered as {@link NEAR_SATURATION}. */
function nearSaturationInSecondSlot(): Session {
  const session = sessionComparingThreeSlots(pmvPpdAshrae);
  session.setHumidityMode(humidityMode.humidityRatio);
  session.commitEntry(1, q.hr, NEAR_SATURATION);
  return session;
}

describe("a slot's entry, committed", () => {
  it("within its bound and every other's, is written as it is", () => {
    const session = new Session(pmvPpdAshrae);

    expect(session.commitEntry(0, q.tdb, 16)).toEqual({ kind: "legal" });

    expect(session.slots[0].values.get(q.tdb)).toBe(16);
  });

  it("past its bound, is cut to the bound's end and reported as cut", () => {
    const session = new Session(pmvPpdAshrae);

    expect(session.commitEntry(0, q.tdb, 45)).toEqual({ kind: "cut", value: 40, bound: DRY_BULB_BOUND });
    expect(session.slots[0].values.get(q.tdb)).toBe(40);

    expect(session.commitEntry(0, q.tdb, 5)).toEqual({ kind: "cut", value: 10, bound: DRY_BULB_BOUND });
    expect(session.slots[0].values.get(q.tdb)).toBe(10);
  });

  it("on PMV (ASHRAE 55), a metabolic rate that would put the held air speed out of its bound is refused, writes nothing and reports the air-speed row", () => {
    const session = fastAirSession();
    const before = shapeOf(session.slots[0]);

    const verdict = session.commitEntry(0, q.met, 3);

    expect(verdict.kind).toBe("refused");
    expect(verdict.kind === "refused" && verdict.rows.map((row) => [row.quantity, row.value])).toEqual([[q.v, FAST_AIR]]);
    expect(shapeOf(session.slots[0])).toEqual(before);
  });

  it("a dry-bulb temperature below a held dew point is refused, naming the dew point", () => {
    const session = dewPointSession();
    const before = shapeOf(session.slots[0]);

    const verdict = session.commitEntry(0, q.tdb, 12);

    expect(verdict.kind === "refused" && verdict.rows.map((row) => row.quantity)).toEqual([q.dew_point_tmp]);
    expect(shapeOf(session.slots[0])).toEqual(before);
  });

  it("past its bound, at an end that would put another value out of range, is refused", () => {
    // The dry bulb's lower end, 10 °C, is under the held dew point of 15 °C.
    const session = dewPointSession();

    const verdict = session.commitEntry(0, q.tdb, 5);

    expect(verdict.kind === "refused" && verdict.rows.map((row) => row.quantity)).toEqual([q.dew_point_tmp]);
    expect(session.slots[0].values.get(q.tdb)).toBe(25);
  });

  it("is written to its own slot alone", () => {
    const session = sessionComparingThreeSlots(pmvPpdAshrae);

    session.commitEntry(2, q.tdb, 45);

    expect(heldSlot(session, 2).values.get(q.tdb)).toBe(40);
    expect(session.slots[0].values.get(q.tdb)).toBe(25);
    expect(heldSlot(session, 1).values.get(q.tdb)).toBe(25);
  });
});

describe("the atmospheric pressure, committed", () => {
  it("within its bound and every held humidity entry's, is written as it is", () => {
    const session = new Session(pmvPpdAshrae);

    expect(session.commitAtmosphericPressure(80000)).toEqual({ kind: "legal" });

    expect(session.atmosphericPressure).toBe(80000);
  });

  it("past its kind's bound, is cut to the bound's end and reported as cut", () => {
    const session = new Session(pmvPpdAshrae);

    expect(session.commitAtmosphericPressure(20000)).toEqual({
      kind: "cut",
      value: 30000,
      bound: kindBounds[q.p_atm.kind],
    });
    expect(session.atmosphericPressure).toBe(30000);
  });

  it("that would put a held humidity-ratio entry out of range is refused, naming its slot", () => {
    const session = nearSaturationInSecondSlot();

    const verdict = session.commitAtmosphericPressure(110000);

    expect(verdict.kind === "refused" && verdict.rows.map((row) => [row.position, row.quantity, row.value])).toEqual([
      [1, q.hr, NEAR_SATURATION],
    ]);
    expect(session.atmosphericPressure).toBe(DEFAULT_ATMOSPHERIC_PRESSURE);
  });

  it("judges a held slot that is not compared", () => {
    const session = nearSaturationInSecondSlot();
    session.setCompare(false);

    expect(session.commitAtmosphericPressure(110000).kind).toBe("refused");
  });
});

describe("the verdict for a candidate", () => {
  it("answers each of the three cases for a slot's entry, writing nothing", () => {
    const session = fastAirSession();
    const before = shapeOf(session.slots[0]);

    expect(session.judgeEntry(0, q.tdb, 16)).toEqual({ kind: "legal" });
    expect(session.judgeEntry(0, q.tdb, 45)).toEqual({ kind: "cut", value: 40, bound: DRY_BULB_BOUND });
    expect(session.judgeEntry(0, q.met, 3).kind).toBe("refused");

    expect(shapeOf(session.slots[0])).toEqual(before);
  });

  it("answers each of the three cases for the atmospheric pressure, writing nothing", () => {
    const session = nearSaturationInSecondSlot();

    expect(session.judgeAtmosphericPressure(90000)).toEqual({ kind: "legal" });
    expect(session.judgeAtmosphericPressure(20000).kind).toBe("cut");
    expect(session.judgeAtmosphericPressure(110000).kind).toBe("refused");

    expect(session.atmosphericPressure).toBe(DEFAULT_ATMOSPHERIC_PRESSURE);
  });
});
