/**
 * A committed value is always within its bounds (ADR-0002 decision 84, rules
 * 1 and 2): the session's commit of a slot's entry and of the atmospheric
 * pressure judges the value, then writes it, writes it cut to its bound's end,
 * or writes nothing, and says which; its verdict answers the same without
 * writing. Asserted at the seam the other session tests use, a session in and
 * its state out.
 */
import { describe, expect, it } from "vitest";
import { airSpeedMode, clothingMode, humidityMode } from "$lib/core/entryModes";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, kindBounds, quantities, type Quantity } from "$lib/core/quantities";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";
import { heldSlot, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;

/** PMV (ASHRAE 55)'s dry-bulb temperature bound, [°C]. */
const DRY_BULB_BOUND = { min: 10, max: 40 };

/** A humidity ratio at 25 °C, [kg/kg]: below saturation at 101 325 Pa (0.0201), above it at 110 000 Pa (0.0185). */
const NEAR_SATURATION = 0.019;

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

/**
 * An `entered` air speed or clothing insulation of `value`, held at
 * `startMet`, where the model is given it within its row, and the metabolic
 * rate `met` that takes it past that row: the relative air speed's, or the
 * dynamic clothing insulation's.
 */
interface PastTheRow {
  readonly model: RegisteredModel;
  readonly entered: Quantity;
  readonly value: number;
  readonly startMet: number;
  readonly met: number;
}

const pastTheRow: readonly PastTheRow[] = [
  // 1.5 m/s at 3 met is a relative air speed of 2.1 m/s, over ASHRAE 55's 2.
  { model: pmvPpdAshrae, entered: q.v, value: 1.5, startMet: 1.1, met: 3 },
  // 0.8 m/s at 2 met is 1.1 m/s relative, over ISO 7730's 1.
  { model: pmvPpdIso, entered: q.v, value: 0.8, startMet: 1.1, met: 2 },
  // 1.8 clo is given as 1.44 at 2 met and as itself at 1.1, over ASHRAE 55's 1.5.
  { model: pmvPpdAshrae, entered: q.clo, value: 1.8, startMet: 2, met: 1.1 },
  // 2.1 clo is given as about 1.74 at 2 met and 2.08 at 1.1, over ISO 7730's 2.
  { model: pmvPpdIso, entered: q.clo, value: 2.1, startMet: 2, met: 1.1 },
];

/** The row of `model`'s info that bounds what the model is given for an entered `entered`, and that quantity. */
function rowOf(model: RegisteredModel, entered: Quantity) {
  return entered === q.v
    ? { bounded: q.vr, bound: model.info.inputs.vr?.applicability }
    : { bounded: q.clo_dynamic, bound: model.info.inputs.clo?.applicability };
}

describe("an air speed or a clothing insulation, committed", () => {
  it.each(pastTheRow)(
    "on $model.info.label, a metabolic rate that takes a held $entered.label past the model's row commits, and the run has a violation on the entered row",
    ({ model, entered, value, startMet, met }) => {
      const session = new Session(model);
      const outputs = new Outputs(session);
      session.commitEntry(0, q.met, startMet);
      session.commitEntry(0, entered, value);

      expect(session.commitEntry(0, q.met, met)).toEqual({ kind: "legal" });

      expect(session.slots[0].values.get(q.met)).toBe(met);
      expect(session.slots[0].values.get(entered)).toBe(value);
      expect(outputs.slots[0].result).not.toBeNull();
      expect(outputs.slots[0].violations.find((row) => row.quantity === entered)).toMatchObject({ quantity: entered, ...rowOf(model, entered) });
    },
  );

  it.each([pmvPpdAshrae, pmvPpdIso])("on $info.label, far past the model's row, is written as it is, its bound its kind's alone", (model) => {
    const session = new Session(model);

    expect(session.commitEntry(0, q.v, 5)).toEqual({ kind: "legal" });
    expect(session.commitEntry(0, q.clo, 5)).toEqual({ kind: "legal" });

    expect(session.slots[0].values.get(q.v)).toBe(5);
    expect(session.slots[0].values.get(q.clo)).toBe(5);
  });

  it("below 0, is cut to 0", () => {
    const session = new Session(pmvPpdAshrae);

    expect(session.commitEntry(0, q.v, -0.2)).toEqual({ kind: "cut", value: 0, bound: { min: 0 } });
    expect(session.commitEntry(0, q.clo, -0.2)).toEqual({ kind: "cut", value: 0, bound: { min: 0 } });

    expect(session.slots[0].values.get(q.v)).toBe(0);
    expect(session.slots[0].values.get(q.clo)).toBe(0);
  });

  it("entered as the relative air speed or the dynamic clothing insulation past its row, is cut to the row's end", () => {
    const session = new Session(pmvPpdAshrae);
    session.setAirSpeedMode(airSpeedMode.corrected);
    session.setClothingMode(clothingMode.corrected);

    expect(session.commitEntry(0, q.vr, 2.5)).toEqual({ kind: "cut", value: 2, bound: { min: 0, max: 2 } });
    expect(session.commitEntry(0, q.clo_dynamic, 1.8)).toEqual({ kind: "cut", value: 1.5, bound: { min: 0, max: 1.5 } });

    expect(session.slots[0].values.get(q.vr)).toBe(2);
    expect(session.slots[0].values.get(q.clo_dynamic)).toBe(1.5);
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
    const session = dewPointSession();
    const before = shapeOf(session.slots[0]);

    expect(session.judgeEntry(0, q.tdb, 16)).toEqual({ kind: "legal" });
    expect(session.judgeEntry(0, q.tdb, 45)).toEqual({ kind: "cut", value: 40, bound: DRY_BULB_BOUND });
    expect(session.judgeEntry(0, q.tdb, 12).kind).toBe("refused");

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
