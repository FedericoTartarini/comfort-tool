/**
 * The psychrometric chart handed a Band list, as Explore asks for it
 * (ADR-0002 decision 58): a scan of the model's output over the temperature
 * axis and the humidity ratio, unpainted above saturation, cut by the list,
 * with the isolines and the marker as on Standard and no Comfort zone. Handed
 * none it paints Comfort zones (`psychrometricChart.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { classifyFromBins, hr_to_rh } from "jsthermalcomfort";
import { bandListOf, moveEdge, type BandList } from "$lib/core/bands";
import { chartInk } from "$lib/core/bandPalette";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import {
  dynamicChartOf,
  isPolygonsChart,
  psychrometricChartOf,
  type DeclaredPsychrometricChart,
  type DeclaredScannedChart,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { startingSlot, withEnteredValues, type Slot } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { ChartRequest } from "./chartRequest";
import type { BandTrace, ChartSpec, HoverGridTrace, PathTrace } from "./chartSpec";
import { chartRequestFor } from "./chartTestRequests";
import { psychrometricSpec } from "./psychrometricChart";

const q = quantities;
const hrUnit = displayUnitFor(q.hr, unitSystem.si);
const p = DEFAULT_ATMOSPHERIC_PRESSURE;

function scannedChartOf(model: RegisteredModel): DeclaredScannedChart {
  const chart = dynamicChartOf(model);
  if (!chart || isPolygonsChart(chart)) {
    throw new Error(`${model.info.label} no longer declares a scanned dynamic chart`);
  }
  return chart;
}

function psychrometricOf(model: RegisteredModel): DeclaredPsychrometricChart {
  const chart = psychrometricChartOf(model);
  if (!chart) {
    throw new Error(`${model.info.label} no longer declares a psychrometric chart`);
  }
  return chart;
}

const isoBands = bandListOf(scannedChartOf(pmvPpdIso).bands);
const isoChart = psychrometricOf(pmvPpdIso);

/** `model`'s psychrometric chart of `slot` as slot 1, painting `bands`, with `changes` to the request. */
function bandedSpec(
  bands: BandList,
  slot: Slot = startingSlot(pmvPpdIso),
  changes: Partial<ChartRequest> = {},
  model: RegisteredModel = pmvPpdIso,
): ChartSpec {
  return psychrometricSpec({ ...chartRequestFor(model, slot), bands, ...changes }, psychrometricOf(model));
}

function bandTraceOf(spec: ChartSpec): BandTrace {
  const trace = spec.traces.find((entry): entry is BandTrace => entry.kind === "bands");
  if (!trace) {
    throw new Error("spec has no band trace");
  }
  return trace;
}

function hoverGridOf(spec: ChartSpec): HoverGridTrace {
  const trace = spec.traces.find((entry): entry is HoverGridTrace => entry.kind === "hoverGrid");
  if (!trace) {
    throw new Error("spec has no hover grid");
  }
  return trace;
}

/** The relative-humidity isolines: the unfilled paths, the saturation line the last. */
function isolinesOf(spec: ChartSpec): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill === undefined);
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
  const trace = bandTraceOf(spec);

  it("paints one band per band of the list, with its label, colour and interval, and no Comfort zone", () => {
    expect(trace.bands.map((band) => [band.label, band.color, band.lower, band.upper])).toEqual(
      isoBands.labels.map((label, index) => [label, isoBands.colors[index], isoBands.edges[index - 1], isoBands.edges[index]]),
    );
    expect(spec.traces.some((entry) => entry.kind === "path" && entry.fill !== undefined)).toBe(false);
  });

  it("draws the isolines, the saturation line last, over the bands, and the marker", () => {
    const isolines = isolinesOf(spec);
    expect(isolines).toHaveLength(10);
    expect(isolines[isolines.length - 1].color).toBe(chartInk.saturationLine);
    expect(spec.traces.indexOf(trace)).toBeLessThan(spec.traces.indexOf(isolines[0]));
    expect(spec.traces[spec.traces.length - 1].kind).toBe("point");
  });

  it("carries one legend: humidity, every band, then the slot", () => {
    expect(spec.legend).toEqual([
      { label: q.rh.label, swatch: "line", color: chartInk.isoline },
      ...isoBands.labels.map((label, index) => ({ label, swatch: "fill", color: isoBands.colors[index] })),
      { label: slotBadges[0].name, swatch: "marker", color: slotBadges[0].hue.marker },
    ]);
  });

  it("scans the drawn axes: the temperature axis and the humidity ratio, in display units", () => {
    expect([trace.x[0], trace.x[trace.x.length - 1]]).toEqual(spec.layout.x.range);
    expect(trace.y[0]).toBe(spec.layout.y.range[0]);
    expect(trace.y[trace.y.length - 1]).toBeCloseTo(spec.layout.y.range[1], 2);
  });

  it("leaves every cell above saturation without a number, and numbers every cell below it", () => {
    trace.z.forEach((row, yIndex) =>
      row.forEach((value, xIndex) => {
        const rh = hr_to_rh(hrUnit.toSi(trace.y[yIndex]), trace.x[xIndex], p);
        expect(value === null).toBe(rh > 100);
      }),
    );
    // The field holds both: the top left is supersaturated, the bottom row dry.
    expect(trace.z[trace.z.length - 1][0]).toBeNull();
    expect(trace.z[0].every((value) => value !== null)).toBe(true);
  });

  it("numbers a cell with the model's own output at its temperature and the library's relative humidity", () => {
    const slot = startingSlot(pmvPpdIso);
    for (const [yIndex, xIndex] of [[0, 0], [10, 25], [20, 40], [40, 50]]) {
      const temperature = trace.x[xIndex];
      const hr = hrUnit.toSi(trace.y[yIndex]);
      expect(trace.z[yIndex][xIndex]).toBe(numberAt(slot, temperature, hr, p));
    }
  });

  it("numbers a cell at the request's atmospheric pressure, on the taller axis it draws", () => {
    const pressure = 80000;
    const thin = bandTraceOf(bandedSpec(isoBands, startingSlot(pmvPpdIso), { atmosphericPressure: pressure }));
    expect(thin.y[thin.y.length - 1]).toBeGreaterThan(trace.y[trace.y.length - 1]);
    const [yIndex, xIndex] = [30, 30];
    expect(thin.z[yIndex][xIndex]).toBe(numberAt(startingSlot(pmvPpdIso), thin.x[xIndex], hrUnit.toSi(thin.y[yIndex]), pressure));
  });

  it("scans the operative temperature under operative entry, with tr following it", () => {
    const operative = enteredSlotFor(pmvPpdIso, { operative_tmp: 25 });
    const drawn = bandedSpec(isoBands, operative);
    const scanned = bandTraceOf(drawn);
    expect(drawn.layout.x.title).toContain(q.operative_tmp.label);
    const [yIndex, xIndex] = [10, 30];
    expect(scanned.z[yIndex][xIndex]).toBe(numberAt(operative, scanned.x[xIndex], hrUnit.toSi(scanned.y[yIndex]), p));
  });

  it("reads the temperature, the humidity ratio, the number and the band in every cell, off the hover grid alone", () => {
    expect(spec.traces.filter((entry) => entry.hover !== "off").map((entry) => entry.kind)).toEqual(["hoverGrid"]);
    const { hoverText } = hoverGridOf(spec);
    trace.z.forEach((row, yIndex) =>
      row.forEach((value, xIndex) => {
        const band = value === null ? Number.NaN : classifyFromBins(value, isoBands);
        expect(hoverText[yIndex][xIndex].slice(3)).toEqual(typeof band === "string" ? [band] : []);
      }),
    );
    // Cell (row 10, column 25) at PMV (ISO 7730)'s defaults: 25 °C, 6 g/kg, about 30 %.
    expect(hoverText[10][25]).toEqual([
      "Dry-bulb air temperature: 25 °C",
      "Humidity ratio: 6 g/kg",
      "Predicted Mean Vote: -0.56",
      "Slightly Cool",
    ]);
  });

  it("reads no number and no band above saturation", () => {
    const { hoverText } = hoverGridOf(spec);
    expect(hoverText[trace.z.length - 1][0].slice(2)).toEqual(["Predicted Mean Vote: —"]);
  });

  it("follows an edited list", () => {
    const edited = moveEdge(isoBands, 2, -0.1);
    expect(bandTraceOf(bandedSpec(edited)).bands.map((band) => band.upper)).toEqual(edited.edges);
  });

  it("paints PMV (ASHRAE 55)'s list over its own scan", () => {
    const ashraeBands = bandListOf(scannedChartOf(pmvPpdAshrae).bands);
    const drawn = bandedSpec(ashraeBands, startingSlot(pmvPpdAshrae), {}, pmvPpdAshrae);
    expect(bandTraceOf(drawn).bands.map((band) => band.label)).toEqual(ashraeBands.labels);
  });

  it("paints the scan it is handed rather than scanning again", () => {
    const handed = trace.z.map((row) => row.map(() => 0.1));
    const drawn = psychrometricSpec({ ...chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)), bands: isoBands }, isoChart, handed);
    expect(bandTraceOf(drawn).z).toEqual(handed);
  });

  it("paints Comfort zones and no band when given nothing", () => {
    const drawn = psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)), isoChart);
    expect(drawn.traces.some((entry) => entry.kind === "bands" || entry.kind === "hoverGrid")).toBe(false);
    expect(drawn.traces.filter((entry) => entry.kind === "path" && entry.fill !== undefined)).toHaveLength(3);
  });
});
