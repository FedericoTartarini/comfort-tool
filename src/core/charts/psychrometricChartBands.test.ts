/**
 * The psychrometric chart handed a Band list, as Explore asks for it
 * (ADR-0002 decision 58): a scan of the model's output over the temperature
 * axis and the humidity ratio, every cell run, cut by the list, each Edge
 * stroked over the isolines (decision 62), under the cover above saturation
 * (decision 61), with the isolines and the marker as on Standard and no
 * Comfort zone. Handed none it paints Comfort zones traced
 * from the same scan (`psychrometricChart.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { classifyFromBins, hr_to_rh, psy_ta_rh } from "jsthermalcomfort";
import { bandListOf, moveEdge, setColor, type BandList } from "$lib/core/bands";
import { chartInk } from "$lib/core/bandPalette";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import { palette } from "$lib/core/palette";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { startingSlot, withEnteredValues, type Slot } from "$lib/core/slot";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { copy } from "$lib/text/copy";
import type { ChartRequest } from "./chartRequest";
import type { ChartSpec, HoverGridTrace, PathTrace } from "./chartSpec";
import {
  bandFillsOf as fillsOf,
  bandLinesOf as linesOf,
  heldBetween,
  insideAtSamples,
  numbersAlong,
  onlyPieceOf,
  regionOf,
  zoneFillsOf,
  zoneLinesOf,
} from "./chartTestPaths";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
import { psychrometricScanFrameFor, psychrometricSpec } from "./psychrometricChart";
import { scannedField } from "./scan";

const q = quantities;
const hrUnit = displayUnitFor(q.hr, unitSystem.si);
const p = DEFAULT_ATMOSPHERIC_PRESSURE;

const isoBands = bandListOf(pmvPpdIso.scan.classifier);

/** `model`'s psychrometric chart of `slot` as slot 1, painting `bands`, with `changes` to the request. */
function bandedSpec(
  bands: BandList,
  slot: Slot = startingSlot(pmvPpdIso),
  changes: Partial<ChartRequest> = {},
  model: RegisteredModel = pmvPpdIso,
): ChartSpec {
  return psychrometricSpec({ ...chartRequestFor(model, slot), bands, ...changes });
}

/** Slot 1's scan of `drawn`'s chart: the number in SI, `[yIndex][xIndex]`, over the samples its hover grid reads, in display units. */
interface Scanned {
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly values: readonly (readonly number[])[];
}

/** Slot 1's scan of `model`'s psychrometric chart of `slot`, painting `bands`, with `changes` to the request. */
function scannedOf(bands: BandList, slot: Slot = startingSlot(pmvPpdIso), changes: Partial<ChartRequest> = {}, model: RegisteredModel = pmvPpdIso): Scanned {
  const drawn = { ...chartRequestFor(model, slot), bands, ...changes };
  const frame = psychrometricScanFrameFor(drawn.model, drawn.entryModes, drawn.atmosphericPressure);
  const { x, y } = hoverGridOf(psychrometricSpec(drawn));
  return { x, y, values: scannedField(frame, slot).values };
}

/**
 * Whether `spec`'s fills hold, at every grid point of the scan, exactly the
 * points whose number `values` lies from the lower Edge of each `list` band
 * named in `bands` up to its `top`, at the list's inclusivity.
 */
function expectFills(spec: ChartSpec, list: BandList, bands: readonly { index: number; top: number }[], values: Scanned["values"]): void {
  const fills = fillsOf(spec);
  expect(fills.map((fill) => [fill.label, fill.color])).toEqual(bands.map(({ index }) => [list.labels[index], list.colors[index]]));
  fills.forEach((fill, position) => {
    const { index, top } = bands[position];
    expect(regionOf(spec, fill)).toEqual(heldBetween(values, { lower: list.edges[index - 1], upper: list.edges[top] }, list.right));
  });
}

/** Whether each of `spec`'s lines crosses where the number `values` crosses its band's Edge of `list`, interpolated as the boundary is. */
function expectEdgesCrossed(spec: ChartSpec, list: BandList, values: Scanned["values"]): void {
  linesOf(spec).forEach((line, index) => {
    for (const number of numbersAlong(spec, line, values)) {
      expect(number).toBeCloseTo(list.edges[index], 9);
    }
  });
}

function hoverGridOf(spec: ChartSpec): HoverGridTrace {
  const trace = spec.traces.find((entry): entry is HoverGridTrace => entry.kind === "hoverGrid");
  if (!trace) {
    throw new Error("spec has no hover grid");
  }
  return trace;
}

/** The relative-humidity isolines: the paths named for a relative humidity, the saturation line the last. */
function isolinesOf(spec: ChartSpec): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && Boolean(trace.label?.startsWith(q.rh.label)));
}

/** The cover above the saturation line: the path filled in the plot's ground. */
function coverOf(spec: ChartSpec): PathTrace {
  const trace = spec.traces.find((entry): entry is PathTrace => entry.kind === "path" && entry.fill === chartInk.ground);
  if (!trace) {
    throw new Error("spec has no cover");
  }
  return trace;
}

/** Whether the cell of `scan` at (`xIndex`, `yIndex`) is supersaturated at `pressure`: its relative humidity above 100. */
function isSupersaturated(scan: Scanned, xIndex: number, yIndex: number, pressure: number): boolean {
  return hr_to_rh(hrUnit.toSi(scan.y[yIndex]), scan.x[xIndex], pressure) > 100;
}

/**
 * The model's own number at the cell whose temperature axis reads
 * `temperature` and whose humidity ratio reads `hr`, both in SI: the slot
 * with that temperature entered and the relative humidity the library gives
 * for `hr` at `pressure`.
 */
function numberAt(slot: Slot, temperature: number, hr: number, pressure: number): number {
  const axis = slot.temperature.mode.axis;
  const cell = withEnteredValues(slot, new Map([
    [axis, temperature],
    [q.rh, hr_to_rh(hr, temperature, pressure)],
  ]));
  return resultNumber(runOn(cell, pmvPpdIso, pressure), q.pmv);
}

describe("the psychrometric chart given a Band list", () => {
  const spec = bandedSpec(isoBands);
  const trace = scannedOf(isoBands);
  const lastBand = isoBands.edges.length - 1;
  const contiguous = (list: BandList) => list.labels.map((_, index) => ({ index, top: lastBand }));

  it("paints one fill per band of the list, holding the points from its lower Edge up to the last, and no Comfort zone", () => {
    expectFills(spec, isoBands, contiguous(isoBands), trace.values);
    expect(zoneLinesOf(spec).map((line) => line.color)).not.toContain(chartInk.zoneLine(palette.slots[0]));
    expect(fillsOf(spec).map((fill) => fill.fill)).toEqual(isoBands.colors);
  });

  it("strokes every band's own upper Edge once, in the band line at 1 px, read by nothing, where the number crosses it", () => {
    expect(linesOf(spec).map(({ label, color, width, hover }) => ({ label, color, width, hover }))).toEqual(
      isoBands.labels.map((label) => ({ label, color: chartInk.bandLine, width: chartInk.bandLineWidth, hover: "off" })),
    );
    expectEdgesCrossed(spec, isoBands, trace.values);
  });

  it("strokes an unpainted band's Edge, and the fill below it stops at its lower Edge", () => {
    const hidden = setColor(isoBands, 3, undefined);
    const drawn = bandedSpec(hidden);
    expect(linesOf(drawn).map((line) => line.label)).toEqual(hidden.labels);
    expectEdgesCrossed(drawn, hidden, trace.values);
    expectFills(drawn, hidden, [0, 1, 2].map((index) => ({ index, top: 2 })).concat([4, 5, 6].map((index) => ({ index, top: lastBand }))), trace.values);
  });

  it.each([1, 3])(
    "draws the fills, the isolines below saturation, the outlines, the hover grid, the cover, the saturation line, then the markers, of %i slot(s)",
    (count) => {
      const slots = Array.from({ length: count }, () => startingSlot(pmvPpdIso));
      const drawn = psychrometricSpec({ ...chartRequestForSlots(pmvPpdIso, slots), bands: isoBands });
      const isolines = isolinesOf(drawn);
      const saturationLine = isolines[isolines.length - 1];
      const markers = drawn.traces.filter((trace) => trace.kind === "point");
      expect(isolines.map((isoline) => isoline.color)).toEqual([...Array(9).fill(chartInk.isoline), chartInk.saturationLine]);
      expect(linesOf(drawn)).toHaveLength(isoBands.edges.length);
      expect(markers).toHaveLength(count);
      expect(drawn.traces).toEqual([
        ...fillsOf(drawn),
        ...isolines.slice(0, -1),
        ...linesOf(drawn),
        hoverGridOf(drawn),
        coverOf(drawn),
        saturationLine,
        ...markers,
      ]);
    },
  );

  it("covers the chart above the saturation line in the ground colour, read by nothing and named nowhere", () => {
    const trace = coverOf(spec);
    const cover = onlyPieceOf(trace);
    const [xMin, xMax] = spec.layout.x.range;
    const top = spec.layout.y.range[1];
    expect(trace).toMatchObject({ fill: chartInk.ground, color: chartInk.ground, hover: "off" });
    expect(trace.label).toBeUndefined();
    expect(spec.legend.map((entry) => entry.color)).not.toContain(chartInk.ground);
    // Along the saturation line from the lowest temperature, every point on it.
    const along = cover.x.length - 2;
    expect(cover.x[0]).toBe(xMin);
    for (let index = 0; index < along; index += 1) {
      expect(cover.y[index]).toBeCloseTo(hrUnit.fromSi(psy_ta_rh(cover.x[index], 100, p).hr), 10);
    }
    // To where the line leaves the top of the drawn range, then the top-left corner.
    expect(cover.x[along]).toBeGreaterThan(cover.x[along - 1]);
    expect(cover.x[along]).toBeLessThan(xMax);
    expect(cover.y[along]).toBeCloseTo(top, 10);
    expect(hrUnit.fromSi(psy_ta_rh(cover.x[along], 100, p).hr)).toBeCloseTo(top, 2);
    expect([cover.x[along + 1], cover.y[along + 1]]).toEqual([xMin, top]);
  });

  it("covers the taller range at a lower pressure, along that pressure's saturation line", () => {
    const pressure = 80000;
    const thin = bandedSpec(isoBands, startingSlot(pmvPpdIso), { atmosphericPressure: pressure });
    const cover = onlyPieceOf(coverOf(thin));
    const top = thin.layout.y.range[1];
    expect(top).toBeGreaterThan(spec.layout.y.range[1]);
    expect(cover.y[1]).toBeCloseTo(hrUnit.fromSi(psy_ta_rh(cover.x[1], 100, pressure).hr), 10);
    expect([cover.x[cover.x.length - 1], cover.y[cover.y.length - 1]]).toEqual([thin.layout.x.range[0], top]);
  });

  it("carries one legend: humidity, every band, then the slot", () => {
    expect(spec.legend).toEqual([
      { label: q.rh.label, swatch: "line", color: chartInk.isoline },
      ...isoBands.labels.map((label, index) => ({ label, swatch: "fill", color: isoBands.colors[index] })),
      { label: "Input", swatch: "marker", color: chartInk.marker(palette.slots[0]) },
    ]);
  });

  it("scans the drawn axes: the temperature axis and the humidity ratio, in display units", () => {
    expect([trace.x[0], trace.x[trace.x.length - 1]]).toEqual(spec.layout.x.range);
    expect(trace.y[0]).toBe(spec.layout.y.range[0]);
    expect(trace.y[trace.y.length - 1]).toBeCloseTo(spec.layout.y.range[1], 2);
  });

  it("numbers every cell, the supersaturated ones too", () => {
    expect(trace.values.flat().every((value) => Number.isFinite(value))).toBe(true);
    // The top left is supersaturated, the bottom row dry.
    expect(isSupersaturated(trace, 0, trace.values.length - 1, p)).toBe(true);
    expect(trace.values[0].every((_, xIndex) => !isSupersaturated(trace, xIndex, 0, p))).toBe(true);
  });

  it("numbers a cell with the model's own output at its temperature and the library's relative humidity", () => {
    const slot = startingSlot(pmvPpdIso);
    // The last cell is supersaturated, run at its true relative humidity above 100.
    for (const [yIndex, xIndex] of [[0, 0], [10, 25], [20, 40], [40, 50], [50, 0]]) {
      const temperature = trace.x[xIndex];
      const hr = hrUnit.toSi(trace.y[yIndex]);
      expect(trace.values[yIndex][xIndex]).toBe(numberAt(slot, temperature, hr, p));
    }
  });

  it("numbers a cell at the request's atmospheric pressure, on the taller axis it draws", () => {
    const pressure = 80000;
    const drawn = bandedSpec(isoBands, startingSlot(pmvPpdIso), { atmosphericPressure: pressure });
    const thin = scannedOf(isoBands, startingSlot(pmvPpdIso), { atmosphericPressure: pressure });
    expect(thin.y[thin.y.length - 1]).toBeGreaterThan(trace.y[trace.y.length - 1]);
    expect(thin.y[thin.y.length - 1]).toBeCloseTo(drawn.layout.y.range[1], 10);
    const [yIndex, xIndex] = [30, 30];
    expect(thin.values[yIndex][xIndex]).toBe(numberAt(startingSlot(pmvPpdIso), thin.x[xIndex], hrUnit.toSi(thin.y[yIndex]), pressure));
  });

  it("scans the operative temperature under operative entry, with tr following it", () => {
    const operative = enteredSlotFor(pmvPpdIso, { operative_tmp: 25 });
    const drawn = bandedSpec(isoBands, operative);
    const scanned = scannedOf(isoBands, operative);
    expect(drawn.layout.x.title).toContain(q.operative_tmp.label);
    const [yIndex, xIndex] = [10, 30];
    expect(scanned.values[yIndex][xIndex]).toBe(numberAt(operative, scanned.x[xIndex], hrUnit.toSi(scanned.y[yIndex]), p));
  });

  it("reads the temperature, the humidity ratio, the number and the band in every cell below saturation, off the hover grid alone", () => {
    expect(spec.traces.filter((entry) => entry.hover !== "off").map((entry) => entry.kind)).toEqual(["hoverGrid"]);
    const { hoverText } = hoverGridOf(spec);
    trace.values.forEach((row, yIndex) =>
      row.forEach((value, xIndex) => {
        const band = isSupersaturated(trace, xIndex, yIndex, p) ? Number.NaN : classifyFromBins(value, isoBands);
        expect(hoverText[yIndex][xIndex].slice(3)).toEqual(typeof band === "string" ? [band] : []);
      }),
    );
    // Cell (row 10, column 30) at PMV (ISO 7730)'s defaults: 25 °C, 6 g/kg, about 30 %.
    expect(hoverText[10][30]).toEqual([
      "Dry-bulb air temperature: 25 °C",
      "Humidity ratio: 6 g/kg",
      "PMV: -0.56",
      "Slightly Cool",
    ]);
  });

  it("reads no number and no band above saturation, where the cell still carries one", () => {
    const { hoverText } = hoverGridOf(spec);
    trace.values.forEach((row, yIndex) =>
      row.forEach((_, xIndex) => {
        if (isSupersaturated(trace, xIndex, yIndex, p)) {
          expect(hoverText[yIndex][xIndex].slice(2)).toEqual(["PMV: —"]);
        }
      }),
    );
    expect(Number.isFinite(trace.values[trace.values.length - 1][0])).toBe(true);
  });

  it("follows an edited list", () => {
    const edited = moveEdge(isoBands, 2, -0.1);
    expectFills(bandedSpec(edited), edited, contiguous(edited), trace.values);
    expectEdgesCrossed(bandedSpec(edited), edited, trace.values);
  });

  it("paints PMV (ASHRAE 55)'s list over its own scan", () => {
    const ashraeBands = bandListOf(pmvPpdAshrae.scan.classifier);
    const drawn = bandedSpec(ashraeBands, startingSlot(pmvPpdAshrae), {}, pmvPpdAshrae);
    const own = scannedOf(ashraeBands, startingSlot(pmvPpdAshrae), {}, pmvPpdAshrae);
    expectFills(drawn, ashraeBands, ashraeBands.labels.map((_, index) => ({ index, top: ashraeBands.edges.length - 1 })), own.values);
    expectEdgesCrossed(drawn, ashraeBands, own.values);
  });

  it("paints the scan it is handed rather than scanning again", () => {
    // Every band handed as the whole field: each fill is the plot's frame, and no Edge is crossed.
    const everywhere = <Value>(value: Value) => trace.values.map((row) => row.map(() => value));
    const [xSi, ySi] = [trace.x, trace.y.map((hr) => hrUnit.toSi(hr))];
    const whole = { x: xSi, y: ySi, inside: everywhere(true), across: everywhere(undefined), up: everywhere(undefined), centre: everywhere(undefined) };
    const drawn = psychrometricSpec(
      { ...chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)), bands: isoBands },
      [{ values: everywhere(0.1), zones: [], regionWithin: () => whole }],
    );
    const last = trace.x.length - 1;
    const frameRing = { x: [trace.x[0], trace.x[last], trace.x[last], trace.x[0]], y: [trace.y[0], trace.y[0], trace.y[last], trace.y[last]] };
    expect(fillsOf(drawn).map((fill) => fill.pieces)).toEqual(isoBands.labels.map(() => [frameRing]));
    expect(linesOf(drawn).map((line) => line.pieces)).toEqual(isoBands.labels.map(() => []));
    expect(hoverGridOf(drawn).hoverText[0][0][2]).toBe(`${q.pmv.label}: 0.1`);
  });

  it("paints Comfort zones and no band when given nothing, under the same cover, over the same scan", () => {
    const drawn = psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)));
    const zoneLabels = [...pmvPpdIso.scan.comfortZones].sort((a, b) => b.limit - a.limit).map((zone) => copy.zoneLegend(zone));
    const zones = zoneFillsOf(drawn);
    expect(zones.map((zone) => zone.label)).toEqual(zoneLabels);
    expect(zoneLinesOf(drawn).map((line) => line.label)).toEqual(zoneLabels);
    expect(zoneLinesOf(drawn).map((line) => line.color)).not.toContain(chartInk.bandLine);
    expect(linesOf(drawn)).toEqual([]);
    // Over the same scan: every grid point the zone holds has the scan's own number within the zone's limit.
    const [outermost] = zones;
    const limit = Math.max(...pmvPpdIso.scan.comfortZones.map((zone) => zone.limit));
    let held = 0;
    insideAtSamples(outermost, trace.x, trace.y).forEach((row, yIndex) =>
      row.forEach((inside, xIndex) => {
        if (inside) {
          held += 1;
          expect(Math.abs(trace.values[yIndex][xIndex])).toBeLessThan(limit);
        }
      }),
    );
    expect(held).toBeGreaterThan(0);
    expect(coverOf(drawn)).toEqual(coverOf(spec));
  });
});
