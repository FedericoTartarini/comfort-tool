/**
 * A Comfort zone is what the standard accepts (ADR-0002 decisions 77 and 78):
 * on the Standard page every chart's zones leave out wherever a run breaks a
 * bound, any row of the result's `warnings`, while the cell keeps its number
 * on the hover grid and Explore's Bands paint over it, and a zone's boundary
 * lies on the bound to one bisection step. Each expectation is checked
 * against the library's own `warnings` on the inputs, and every region is
 * read off the drawn fill; the bounds the ticket names, ISO 7730's 30 °C and
 * 2 700 Pa and PMV (ASHRAE 55)'s 1.5 clo, are restated here as its acceptance
 * states them.
 */
import { describe, expect, it } from "vitest";
import { hr_to_rh, psy_ta_rh } from "jsthermalcomfort";
import { bandListOf } from "$lib/core/bands";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import { optionsOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, resultWarnings, runOn } from "$lib/core/modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "$lib/core/quantities";
import { startingSlot, withEnteredValues, withEntryModes, withOption, type Slot } from "$lib/core/slot";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { ChartSpec, ContourFillTrace, HoverGridTrace, PathTrace } from "./chartSpec";
import { isInsideFill, regionOf, zoneFillsOf, zoneLinesOf } from "./chartTestPaths";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
import { dynamicScanFrameFor, dynamicSpec } from "./dynamicChart";
import { psychrometricScanFrameFor, psychrometricSpec } from "./psychrometricChart";
import { BISECTIONS, comfortZonesOf, type ScanFrame } from "./scan";
import { readoutLine } from "./specParts";

const q = quantities;
const P = DEFAULT_ATMOSPHERIC_PRESSURE;
const [airSpeedControl] = optionsOf(pmvPpdAshrae);
const airSpeedAxes = { x: q.tdb, y: q.v };
/** One bisection step, as a fraction of a cell: the last half the scan's bisection keeps (ADR-0002 decision 78). */
const BISECTION_STEP = 2 ** -BISECTIONS;

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

/** The one zone's fill of a chart of one PMV (ASHRAE 55) slot. */
function zoneOf(spec: ChartSpec): PathTrace {
  const [fill, ...rest] = zoneFillsOf(spec);
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

/** The grid points `spec`'s scan ran, the hover grid's, in SI here: every chart below is drawn in SI. */
function samplesOf(spec: ChartSpec): { readonly x: readonly number[]; readonly y: readonly number[] } {
  const { x, y } = hoverGridOf(spec);
  return { x, y };
}

/** Whether a Band's contour fill holds the cell at (`xIndex`, `yIndex`): its number lies inside the band's interval. */
function bandHolds(band: ContourFillTrace, xIndex: number, yIndex: number): boolean {
  const value = band.z[yIndex][xIndex];
  return value !== null && value <= band.upper && (band.lower === undefined || value >= band.lower);
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

/** The limit of the zone drawn `position`-th among one slot's zones, largest first, as the chart draws them. */
function limitOf(model: RegisteredModel, position: number): number {
  return comfortZonesOf(model)[position].limit;
}

describe("PMV (ASHRAE 55)'s air-speed chart", () => {
  const off = dynamicSpec(chartRequestFor(pmvPpdAshrae, inScope(false)), airSpeedAxes);
  const on = dynamicSpec(chartRequestFor(pmvPpdAshrae, inScope(true)), airSpeedAxes);
  const { x: temperatures, y: speeds } = samplesOf(off);
  const column = indexOf(temperatures, 28);

  it("without local control stops at 28 °C where the library's own warnings first appear, to one bisection step", () => {
    const fill = zoneOf(off);
    const step = speeds[1] - speeds[0];
    const breaksAt = (v: number) => isOutsideApplicability(pmvPpdAshrae, inScope(false), new Map<Quantity, number>([[q.operative_tmp, 28], [q.v, v]]));
    // Bisect the air speed on the library's rows, the axis's two ends bracketing it.
    let [below, above] = [speeds[0], speeds[speeds.length - 1]];
    expect(breaksAt(below)).toBe(false);
    expect(breaksAt(above)).toBe(true);
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const middle = (below + above) / 2;
      [below, above] = breaksAt(middle) ? [below, middle] : [middle, above];
    }
    // The zone's top vertex on the 28 °C grid line lies on the bound.
    const top = Math.max(...fill.pieces.flatMap((ring) => ring.y.filter((_, index) => ring.x[index] === 28)));
    expect(Math.abs(top - above)).toBeLessThanOrEqual(BISECTION_STEP * step);
    // Every grid point above it is left out.
    const region = regionOf(off, fill);
    speeds.forEach((v, yIndex) => {
      if (v > above) {
        expect(region[yIndex][column]).toBe(false);
      }
    });
  });

  it("strokes the cap where the rule ends the zone, and nothing along the plot's frame", () => {
    const [line] = zoneLinesOf(off);
    const vertices = line.pieces.flatMap((piece) => piece.x.map((x, index) => ({ x, y: piece.y[index] })));
    const top = Math.max(...zoneOf(off).pieces.flatMap((ring) => ring.y.filter((_, index) => ring.x[index] === 28)));
    expect(vertices).toContainEqual({ x: 28, y: top });
    const frame = { x: [temperatures[0], temperatures[temperatures.length - 1]], y: [speeds[0], speeds[speeds.length - 1]] };
    for (const piece of line.pieces) {
      piece.x.slice(1).forEach((x, index) => {
        const [startX, startY, endY] = [piece.x[index], piece.y[index], piece.y[index + 1]];
        const alongFrame = (startX === x && frame.x.includes(x)) || (startY === endY && frame.y.includes(endY));
        expect(alongFrame, `the run from (${startX}, ${startY}) to (${x}, ${endY})`).toBe(false);
      });
    }
    // The zone does reach the frame, at no air speed, so a stroke along it would show.
    expect(regionOf(off, zoneOf(off))[0].some(Boolean)).toBe(true);
  });

  it("draws no zone between two grid points it leaves out, so no sliver runs through the cut", () => {
    const iso = psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)));
    for (const [spec, fill] of [[off, zoneOf(off)], ...zoneFillsOf(iso).map((zone) => [iso, zone] as const)] as const) {
      const { x, y } = samplesOf(spec);
      const region = regionOf(spec, fill);
      region.forEach((row, yIndex) =>
        row.forEach((held, xIndex) => {
          if (held) {
            return;
          }
          if (xIndex + 1 < row.length && !row[xIndex + 1]) {
            const middle = (x[xIndex] + x[xIndex + 1]) / 2;
            expect(isInsideFill(fill, middle, y[yIndex]), `${fill.label} row ${yIndex}, columns ${xIndex}–${xIndex + 1}`).toBe(false);
          }
          if (yIndex + 1 < region.length && !region[yIndex + 1][xIndex]) {
            const middle = (y[yIndex] + y[yIndex + 1]) / 2;
            expect(isInsideFill(fill, x[xIndex], middle), `${fill.label} column ${xIndex}, rows ${yIndex}–${yIndex + 1}`).toBe(false);
          }
        }),
      );
    }
  });

  it("with local control reaches the top at 28 °C, as before", () => {
    expect(regionOf(on, zoneOf(on))[speeds.length - 1][column]).toBe(true);
  });

  it("is the same under both options outside the rule's scope, at 0.8 clo or at 1.4 met", () => {
    for (const entered of [{ operative_tmp: 25, met: 1.0, clo: 0.8 }, { operative_tmp: 25, met: 1.4, clo: 0.61 }]) {
      const [withoutControl, withControl] = [false, true].map((control) =>
        zoneOf(dynamicSpec(chartRequestFor(pmvPpdAshrae, ashraeSlot(control, entered)), airSpeedAxes)),
      );
      expect(withoutControl.pieces.length).toBeGreaterThan(0);
      expect(withoutControl.pieces).toEqual(withControl.pieces);
    }
  });

  it("under Compare cuts each slot by its own option, two slots differing only in it giving two zones", () => {
    const compared = zoneFillsOf(dynamicSpec(chartRequestForSlots(pmvPpdAshrae, [inScope(false), inScope(true)]), airSpeedAxes));
    expect(compared).toHaveLength(2);
    const [first, second] = compared.map((fill) => fill.pieces);
    expect(first).toEqual(zoneOf(off).pieces);
    expect(second).toEqual(zoneOf(on).pieces);
    expect(first).not.toEqual(second);
  });

  it("still reads the slot's PMV on hover at a grid point it leaves out", () => {
    const yIndex = indexOf(speeds, 1.2);
    expect(regionOf(off, zoneOf(off))[yIndex][column]).toBe(false);
    expect(regionOf(on, zoneOf(on))[yIndex][column]).toBe(true);
    const pmv = resultNumber(runAt(pmvPpdAshrae, inScope(false), new Map<Quantity, number>([[q.operative_tmp, 28], [q.v, 1.2]])), q.pmv);
    expect(hoverGridOf(off).hoverText[yIndex][column]).toContain(readoutLine(q.pmv, displayUnitFor(q.pmv, unitSystem.si), pmv));
  });

  it("is painted over by a Band list on Explore where the zone leaves a grid point out", () => {
    const bands = bandListOf(pmvPpdAshrae.scan.classifier);
    const banded = dynamicSpec({ ...chartRequestFor(pmvPpdAshrae, inScope(false)), bands }, airSpeedAxes);
    const [without, within] = [regionOf(off, zoneOf(off)), regionOf(on, zoneOf(on))];
    const left = speeds.map((_, yIndex) => yIndex).filter((yIndex) => !without[yIndex][column] && within[yIndex][column]);
    expect(left.length).toBeGreaterThan(0);
    const bandFills = banded.traces.filter((trace): trace is ContourFillTrace => trace.kind === "contourFill");
    for (const yIndex of left) {
      expect(bandFills.some((band) => bandHolds(band, column, yIndex))).toBe(true);
    }
  });
});

describe("PMV (ASHRAE 55)'s clothing axis", () => {
  it("cuts the zone at the library's clothing bound", () => {
    const slot = ashraeSlot(false, { tdb: 20, tr: 20 });
    const spec = dynamicSpec(chartRequestFor(pmvPpdAshrae, slot), { x: q.tdb, y: q.clo });
    const region = regionOf(spec, zoneOf(spec));
    const { x, y } = samplesOf(spec);
    const limit = limitOf(pmvPpdAshrae, 0);
    let cut = 0;
    y.forEach((clo, yIndex) => {
      x.forEach((tdb, xIndex) => {
        const entered = new Map<Quantity, number>([[q.tdb, tdb], [q.clo, clo]]);
        const pmv = resultNumber(runAt(pmvPpdAshrae, slot, entered), q.pmv);
        const kept = Math.abs(pmv) < limit && !isOutsideApplicability(pmvPpdAshrae, slot, entered);
        expect(region[yIndex][xIndex], `${tdb} °C, ${clo} clo`).toBe(kept);
        if (Math.abs(pmv) < limit && !kept) {
          cut += 1;
          expect(clo).toBeGreaterThan(1.5);
        }
      });
    });
    // The cut matters: some grid point past 1.5 clo is inside the limit by its number.
    expect(cut).toBeGreaterThan(0);
  });
});

/**
 * Each grid point of `spec`'s first slot's psychrometric scan below
 * saturation: where it sits, its two values and its run's number and whether
 * that run breaks a bound. The cover hides the air above saturation, which
 * this file does not read.
 */
function psychrometricCells(model: RegisteredModel, slot: Slot, spec: ChartSpec) {
  const { x, y } = samplesOf(spec);
  const hrUnit = displayUnitFor(q.hr, unitSystem.si);
  return y.flatMap((hrShown, yIndex) =>
    x.flatMap((tdb, xIndex) => {
      const hr = hrUnit.toSi(hrShown);
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
  it("leave out the grid points above 30 °C and above 2 700 Pa of vapour pressure, and keep every other point they had", () => {
    const slot = startingSlot(pmvPpdIso);
    const spec = psychrometricSpec(chartRequestFor(pmvPpdIso, slot));
    const cells = psychrometricCells(pmvPpdIso, slot, spec);
    const fills = zoneFillsOf(spec);
    expect(fills.length).toBeGreaterThan(1);
    fills.forEach((fill, position) => {
      const region = regionOf(spec, fill);
      const insideByNumber = (pmv: number) => Math.abs(pmv) < limitOf(pmvPpdIso, position);
      let cut = 0;
      for (const { xIndex, yIndex, tdb, pa, pmv } of cells) {
        const outsideIso = tdb > 30 || pa > 2700;
        expect(region[yIndex][xIndex], `${fill.label} at ${tdb} °C, ${pa} Pa`).toBe(insideByNumber(pmv) && !outsideIso);
        if (insideByNumber(pmv) && outsideIso) {
          cut += 1;
        }
      }
      // The outermost zones reach past the bounds by their numbers.
      if (position === 0) {
        expect(cut).toBeGreaterThan(0);
      }
    });
    // Every zone's line runs along the 30 °C cut: two vertices on it, to one bisection step of a cell.
    const { x } = samplesOf(spec);
    const tolerance = BISECTION_STEP * (x[1] - x[0]);
    for (const line of zoneLinesOf(spec)) {
      const onCut = line.pieces.flatMap((piece) => piece.x).filter((temperature) => Math.abs(temperature - 30) <= tolerance);
      expect(onCut.length, line.label).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("PMV (ASHRAE 55)'s psychrometric zone", () => {
  /** The zone's fill of `slot`'s psychrometric chart. */
  function zoneFillOf(slot: Slot): PathTrace {
    return zoneOf(psychrometricSpec(chartRequestFor(pmvPpdAshrae, slot)));
  }

  it("is the same under both options at its defaults", () => {
    const withoutControl = zoneFillOf(ashraeSlot(false));
    expect(withoutControl.pieces.length).toBeGreaterThan(0);
    expect(withoutControl.pieces).toEqual(zoneFillOf(ashraeSlot(true)).pieces);
  });

  it("is empty at 0.9 m/s without local control, and with it is the zone its numbers give", () => {
    expect(zoneFillOf(ashraeSlot(false, { v: 0.9 })).pieces).toEqual([]);

    const slot = ashraeSlot(true, { v: 0.9 });
    const spec = psychrometricSpec(chartRequestFor(pmvPpdAshrae, slot));
    const region = regionOf(spec, zoneOf(spec));
    const cells = psychrometricCells(pmvPpdAshrae, slot, spec);
    expect(cells.some(({ outside }) => outside)).toBe(false);
    for (const { xIndex, yIndex, pmv } of cells) {
      expect(region[yIndex][xIndex]).toBe(Math.abs(pmv) < limitOf(pmvPpdAshrae, 0));
    }
    expect(countOf(region)).toBeGreaterThan(0);
  });
});

/**
 * Criterion 3c (ADR-0002 decision 78, rule 7): every vertex of a zone's
 * boundary where a bound ends it lies on the bound, a run one bisection step
 * inside the zone returning no `warnings` row and one step outside returning
 * one. Every vertex lies on a grid line, where the scan placed it, and the run
 * one step inside it breaks no bound, so no vertex on the limit lies past a
 * bound nearer the zone. One where the library's |PMV| is within criterion
 * 3a's bound of the zone's limit lies on the limit, which
 * `psychrometricChartAccuracy.test.ts` holds; every other vertex is held here
 * to the bound, so a vertex on neither fails.
 */
describe("criterion 3c: a zone's boundary on a bound, against the library", () => {
  const charts: readonly {
    readonly name: string;
    readonly model: RegisteredModel;
    readonly slot: Slot;
    readonly frame: ScanFrame;
    readonly spec: ChartSpec;
    readonly limitBound: number;
  }[] = [
    (() => {
      const slot = inScope(false);
      const request = chartRequestFor(pmvPpdAshrae, slot);
      return {
        name: "PMV (ASHRAE 55)'s air-speed chart without local control",
        model: pmvPpdAshrae,
        slot,
        frame: dynamicScanFrameFor(pmvPpdAshrae, airSpeedAxes, request.entryModes, P),
        spec: dynamicSpec(request, airSpeedAxes),
        limitBound: 0.01,
      };
    })(),
    (() => {
      const slot = startingSlot(pmvPpdIso);
      const request = chartRequestFor(pmvPpdIso, slot);
      return {
        name: "PMV (ISO 7730)'s psychrometric chart",
        model: pmvPpdIso,
        slot,
        frame: psychrometricScanFrameFor(pmvPpdIso, request.entryModes, P),
        spec: psychrometricSpec(request),
        limitBound: 0.005,
      };
    })(),
    (() => {
      const slot = ashraeSlot(false, { tdb: 20, tr: 20 });
      const request = chartRequestFor(pmvPpdAshrae, slot);
      const axes = { x: q.tdb, y: q.clo };
      return {
        name: "PMV (ASHRAE 55)'s tdb × clo chart",
        model: pmvPpdAshrae,
        slot,
        frame: dynamicScanFrameFor(pmvPpdAshrae, axes, request.entryModes, P),
        spec: dynamicSpec(request, axes),
        limitBound: 0.01,
      };
    })(),
  ];

  it.each(charts)("$name", ({ model, slot, frame, spec, limitBound }) => {
    const { x, y } = samplesOf(spec);
    const toSi = { x: displayUnitFor(frame.x.quantity, unitSystem.si).toSi, y: displayUnitFor(frame.y.quantity, unitSystem.si).toSi };
    const converted = withEntryModes(slot, frame.entryModes, model);
    const runAtPoint = (pointX: number, pointY: number) =>
      runAt(model, converted, new Map<Quantity, number>([[frame.x.quantity, toSi.x(pointX)], [frame.y.quantity, toSi.y(pointY)]]));
    let onBounds = 0;
    zoneFillsOf(spec).forEach((fill, position) => {
      const limit = limitOf(model, position);
      for (const ring of fill.pieces) {
        ring.x.forEach((vertexX, index) => {
          const vertexY = ring.y[index];
          const onColumn = x.includes(vertexX);
          const onRow = y.includes(vertexY);
          const label = `${fill.label} at (${vertexX}, ${vertexY})`;
          expect(onColumn || onRow, `${label} lies on no grid line`).toBe(true);
          if (onColumn && onRow) {
            return; // A corner of the frame, on no crossing.
          }
          // One bisection step either way along the grid line the vertex lies on.
          const along = onColumn ? y : x;
          const at = onColumn ? vertexY : vertexX;
          const cell = along.findIndex((sample, sampleIndex) => sample <= at && at <= along[sampleIndex + 1]);
          const step = BISECTION_STEP * (along[cell + 1] - along[cell]);
          const pointAt = (offset: number): [number, number] => (onColumn ? [vertexX, vertexY + offset] : [vertexX + offset, vertexY]);
          const [inside, outside] = isInsideFill(fill, ...pointAt(-step)) ? [pointAt(-step), pointAt(step)] : [pointAt(step), pointAt(-step)];
          expect(isInsideFill(fill, ...inside), label).toBe(true);
          expect(resultWarnings(model, runAtPoint(...inside)), label).toEqual([]);
          if (Math.abs(Math.abs(resultNumber(runAtPoint(vertexX, vertexY), q.pmv)) - limit) <= limitBound) {
            return; // On the limit.
          }
          expect(resultWarnings(model, runAtPoint(...outside)).length, label).toBeGreaterThan(0);
          onBounds += 1;
        });
      }
    });
    expect(onBounds).toBeGreaterThan(0);
  });
});
