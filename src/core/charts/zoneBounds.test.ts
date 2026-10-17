/**
 * A Comfort zone is what the standard accepts (ADR-0002 decision 77, rule 1):
 * on the Standard page every chart's zones leave out each cell whose run breaks
 * a bound, any row of the result's `warnings`, while the cell keeps its number
 * on the hover grid and Explore's Bands paint over it. Each expectation is
 * checked against the library's own `warnings` on the cell's inputs; the
 * bounds the ticket names, ISO 7730's 30 °C and 2 700 Pa and PMV (ASHRAE 55)'s
 * 1.5 clo, are restated here as its acceptance states them.
 */
import { describe, expect, it } from "vitest";
import { hr_to_rh, psy_ta_rh } from "jsthermalcomfort";
import { bandListOf } from "$lib/core/bands";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import { optionsOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, resultWarnings, runOn } from "$lib/core/modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { startingSlot, withEnteredValues, withOption, type Slot } from "$lib/core/slot";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { ChartSpec, ContourFillTrace, HoverGridTrace } from "./chartSpec";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
import { dynamicSpec } from "./dynamicChart";
import { psychrometricSpec } from "./psychrometricChart";
import { readoutLine } from "./specParts";

const q = quantities;
const P = DEFAULT_ATMOSPHERIC_PRESSURE;
const [airSpeedControl] = optionsOf(pmvPpdAshrae);
const airSpeedAxes = { x: q.tdb, y: q.v };

/** PMV (ASHRAE 55)'s starting slot with `entered` over it, local control of the air speed as `control` says. */
function ashraeSlot(control: boolean, entered: Parameters<typeof enteredSlotFor>[1] = {}): Slot {
  return withOption(enteredSlotFor(pmvPpdAshrae, entered), airSpeedControl, control);
}

/**
 * The air-speed chart's slot of the ticket: 1.0 met and 0.61 clo, inside the
 * air-speed rule's scope, under operative entry, so the chart sweeps the
 * operative temperature with tr following it, as the deployed air-speed chart
 * and the audit's measurement do (`evidence/scripts-B/p1.mjs`).
 */
function inScope(control: boolean): Slot {
  return ashraeSlot(control, { operative_tmp: 25, met: 1.0, clo: 0.61 });
}

function fillsOf(spec: ChartSpec): ContourFillTrace[] {
  return spec.traces.filter((trace): trace is ContourFillTrace => trace.kind === "contourFill");
}

/** The one zone's fill of a chart of one PMV (ASHRAE 55) slot. */
function zoneOf(spec: ChartSpec): ContourFillTrace {
  const [fill, ...rest] = fillsOf(spec);
  if (!fill || rest.length > 0) {
    throw new Error("A chart of one PMV (ASHRAE 55) slot has one zone");
  }
  return fill;
}

function hoverGridOf(spec: ChartSpec): HoverGridTrace {
  const trace = spec.traces.find((entry): entry is HoverGridTrace => entry.kind === "hoverGrid");
  if (!trace) {
    throw new Error("spec has no hover grid");
  }
  return trace;
}

/** Whether `fill`'s region holds the cell at (`xIndex`, `yIndex`): its number lies inside the fill's interval. */
function holds(fill: ContourFillTrace, xIndex: number, yIndex: number): boolean {
  const value = fill.z[yIndex][xIndex];
  return value !== null && value <= fill.upper && (fill.lower === undefined || value >= fill.lower);
}

/** Every cell `fill`'s region holds, `[yIndex][xIndex]`. */
function regionOf(fill: ContourFillTrace): boolean[][] {
  return fill.z.map((row, yIndex) => row.map((_, xIndex) => holds(fill, xIndex, yIndex)));
}

function countOf(region: readonly (readonly boolean[])[]): number {
  return region.flat().filter(Boolean).length;
}

/** The index of `value` among `samples`, which must hold it. */
function indexOf(samples: readonly number[], value: number): number {
  const index = samples.findIndex((sample) => Math.abs(sample - value) < 1e-9);
  if (index === -1) {
    throw new Error(`${value} is not a sample`);
  }
  return index;
}

/** `model` run on `slot` with `entered` over it, as a scan's cell is entered. */
function runAt(model: RegisteredModel, slot: Slot, entered: ReadonlyMap<Quantity, number>) {
  return runOn(withEnteredValues(slot, entered), model, P);
}

/** Whether the run on `slot` with `entered` over it breaks a bound: its `warnings` has a row. */
function isOutsideApplicability(model: RegisteredModel, slot: Slot, entered: ReadonlyMap<Quantity, number>): boolean {
  return resultWarnings(model, runAt(model, slot, entered)).length > 0;
}

/** Whether the cell's own number lies inside `fill`'s zone, |number| within its limit, whatever its run breaks. */
function insideByNumber(fill: ContourFillTrace, value: number): boolean {
  return Math.abs(value) <= fill.upper;
}

describe("PMV (ASHRAE 55)'s air-speed chart", () => {
  const off = dynamicSpec(chartRequestFor(pmvPpdAshrae, inScope(false)), airSpeedAxes);
  const on = dynamicSpec(chartRequestFor(pmvPpdAshrae, inScope(true)), airSpeedAxes);
  const column = indexOf(zoneOf(off).x, 28);

  /** The highest row of the 28 °C column the zone holds. */
  function topAt28(fill: ContourFillTrace): number {
    const rows = fill.y.map((_, yIndex) => yIndex).filter((yIndex) => holds(fill, column, yIndex));
    expect(rows.length).toBeGreaterThan(0);
    return rows[rows.length - 1];
  }

  it("without local control stops at 28 °C within half a cell of where the library's own warnings first appear", () => {
    const fill = zoneOf(off);
    const top = topAt28(fill);
    const step = fill.y[1] - fill.y[0];
    const breaksAt = (v: number) => isOutsideApplicability(pmvPpdAshrae, inScope(false), new Map<Quantity, number>([[q.operative_tmp, 28], [q.v, v]]));
    // Bisect the air speed on the library's rows, the axis's two ends bracketing it.
    let [below, above] = [fill.y[0], fill.y[fill.y.length - 1]];
    expect(breaksAt(below)).toBe(false);
    expect(breaksAt(above)).toBe(true);
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const middle = (below + above) / 2;
      [below, above] = breaksAt(middle) ? [below, middle] : [middle, above];
    }
    // The edge lies between the last kept cell and the first left one.
    expect(Math.abs(fill.y[top] + step / 2 - above)).toBeLessThanOrEqual(step / 2);
    // Every cell above it is left out.
    for (let yIndex = top + 1; yIndex < fill.y.length; yIndex += 1) {
      expect(holds(fill, column, yIndex)).toBe(false);
    }
  });

  it("draws no zone between two cells it leaves out, so no sliver runs through the cut", () => {
    for (const fill of [zoneOf(off), ...fillsOf(psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso))))]) {
      const lower = fill.lower ?? Number.NEGATIVE_INFINITY;
      // The contour draws a cell's edge linearly between its two numbers.
      const crossesInto = (a: number | null, b: number | null) =>
        a !== null && b !== null && Math.min(a, b) <= fill.upper && Math.max(a, b) >= lower;
      fill.z.forEach((row, yIndex) =>
        row.forEach((value, xIndex) => {
          if (holds(fill, xIndex, yIndex)) {
            return;
          }
          if (xIndex + 1 < row.length && !holds(fill, xIndex + 1, yIndex)) {
            expect(crossesInto(value, row[xIndex + 1]), `${fill.label} row ${yIndex}, columns ${xIndex}–${xIndex + 1}`).toBe(false);
          }
          if (yIndex + 1 < fill.z.length && !holds(fill, xIndex, yIndex + 1)) {
            expect(crossesInto(value, fill.z[yIndex + 1][xIndex]), `${fill.label} column ${xIndex}, rows ${yIndex}–${yIndex + 1}`).toBe(false);
          }
        }),
      );
    }
  });

  it("with local control reaches the top at 28 °C, as before", () => {
    const fill = zoneOf(on);
    expect(topAt28(fill)).toBe(fill.y.length - 1);
  });

  it("is the same under both options outside the rule's scope, at 0.8 clo or at 1.4 met", () => {
    for (const entered of [{ operative_tmp: 25, met: 1.0, clo: 0.8 }, { operative_tmp: 25, met: 1.4, clo: 0.61 }]) {
      const [withoutControl, withControl] = [false, true].map((control) =>
        regionOf(zoneOf(dynamicSpec(chartRequestFor(pmvPpdAshrae, ashraeSlot(control, entered)), airSpeedAxes))),
      );
      expect(countOf(withoutControl)).toBeGreaterThan(0);
      expect(withoutControl).toEqual(withControl);
    }
  });

  it("under Compare cuts each slot by its own option, two slots differing only in it giving two zones", () => {
    const compared = fillsOf(dynamicSpec(chartRequestForSlots(pmvPpdAshrae, [inScope(false), inScope(true)]), airSpeedAxes));
    expect(compared).toHaveLength(2);
    const [first, second] = compared.map(regionOf);
    expect(first).toEqual(regionOf(zoneOf(off)));
    expect(second).toEqual(regionOf(zoneOf(on)));
    expect(first).not.toEqual(second);
  });

  it("still reads the slot's PMV on hover at a cell it leaves out", () => {
    const fill = zoneOf(off);
    const yIndex = indexOf(fill.y, 1.2);
    expect(holds(fill, column, yIndex)).toBe(false);
    expect(holds(zoneOf(on), column, yIndex)).toBe(true);
    const pmv = resultNumber(runAt(pmvPpdAshrae, inScope(false), new Map<Quantity, number>([[q.operative_tmp, 28], [q.v, 1.2]])), q.pmv);
    expect(hoverGridOf(off).hoverText[yIndex][column]).toContain(readoutLine(q.pmv, displayUnitFor(q.pmv, unitSystem.si), pmv));
  });

  it("is painted over by a Band list on Explore where the zone leaves a cell out", () => {
    const bands = bandListOf(pmvPpdAshrae.scan.classifier);
    const banded = dynamicSpec({ ...chartRequestFor(pmvPpdAshrae, inScope(false)), bands }, airSpeedAxes);
    const fill = zoneOf(off);
    const left = fill.y.map((_, yIndex) => yIndex).filter((yIndex) => !holds(fill, column, yIndex) && holds(zoneOf(on), column, yIndex));
    expect(left.length).toBeGreaterThan(0);
    for (const yIndex of left) {
      expect(fillsOf(banded).some((band) => holds(band, column, yIndex))).toBe(true);
    }
  });
});

describe("PMV (ASHRAE 55)'s clothing axis", () => {
  it("cuts the zone at the library's clothing bound", () => {
    const slot = ashraeSlot(false, { tdb: 20, tr: 20 });
    const fill = zoneOf(dynamicSpec(chartRequestFor(pmvPpdAshrae, slot), { x: q.tdb, y: q.clo }));
    let cut = 0;
    fill.y.forEach((clo, yIndex) => {
      fill.x.forEach((tdb, xIndex) => {
        const entered = new Map<Quantity, number>([[q.tdb, tdb], [q.clo, clo]]);
        const pmv = resultNumber(runAt(pmvPpdAshrae, slot, entered), q.pmv);
        const kept = insideByNumber(fill, pmv) && !isOutsideApplicability(pmvPpdAshrae, slot, entered);
        expect(holds(fill, xIndex, yIndex), `${tdb} °C, ${clo} clo`).toBe(kept);
        if (insideByNumber(fill, pmv) && !kept) {
          cut += 1;
          expect(clo).toBeGreaterThan(1.5);
        }
      });
    });
    // The cut matters: some cell past 1.5 clo is inside the limit by its number.
    expect(cut).toBeGreaterThan(0);
  });
});

/**
 * Each cell of `spec`'s first slot's psychrometric scan below saturation:
 * where it sits, its two values and its run's number and whether that run
 * breaks a bound. The cover hides the air above saturation, which this file
 * does not read.
 */
function psychrometricCells(model: RegisteredModel, slot: Slot, spec: ChartSpec) {
  const [fill] = fillsOf(spec);
  return fill.y.flatMap((hr, yIndex) =>
    fill.x.flatMap((tdb, xIndex) => {
      const rh = hr_to_rh(hr, tdb, P);
      if (rh > 100) {
        return [];
      }
      const entered = new Map<Quantity, number>([[q.tdb, tdb], [q.hr, hr]]);
      const pmv = resultNumber(runAt(model, slot, entered), q.pmv);
      return [{ xIndex, yIndex, tdb, pa: psy_ta_rh(tdb, rh, P).p_vap, pmv, outside: isOutsideApplicability(model, slot, entered) }];
    }),
  );
}

describe("PMV (ISO 7730)'s psychrometric zones", () => {
  it("leave out the cells above 30 °C and above 2 700 Pa of vapour pressure, and keep every other cell they had", () => {
    const slot = startingSlot(pmvPpdIso);
    const spec = psychrometricSpec(chartRequestFor(pmvPpdIso, slot));
    const cells = psychrometricCells(pmvPpdIso, slot, spec);
    const fills = fillsOf(spec);
    expect(fills.length).toBeGreaterThan(1);
    for (const fill of fills) {
      let cut = 0;
      for (const { xIndex, yIndex, tdb, pa, pmv } of cells) {
        const outsideIso = tdb > 30 || pa > 2700;
        expect(holds(fill, xIndex, yIndex), `${fill.label} at ${tdb} °C, ${pa} Pa`).toBe(insideByNumber(fill, pmv) && !outsideIso);
        if (insideByNumber(fill, pmv) && outsideIso) {
          cut += 1;
        }
      }
      // The outermost zones reach past the bounds by their numbers.
      if (fill === fills[0]) {
        expect(cut).toBeGreaterThan(0);
      }
    }
  });
});

describe("PMV (ASHRAE 55)'s psychrometric zone", () => {
  /** The zone's region of `slot`'s psychrometric chart. */
  function zoneRegionOf(slot: Slot): boolean[][] {
    return regionOf(zoneOf(psychrometricSpec(chartRequestFor(pmvPpdAshrae, slot))));
  }

  it("is the same under both options at its defaults", () => {
    const withoutControl = zoneRegionOf(ashraeSlot(false));
    expect(countOf(withoutControl)).toBeGreaterThan(0);
    expect(withoutControl).toEqual(zoneRegionOf(ashraeSlot(true)));
  });

  it("is empty at 0.9 m/s without local control, and with it is the zone its numbers give", () => {
    expect(countOf(zoneRegionOf(ashraeSlot(false, { v: 0.9 })))).toBe(0);

    const slot = ashraeSlot(true, { v: 0.9 });
    const spec = psychrometricSpec(chartRequestFor(pmvPpdAshrae, slot));
    const fill = zoneOf(spec);
    const cells = psychrometricCells(pmvPpdAshrae, slot, spec);
    expect(cells.some(({ outside }) => outside)).toBe(false);
    for (const { xIndex, yIndex, pmv } of cells) {
      expect(holds(fill, xIndex, yIndex)).toBe(insideByNumber(fill, pmv));
    }
    expect(countOf(regionOf(fill))).toBeGreaterThan(0);
  });
});
