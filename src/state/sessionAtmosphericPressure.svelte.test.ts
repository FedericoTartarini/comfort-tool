/**
 * The session's atmospheric pressure (ADR-0002 decision 49): one value for
 * every slot, held by the session in Pa and by no slot, which moves the result
 * only through a humidity-ratio entry, and the psychrometric chart whatever
 * the entry. Asserted at the seam the other session tests use — a session in,
 * its state and its outputs out, with no component and no router — and
 * nothing flushes, for the reason `compute.svelte.test.ts` gives.
 *
 * Expected values come from the library called with `p_atm`: a result at a
 * pressure is compared with the result of a relative-humidity entry of
 * `hr_to_rh(hr, tdb, p_atm)`, which no pressure moves.
 */
import { hr_to_rh, psy_ta_rh } from "jsthermalcomfort";
import { describe, expect, it } from "vitest";
import type { ChartSpec, PathPiece, PathTrace, PointTrace } from "$lib/core/charts/chartSpec";
import { insideAtSamples, onlyPieceOf, zoneFillsOf } from "$lib/core/charts/chartTestPaths";
import { humidityMode } from "$lib/core/entryModes";
import { requireAxisRange, type RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, kindBounds, quantities } from "$lib/core/quantities";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, slotPositions } from "./session.svelte";
import { heldSlot, listedRowsOf, resultValueOf, sessionComparingThreeSlots, withBounds } from "./sessionTestReaders";

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
  return resultValueOf(new Outputs(session).slots[0].result, q.pmv);
}

describe("the session's atmospheric pressure", () => {
  it("starts at core's default, and no slot holds a pressure", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    expect(session.atmosphericPressure).toBe(DEFAULT_ATMOSPHERIC_PRESSURE);
    for (const position of slotPositions) {
      expect(heldSlot(session, position).values.has(q.p_atm)).toBe(false);
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
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBe(pmvAtRelativeHumidity(hr_to_rh(HUMIDITY_RATIO, TDB)));

    session.atmosphericPressure = LOWER_PRESSURE;

    expect(session.slots[0].humidity).toEqual({ mode: humidityMode.humidityRatio, value: HUMIDITY_RATIO });
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBe(pmvAtRelativeHumidity(hr_to_rh(HUMIDITY_RATIO, TDB, LOWER_PRESSURE)));
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).not.toBe(pmvAtRelativeHumidity(hr_to_rh(HUMIDITY_RATIO, TDB)));
  });

  it("under a relative-humidity entry, leaves the result", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    const before = resultValueOf(outputs.slots[0].result, q.pmv);

    session.atmosphericPressure = LOWER_PRESSURE;

    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBe(before);
  });

  it("gates a humidity-ratio entry against relative humidity's bound converted at it", () => {
    // 0.022 kg/kg is above saturation at 25 °C and 101 325 Pa, and below it at 80 000 Pa.
    const { session, outputs } = humidityRatioSession(DEFAULT_ATMOSPHERIC_PRESSURE);
    session.slots[0].setEntered(q.hr, 0.022);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.hr]);

    session.atmosphericPressure = LOWER_PRESSURE;

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBe(pmvAtRelativeHumidity(hr_to_rh(0.022, TDB, LOWER_PRESSURE)));
  });
});

/** A pressure below the bound's 30 000 Pa. */
const PRESSURE_OUT_OF_RANGE = 20000;

describe("an atmospheric pressure out of range", () => {
  it("written past the commit's judgement, is run, and the outputs say it is out of range", () => {
    const { session, outputs } = humidityRatioSession(LOWER_PRESSURE);
    const before = resultValueOf(outputs.slots[0].result, q.pmv);
    expect(outputs.atmosphericPressureOutOfRange).toBe(false);

    session.atmosphericPressure = PRESSURE_OUT_OF_RANGE;

    expect(outputs.atmosphericPressureOutOfRange).toBe(true);
    // Under a humidity-ratio entry a pressure moves the result, so a changed one was calculated again.
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).not.toBe(before);
  });

  it("is never named by the list of entries out of range", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);

    session.atmosphericPressure = PRESSURE_OUT_OF_RANGE;

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
    // PMV (ISO 7730) takes 0.8 to 4 met, so 4.5 is out of range beside it.
    session.slots[0].setEntered(q.met, 4.5);
    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.met]);
  });

  it("back in range, is calculated at the new pressure", () => {
    const { session, outputs } = humidityRatioSession(LOWER_PRESSURE);
    session.atmosphericPressure = PRESSURE_OUT_OF_RANGE;

    session.atmosphericPressure = DEFAULT_ATMOSPHERIC_PRESSURE;

    expect(outputs.atmosphericPressureOutOfRange).toBe(false);
    expect(resultValueOf(outputs.slots[0].result, q.pmv)).toBe(
      pmvAtRelativeHumidity(hr_to_rh(HUMIDITY_RATIO, TDB, DEFAULT_ATMOSPHERIC_PRESSURE)),
    );
  });

  it("is not asked about by a model switch, and is kept by it", () => {
    const session = new Session(pmvPpdIso);
    session.atmosphericPressure = PRESSURE_OUT_OF_RANGE;

    session.requestModel(adaptiveAshrae);
    expect(session.pendingSwitch).toBeNull();
    expect(session.model).toBe(adaptiveAshrae);
    expect(session.atmosphericPressure).toBe(PRESSURE_OUT_OF_RANGE);

    session.requestModel(pmvPpdIso);
    // The slot's 25 °C is above this fixture's maximum, so the switch asks, about that alone.
    session.requestModel(withBound("tdb", { min: 10, max: 20 }));
    expect(listedRowsOf(session)?.map((row) => row.quantity)).toEqual([q.tdb]);
    session.acceptSwitch();
    expect(session.atmosphericPressure).toBe(PRESSURE_OUT_OF_RANGE);
  });
});

/** A pressure above the bound's 110 000 Pa, where saturated air holds less water than at 101 325 Pa. */
const PRESSURE_ABOVE_RANGE = 120000;

/**
 * A humidity ratio at 25 °C, [kg/kg]: below saturation at 101 325 Pa
 * (0.0201), above it at 110 000 Pa (0.0185) and 120 000 Pa (0.0169).
 */
const NEAR_SATURATION = 0.019;

// No bound is taken at a pressure out of range (ADR-0002 decision 53).
describe("a humidity-ratio entry while the atmospheric pressure is out of range", () => {
  it("is not named out of range", () => {
    const { session, outputs } = humidityRatioSession(PRESSURE_ABOVE_RANGE);
    session.slots[0].setEntered(q.hr, NEAR_SATURATION);

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([]);
  });

  it("is not listed by a requested switch, and a yes leaves it as entered while it adjusts a temperature", () => {
    const { session } = humidityRatioSession(PRESSURE_ABOVE_RANGE);
    session.slots[0].setEntered(q.hr, NEAR_SATURATION);

    // The slot's 25 °C is above the fixture's maximum; its humidity ratio, about 95 % at 25 °C and 101 325 Pa, is above 40 %.
    session.requestModel(withBounds({ tdb: { min: 10, max: 20 }, rh: { max: 40 } }));
    expect(listedRowsOf(session)?.map((row) => row.quantity)).toEqual([q.tdb]);
    session.acceptSwitch();

    expect(session.slots[0].values.get(q.tdb)).toBe(20);
    expect(session.slots[0].humidity).toEqual({ mode: humidityMode.humidityRatio, value: NEAR_SATURATION });
  });

  it("is judged again at the pressure once it is back in range", () => {
    const { session, outputs } = humidityRatioSession(PRESSURE_ABOVE_RANGE);
    session.slots[0].setEntered(q.hr, NEAR_SATURATION);

    session.atmosphericPressure = HIGHEST_PRESSURE;

    expect(outputs.slots[0].outOfRangeQuantities).toEqual([q.hr]);
  });
});

describe("a humidity entry and the session's atmospheric pressure", () => {
  it("re-expresses the entry at the session's pressure when the entry mode changes", () => {
    const session = new Session(pmvPpdIso);
    session.atmosphericPressure = LOWER_PRESSURE;

    session.setHumidityMode(humidityMode.humidityRatio);

    expect(session.slots[0].humidity?.value).toBe(psy_ta_rh(TDB, 50, LOWER_PRESSURE).hr);
  });

  it("asks a model switch about a humidity-ratio entry at the session's pressure", () => {
    const session = new Session(pmvPpdIso);
    session.atmosphericPressure = LOWER_PRESSURE;
    session.setHumidityMode(humidityMode.humidityRatio);

    // The slot's 50 % is above this fixture's maximum of 40 %.
    session.requestModel(withBound("rh", { max: 40 }));

    expect(listedRowsOf(session)).toEqual([
      {
        quantity: q.hr,
        value: psy_ta_rh(TDB, 50, LOWER_PRESSURE).hr,
        bound: { min: psy_ta_rh(TDB, 0, LOWER_PRESSURE).hr, max: psy_ta_rh(TDB, 40, LOWER_PRESSURE).hr },
      },
    ]);
  });
});

/** Humidity ratio as the SI chart draws it, in g/kg. */
const hrUnit = displayUnitFor(q.hr, unitSystem.si);

/** The upper end of the humidity-ratio axis PMV (ISO 7730) declares, at the default pressure, [kg/kg]. */
const DECLARED_HR_MAX = requireAxisRange(pmvPpdIso, q.hr).max;

const pressureBound = kindBounds.atmosphericPressure;
if (pressureBound?.min === undefined || pressureBound.max === undefined) {
  throw new Error("Atmospheric pressure is no longer bounded at both ends");
}
/** The low end of the pressure's bound, where the humidity-ratio axis reaches furthest. */
const LOWEST_PRESSURE = pressureBound.min;
/** The high end of the pressure's bound, where the humidity-ratio axis ends lowest. */
const HIGHEST_PRESSURE = pressureBound.max;

/** The chart of a session on PMV (ISO 7730) at `pressure`, its slot as the model starts it. */
function chartAt(pressure: number, system: UnitSystem = unitSystem.si): ChartSpec | null {
  const session = new Session(pmvPpdIso);
  session.unitSystem = system;
  session.atmosphericPressure = pressure;
  return new Outputs(session).chart;
}

/** Where the humidity-ratio axis should end at `pressure`, in `unit`: the declared end times the default over it. */
function drawnHrMax(pressure: number, unit = hrUnit): number {
  return unit.fromSi((DECLARED_HR_MAX * DEFAULT_ATMOSPHERIC_PRESSURE) / pressure);
}

/** The relative-humidity isolines of a chart, each its one line with the relative humidity its label names. */
function isolinesOf(chart: ChartSpec | null): { rh: number; line: PathPiece }[] {
  return (chart?.traces ?? [])
    .filter((trace): trace is PathTrace => trace.kind === "path" && Boolean(trace.label?.startsWith(q.rh.label)))
    .map((trace) => ({ rh: Number.parseFloat(trace.label?.slice(q.rh.label.length) ?? ""), line: onlyPieceOf(trace) }));
}

/** The comfort zones' fills of a chart, traced from its scan, largest first. */
function zonesOf(chart: ChartSpec | null): PathTrace[] {
  return zoneFillsOf({ traces: chart?.traces ?? [] });
}

/** The slot's marker on a chart. */
function markerOf(chart: ChartSpec | null): PointTrace | undefined {
  return chart?.traces.find((trace): trace is PointTrace => trace.kind === "point");
}

describe("the psychrometric chart at the session's atmospheric pressure", () => {
  it("draws each relative-humidity isoline at the library's humidity ratio at that pressure", () => {
    const isolines = isolinesOf(chartAt(LOWER_PRESSURE));

    expect(isolines.map((isoline) => isoline.rh)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    for (const { rh, line } of isolines) {
      expect(line.y).toEqual(line.x.map((db) => hrUnit.fromSi(psy_ta_rh(db, rh, LOWER_PRESSURE).hr)));
      expect(line.y[0]).not.toBe(hrUnit.fromSi(psy_ta_rh(line.x[0], rh).hr));
    }
  });

  it("puts the marker at the entered humidity ratio, on the isoline of its relative humidity at that pressure", () => {
    const { outputs } = humidityRatioSession(LOWER_PRESSURE);
    const marker = markerOf(outputs.chart);

    expect(marker?.x).toBe(TDB);
    expect(marker?.y).toBeCloseTo(hrUnit.fromSi(HUMIDITY_RATIO), 9);
    const rh = hr_to_rh(HUMIDITY_RATIO, TDB, LOWER_PRESSURE);
    expect(marker?.y).toBe(hrUnit.fromSi(psy_ta_rh(TDB, rh, LOWER_PRESSURE).hr));
  });

  it("cuts each comfort zone from a scan at that pressure, over the taller axis", () => {
    const chart = chartAt(LOWER_PRESSURE);
    const zones = zonesOf(chart);
    const grid = chart?.traces.find((trace) => trace.kind === "hoverGrid");
    if (!grid) {
      throw new Error("the chart has no hover grid");
    }

    expect(zones).toHaveLength(4);
    expect(grid.y[grid.y.length - 1]).toBeCloseTo(drawnHrMax(LOWER_PRESSURE), 9);
    // Column 30 is the slot's own 25 °C; a grid point's number is the slot's at
    // the relative humidity its humidity ratio has at that pressure, and a zone
    // holds it where its magnitude is within the zone's limit.
    expect(grid.x[30]).toBeCloseTo(TDB, 9);
    const limits = [...pmvPpdIso.scan.comfortZones].map((zone) => zone.limit).sort((a, b) => b - a);
    zones.forEach((zone, position) => {
      const region = insideAtSamples(zone, grid.x, grid.y);
      for (const yIndex of [0, 10, 20]) {
        const rh = hr_to_rh(hrUnit.toSi(grid.y[yIndex]), TDB, LOWER_PRESSURE);
        expect(region[yIndex][30]).toBe(Math.abs(Number(pmvAtRelativeHumidity(rh))) < limits[position]);
      }
    });
    expect(zones.some((zone) => insideAtSamples(zone, grid.x, grid.y)[10][30])).toBe(true);
  });

  it("ends the humidity-ratio axis at the declared upper end times the default pressure over the pressure", () => {
    const rangeAt = (pressure: number, system?: UnitSystem) => chartAt(pressure, system)?.layout.y.range;

    expect(rangeAt(LOWEST_PRESSURE)).toEqual([0, drawnHrMax(LOWEST_PRESSURE)]);
    expect(rangeAt(LOWEST_PRESSURE)?.[1]).toBeCloseTo(101.3, 1);
    expect(rangeAt(DEFAULT_ATMOSPHERIC_PRESSURE)).toEqual([0, 30]);
    expect(rangeAt(HIGHEST_PRESSURE)?.[1]).toBeCloseTo(27.6, 1);
    expect(rangeAt(LOWEST_PRESSURE, unitSystem.ip)).toEqual([
      0,
      drawnHrMax(LOWEST_PRESSURE, displayUnitFor(q.hr, unitSystem.ip)),
    ]);
  });

  it("cuts each isoline where it leaves the axis as drawn, not as declared", () => {
    const highest = (chart: ChartSpec | null) => Math.max(...isolinesOf(chart).flatMap(({ line }) => line.y));

    const high = chartAt(HIGHEST_PRESSURE);
    expect(highest(high)).toBeLessThanOrEqual(drawnHrMax(HIGHEST_PRESSURE));
    const low = chartAt(LOWEST_PRESSURE);
    expect(highest(low)).toBeGreaterThan(hrUnit.fromSi(DECLARED_HR_MAX));
    expect(highest(low)).toBeLessThanOrEqual(drawnHrMax(LOWEST_PRESSURE));
  });

  it("keeps the default slot's marker on the chart at the lowest pressure", () => {
    const marker = markerOf(chartAt(LOWEST_PRESSURE));

    expect(marker?.y).toBe(hrUnit.fromSi(psy_ta_rh(TDB, 50, LOWEST_PRESSURE).hr));
    expect(marker?.y).toBeGreaterThan(hrUnit.fromSi(DECLARED_HR_MAX));
    expect(marker?.y).toBeLessThanOrEqual(drawnHrMax(LOWEST_PRESSURE));
  });
});
