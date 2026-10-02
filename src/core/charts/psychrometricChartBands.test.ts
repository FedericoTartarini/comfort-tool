/**
 * The psychrometric chart handed a Band list, as Explore asks for it
 * (ADR-0002 decision 58): a scan of the model's output over the temperature
 * axis and the humidity ratio, every cell run, cut by the list, under the
 * cover above saturation (decision 61), with the isolines and the marker as on
 * Standard and no Comfort zone. Handed none it paints Comfort zones as
 * contours of the same scan (`psychrometricChart.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { classifyFromBins, hr_to_rh, psy_ta_rh } from "jsthermalcomfort";
import { bandListOf, moveEdge, type BandList } from "$lib/core/bands";
import { chartInk } from "$lib/core/bandPalette";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { startingSlot, withEnteredValues, type Slot } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { ChartRequest } from "./chartRequest";
import type { BandTrace, ChartSpec, ContourZoneTrace, HoverGridTrace, PathTrace } from "./chartSpec";
import { chartRequestFor } from "./chartTestRequests";
import { psychrometricSpec } from "./psychrometricChart";

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

/** The cover above the saturation line: the path filled in the plot's ground. */
function coverOf(spec: ChartSpec): PathTrace {
  const trace = spec.traces.find((entry): entry is PathTrace => entry.kind === "path" && entry.fill === chartInk.ground);
  if (!trace) {
    throw new Error("spec has no cover");
  }
  return trace;
}

/** Whether the cell of `trace` at (`xIndex`, `yIndex`) is supersaturated at `pressure`: its relative humidity above 100. */
function isSupersaturated(trace: BandTrace, xIndex: number, yIndex: number, pressure: number): boolean {
  return hr_to_rh(hrUnit.toSi(trace.y[yIndex]), trace.x[xIndex], pressure) > 100;
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
    expect(spec.traces.some((entry) => entry.kind === "path" && entry.fill !== undefined && entry.fill !== chartInk.ground)).toBe(false);
  });

  it("draws the bands, the hover grid, the cover, the isolines with the saturation line last, then the marker", () => {
    const isolines = isolinesOf(spec);
    expect(isolines).toHaveLength(10);
    expect(isolines[isolines.length - 1].color).toBe(chartInk.saturationLine);
    expect(spec.traces).toEqual([trace, hoverGridOf(spec), coverOf(spec), ...isolines, spec.traces[spec.traces.length - 1]]);
    expect(spec.traces[spec.traces.length - 1].kind).toBe("point");
  });

  it("covers the chart above the saturation line in the ground colour, read by nothing and named nowhere", () => {
    const cover = coverOf(spec);
    const [xMin, xMax] = spec.layout.x.range;
    const top = spec.layout.y.range[1];
    expect(cover).toMatchObject({ fill: chartInk.ground, color: chartInk.ground, hover: "off" });
    expect(cover.label).toBeUndefined();
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
    const cover = coverOf(thin);
    const top = thin.layout.y.range[1];
    expect(top).toBeGreaterThan(spec.layout.y.range[1]);
    expect(cover.y[1]).toBeCloseTo(hrUnit.fromSi(psy_ta_rh(cover.x[1], 100, pressure).hr), 10);
    expect([cover.x[cover.x.length - 1], cover.y[cover.y.length - 1]]).toEqual([thin.layout.x.range[0], top]);
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

  it("numbers every cell, the supersaturated ones too", () => {
    expect(trace.z.flat().every((value) => typeof value === "number" && Number.isFinite(value))).toBe(true);
    // The top left is supersaturated, the bottom row dry.
    expect(isSupersaturated(trace, 0, trace.z.length - 1, p)).toBe(true);
    expect(trace.z[0].every((_, xIndex) => !isSupersaturated(trace, xIndex, 0, p))).toBe(true);
  });

  it("numbers a cell with the model's own output at its temperature and the library's relative humidity", () => {
    const slot = startingSlot(pmvPpdIso);
    // The last cell is supersaturated, run at its true relative humidity above 100.
    for (const [yIndex, xIndex] of [[0, 0], [10, 25], [20, 40], [40, 50], [50, 0]]) {
      const temperature = trace.x[xIndex];
      const hr = hrUnit.toSi(trace.y[yIndex]);
      expect(trace.z[yIndex][xIndex]).toBe(numberAt(slot, temperature, hr, p));
    }
  });

  it("numbers a cell at the request's atmospheric pressure, on the taller axis it draws", () => {
    const pressure = 80000;
    const drawn = bandedSpec(isoBands, startingSlot(pmvPpdIso), { atmosphericPressure: pressure });
    const thin = bandTraceOf(drawn);
    expect(thin.y[thin.y.length - 1]).toBeGreaterThan(trace.y[trace.y.length - 1]);
    expect(thin.y[thin.y.length - 1]).toBeCloseTo(drawn.layout.y.range[1], 10);
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

  it("reads the temperature, the humidity ratio, the number and the band in every cell below saturation, off the hover grid alone", () => {
    expect(spec.traces.filter((entry) => entry.hover !== "off").map((entry) => entry.kind)).toEqual(["hoverGrid"]);
    const { hoverText } = hoverGridOf(spec);
    trace.z.forEach((row, yIndex) =>
      row.forEach((value, xIndex) => {
        const band = value === null || isSupersaturated(trace, xIndex, yIndex, p) ? Number.NaN : classifyFromBins(value, isoBands);
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

  it("reads no number and no band above saturation, where the cell still carries one", () => {
    const { hoverText } = hoverGridOf(spec);
    trace.z.forEach((row, yIndex) =>
      row.forEach((_, xIndex) => {
        if (isSupersaturated(trace, xIndex, yIndex, p)) {
          expect(hoverText[yIndex][xIndex].slice(2)).toEqual(["Predicted Mean Vote: —"]);
        }
      }),
    );
    expect(trace.z[trace.z.length - 1][0]).toBeTypeOf("number");
  });

  it("follows an edited list", () => {
    const edited = moveEdge(isoBands, 2, -0.1);
    expect(bandTraceOf(bandedSpec(edited)).bands.map((band) => band.upper)).toEqual(edited.edges);
  });

  it("paints PMV (ASHRAE 55)'s list over its own scan", () => {
    const ashraeBands = bandListOf(pmvPpdAshrae.scan.classifier);
    const drawn = bandedSpec(ashraeBands, startingSlot(pmvPpdAshrae), {}, pmvPpdAshrae);
    expect(bandTraceOf(drawn).bands.map((band) => band.label)).toEqual(ashraeBands.labels);
  });

  it("paints the scan it is handed rather than scanning again", () => {
    const handed = trace.z.map((row) => row.map(() => 0.1));
    const drawn = psychrometricSpec({ ...chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)), bands: isoBands }, [handed]);
    expect(bandTraceOf(drawn).z).toEqual(handed);
  });

  it("paints Comfort zones and no band when given nothing, under the same cover, over the same scan", () => {
    const drawn = psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)));
    expect(drawn.traces.some((entry) => entry.kind === "bands")).toBe(false);
    const zones = drawn.traces.filter((entry): entry is ContourZoneTrace => entry.kind === "contourZone");
    expect(zones).toHaveLength(3);
    expect(zones[0].z).toEqual(trace.z);
    expect(coverOf(drawn)).toEqual(coverOf(spec));
  });
});
