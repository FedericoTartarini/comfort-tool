import { describe, expect, it } from "vitest";
import { enteredSlotFor, entryModesWithAirSpeed, entryModesWithClothing, entryModesWithTemperature } from "$lib/core/declarationTestSlots";
import { airSpeedMode, clothingMode, temperatureMode } from "$lib/core/entryModes";
import { valuesReader } from "$lib/core/libraryInputs";
import {
  dynamicChartOf,
  requireAxisRange,
  type ComfortZone,
  type DeclaredDynamicChart,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { enteredQuantities, startingSlot } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { unitSystem } from "$lib/core/unitSystem";
import { copy } from "$lib/text/copy";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { ChartSpec, ContourZoneTrace, HoverGridTrace, PointTrace } from "./chartSpec";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
import { dynamicAxisQuantities, dynamicSpec, resolvedAxes } from "./dynamicChart";

const q = quantities;

const isoChart = dynamicChartOf(pmvPpdIso);
if (!isoChart) {
  throw new Error("pmvPpdIso no longer declares a dynamic chart");
}

const slot = enteredSlotFor(pmvPpdIso, { tdb: 26, tr: 26 });

const request = chartRequestFor(pmvPpdIso, slot);

/** PMV (ISO 7730)'s own air speed, which every slot here keeps. */
const { v } = valuesReader(startingSlot(pmvPpdIso).values);

/** The range `pmvPpdIso` declares for `quantity`, as the layout writes a range. */
function declaredRangeOf(quantity: Quantity): [number, number] {
  const { min, max } = requireAxisRange(pmvPpdIso, quantity);
  return [min, max];
}

function markerOf(spec: { traces: readonly { kind: string }[] }): PointTrace | undefined {
  return spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
}

/** `at(-1)`, which this project's ES2020 target does not have. */
function last<T>(row: readonly T[]): T {
  return row[row.length - 1];
}

/** The largest Comfort zone a scanned chart cuts from its one slot's field: it carries the field itself. */
function surfaceOf(spec: ChartSpec): ContourZoneTrace {
  const trace = spec.traces.find((entry): entry is ContourZoneTrace => entry.kind === "contourZone");
  if (!trace) {
    throw new Error("spec has no contour zone");
  }
  return trace;
}

function contourZonesOf(spec: ChartSpec): ContourZoneTrace[] {
  return spec.traces.filter((trace): trace is ContourZoneTrace => trace.kind === "contourZone");
}

function hoverGridOf(spec: ChartSpec): HoverGridTrace {
  const trace = spec.traces.find((entry): entry is HoverGridTrace => entry.kind === "hoverGrid");
  if (!trace) {
    throw new Error("spec has no hover grid");
  }
  return trace;
}

/** `model`'s dynamic chart. */
function dynamicOf(model: RegisteredModel): DeclaredDynamicChart {
  const chart = dynamicChartOf(model);
  if (!chart) {
    throw new Error(`${model.info.label} no longer declares a dynamic chart`);
  }
  return chart;
}

/** The Comfort zones `model`'s scan declares, largest first. */
function declaredZonesOf(model: RegisteredModel): ComfortZone[] {
  return [...(model.scan?.comfortZones ?? [])].sort((a, b) => b.limit - a.limit);
}

describe("dynamicSpec", () => {
  it("scans a square field across the declared axis ranges", () => {
    const spec = dynamicSpec(request, isoChart.axes);
    const surface = surfaceOf(spec);
    const { hoverText } = hoverGridOf(spec);
    // One grid count for both axes, whatever it is; the surface and its hover
    // text follow the axes rather than a number restated here.
    const grid = surface.x.length;
    expect(surface.y).toHaveLength(grid);
    expect(surface.z).toHaveLength(grid);
    expect(surface.z[0]).toHaveLength(grid);
    expect(hoverText).toHaveLength(grid);
    expect(hoverText[0]).toHaveLength(grid);
    // The declared ranges, which are what the deployed tool draws, not
    // ISO 7730's applicability limits.
    expect([surface.x[0], last(surface.x)]).toEqual(declaredRangeOf(q.tdb));
    expect([surface.y[0], last(surface.y)]).toEqual(declaredRangeOf(q.v));
  });

  it("puts a lower number at a cold still point than at a warm one", () => {
    const surface = surfaceOf(dynamicSpec(request, isoChart.axes));
    // Cold and still at the bottom left, warm and still at the bottom right.
    const coldest = surface.z[0][0];
    const warmest = last(surface.z[0]);
    expect(coldest).not.toBeNull();
    expect(warmest).not.toBeNull();
    expect(coldest).toBeLessThan(Number(warmest));
  });

  it("marks the value the user entered, not the derived one", () => {
    const marker = markerOf(dynamicSpec(request, isoChart.axes));
    expect(marker?.x).toBe(26);
    // The library is called with vr = v_relative(v, met); the axis is the entered v.
    expect(marker?.y).toBe(v);
  });

  it("sweeps a swapped axis just as well", () => {
    const surface = surfaceOf(dynamicSpec(request, { x: q.clo, y: q.met }));
    expect([surface.x[0], last(surface.x)]).toEqual(declaredRangeOf(q.clo));
    expect([surface.y[0], last(surface.y)]).toEqual(declaredRangeOf(q.met));
  });

  it("converts both axes to the displayed unit", () => {
    const spec = dynamicSpec({ ...request, unitSystem: unitSystem.ip }, isoChart.axes);
    const surface = surfaceOf(spec);
    expect(surface.x[0]).toBeCloseTo(50, 10);
    expect(last(surface.y)).toBeCloseTo(393.7, 2);
    expect(spec.layout.y.title).toContain("fpm");
  });
});

/**
 * One slot and no Band list, as the Standard page asks with Compare off
 * (ADR-0002 decision 58): the slot's Comfort zones as contours of its scan,
 * exactly as each of two slots draws its own, and no band.
 */
describe("the scanned dynamic chart of one slot", () => {
  const spec = dynamicSpec(request, isoChart.axes);

  it("paints PMV (ISO 7730)'s three Comfort zones, nested, largest first, and one marker", () => {
    expect(spec.traces.some((trace) => trace.kind === "bands")).toBe(false);
    expect(contourZonesOf(spec).map((zone) => [zone.label, zone.lower, zone.upper])).toEqual(
      declaredZonesOf(pmvPpdIso).map((zone) => [copy.zoneLegend(zone), -zone.limit, zone.limit]),
    );
    expect(contourZonesOf(spec)).toHaveLength(3);
    expect(spec.traces.filter((trace) => trace.kind === "point")).toHaveLength(1);
  });

  it("paints them as the first of two slots paints its own, named without the slot", () => {
    const two = dynamicSpec(chartRequestForSlots(pmvPpdIso, [slot, slot]), isoChart.axes);
    const unnamed = ({ label: _label, ...zone }: ContourZoneTrace) => zone;
    expect(contourZonesOf(spec).map(unnamed)).toEqual(contourZonesOf(two).slice(0, 3).map(unnamed));
  });

  it("paints PMV (ASHRAE 55)'s one Comfort zone and one marker", () => {
    const ashrae = dynamicOf(pmvPpdAshrae);
    const drawn = dynamicSpec(chartRequestFor(pmvPpdAshrae, startingSlot(pmvPpdAshrae)), ashrae.axes);
    expect(drawn.traces.some((trace) => trace.kind === "bands")).toBe(false);
    expect(contourZonesOf(drawn).map((zone) => [zone.label, zone.lower, zone.upper])).toEqual(
      declaredZonesOf(pmvPpdAshrae).map((zone) => [copy.zoneLegend(zone), -zone.limit, zone.limit]),
    );
    expect(contourZonesOf(drawn)).toHaveLength(1);
    expect(drawn.traces.filter((trace) => trace.kind === "point")).toHaveLength(1);
  });

  it("paints Heat Index's marker alone, its output being no PMV", () => {
    const heat = dynamicOf(heatIndexRothfusz);
    const drawn = dynamicSpec(chartRequestFor(heatIndexRothfusz, startingSlot(heatIndexRothfusz)), heat.axes);
    expect(drawn.traces.filter((trace) => trace.hover === "off").map((trace) => trace.kind)).toEqual(["point"]);
    expect(drawn.legend.map((entry) => entry.swatch)).toEqual(["marker"]);
  });

  it("reads both axis values and the slot's number in every cell, and no band", () => {
    const { hoverText } = hoverGridOf(spec);
    expect(new Set(hoverText.flat().map((readout) => readout.length))).toEqual(new Set([3]));
    expect(spec.traces.filter((trace) => trace.hover !== "off").map((trace) => trace.kind)).toEqual(["hoverGrid"]);
  });

  it("carries one legend: every zone, then the slot", () => {
    expect(spec.legend.map((entry) => [entry.label, entry.swatch])).toEqual([
      ...declaredZonesOf(pmvPpdIso).map((zone) => [copy.zoneLegend(zone), "fill"]),
      [slotBadges[0].name, "marker"],
    ]);
  });
});

describe("a model's own number in the scanned field", () => {
  const chart = dynamicOf(pmvPpdIso);

  /** The scan of a model whose PMV is `value` at every point of the field. */
  function flat(value: number): ChartSpec {
    const model = { ...pmvPpdIso, run: () => ({ pmv: value }) } satisfies RegisteredModel;
    return dynamicSpec({ ...request, model }, chart.axes);
  }

  function numberAt(value: number): number | null {
    return surfaceOf(flat(value)).z[0][0];
  }

  it("is handed on, wherever it falls", () => {
    expect(numberAt(-500)).toBe(-500);
    expect(numberAt(0)).toBe(0);
    expect(numberAt(0.3)).toBe(0.3);
    expect(numberAt(250)).toBe(250);
  });

  it("empties only the cell where the model gives no number", () => {
    expect(numberAt(Number.NaN)).toBeNull();
  });

  it("reads a dash for the output where the model gives no number, as the results table does", () => {
    expect(hoverGridOf(flat(Number.NaN)).hoverText[0][0][2]).toBe(`${q.pmv.label}: ${copy.notAvailable}`);
  });
});

describe("dynamicAxisQuantities", () => {
  it("offers every entered quantity the chart declares a range for", () => {
    const separate = dynamicAxisQuantities(pmvPpdIso, entryModesWithTemperature(temperatureMode.separate));
    // Every entered quantity, humidity included: no standard limits `rh`, and
    // an axis range is a viewport rather than an applicability limit.
    expect(separate).toEqual(enteredQuantities(pmvPpdIso, entryModesWithTemperature(temperatureMode.separate)));
    expect(separate).toContain(q.rh);
  });

  it("follows the temperature entry mode", () => {
    const operative = dynamicAxisQuantities(pmvPpdIso, entryModesWithTemperature(temperatureMode.operative));
    expect(operative).toContain(q.operative_tmp);
    expect(operative).not.toContain(q.tdb);
  });

  it("never offers a yes-or-no quantity, which has no range to sweep", () => {
    const model = {
      ...pmvPpdIso,
      inputs: [...pmvPpdIso.inputs, { quantity: q.compliance, value: 0 }],
    } satisfies RegisteredModel;
    expect(enteredQuantities(model, entryModesWithTemperature(temperatureMode.separate))).toContain(q.compliance);
    expect(dynamicAxisQuantities(model, entryModesWithTemperature(temperatureMode.separate))).not.toContain(q.compliance);
  });
});

describe("axes across a temperature entry mode switch", () => {
  it("sweeps the operative temperature when a remembered tdb axis no longer exists", () => {
    // isoChart.axes.x is tdb, which the slot no longer holds.
    const spec = dynamicSpec(chartRequestFor(pmvPpdIso, enteredSlotFor(pmvPpdIso, { operative_tmp: 26 })), isoChart.axes);
    expect(spec.layout.x.title).toContain(q.operative_tmp.label);
    // The whole field would carry one number if the sweep were being discarded.
    const surface = surfaceOf(spec);
    expect(new Set(surface.z.flat()).size).toBeGreaterThan(1);
    expect(markerOf(spec)?.x).toBe(26);
  });

  it("moves the second axis off the first when the mode maps both onto operative_tmp", () => {
    // tdb × tr is a chart under separate entry; under operative entry both
    // become operative_tmp, and a quantity against itself is not a chart.
    const axes = resolvedAxes(pmvPpdIso, { x: q.tdb, y: q.tr }, entryModesWithTemperature(temperatureMode.operative));
    expect(axes.x).toBe(q.operative_tmp);
    expect(axes.y).not.toBe(q.operative_tmp);
    expect(dynamicAxisQuantities(pmvPpdIso, entryModesWithTemperature(temperatureMode.operative))).toContain(axes.y);
  });

  it("leaves axes that do not collide alone", () => {
    expect(resolvedAxes(pmvPpdIso, { x: q.tdb, y: q.v }, entryModesWithTemperature(temperatureMode.separate))).toEqual({ x: q.tdb, y: q.v });
  });
});

describe("axes across an air-speed entry mode switch", () => {
  const corrected = entryModesWithAirSpeed(airSpeedMode.corrected);

  it("offers the relative air speed where it offered the air speed", () => {
    const offered = dynamicAxisQuantities(pmvPpdIso, corrected);
    expect(offered).toContain(q.vr);
    expect(offered).not.toContain(q.v);
    expect(dynamicAxisQuantities(pmvPpdIso, entryModesWithAirSpeed(airSpeedMode.uncorrected))).toContain(q.v);
  });

  it("sweeps the relative air speed when a remembered air-speed axis no longer exists, and marks the entry", () => {
    // isoChart.axes.y is v, which the slot no longer holds.
    const spec = dynamicSpec(chartRequestFor(pmvPpdIso, enteredSlotFor(pmvPpdIso, { vr: 0.4 })), isoChart.axes);
    expect(spec.layout.y.title).toContain(q.vr.label);
    expect(new Set(surfaceOf(spec).z.flat()).size).toBeGreaterThan(1);
    expect(markerOf(spec)?.y).toBe(0.4);
  });

  it("draws the relative air speed as far as the air speed, not to the standard's applicability bound", () => {
    const spec = dynamicSpec(chartRequestFor(pmvPpdIso, enteredSlotFor(pmvPpdIso, { vr: 0.4 })), isoChart.axes);
    expect(spec.layout.y.range).toEqual([0, 2]);
    expect(spec.layout.y.range).toEqual(declaredRangeOf(q.v));
  });

  it("gives the model the swept relative air speed unchanged, so the field is the one the air speed gives at the same vr", () => {
    // At met 1 the activity adds nothing, so v and vr are one number and the two fields one field.
    const still = dynamicSpec(chartRequestFor(pmvPpdIso, enteredSlotFor(pmvPpdIso, { v: 0.4, met: 1 })), { x: q.tdb, y: q.clo });
    const entered = dynamicSpec(chartRequestFor(pmvPpdIso, enteredSlotFor(pmvPpdIso, { vr: 0.4, met: 2 })), { x: q.tdb, y: q.clo });
    const moving = dynamicSpec(chartRequestFor(pmvPpdIso, enteredSlotFor(pmvPpdIso, { v: 0.4, met: 2 })), { x: q.tdb, y: q.clo });
    const atMetOne = dynamicSpec(chartRequestFor(pmvPpdIso, enteredSlotFor(pmvPpdIso, { vr: 0.4, met: 1 })), { x: q.tdb, y: q.clo });
    expect(surfaceOf(atMetOne).z).toEqual(surfaceOf(still).z);
    expect(surfaceOf(entered).z).not.toEqual(surfaceOf(moving).z);
  });
});

describe("axes across a clothing entry mode switch", () => {
  const corrected = entryModesWithClothing(clothingMode.corrected);
  const clothingAxes = { x: q.tdb, y: q.clo };

  it("offers the dynamic clothing insulation where it offered the clothing insulation", () => {
    const offered = dynamicAxisQuantities(pmvPpdIso, corrected);
    expect(offered).toContain(q.clo_dynamic);
    expect(offered).not.toContain(q.clo);
    expect(dynamicAxisQuantities(pmvPpdIso, entryModesWithClothing(clothingMode.uncorrected))).toContain(q.clo);
  });

  it("sweeps the dynamic clothing insulation when a remembered clothing axis no longer exists, as far as it drew the clothing, and marks the entry", () => {
    const spec = dynamicSpec(chartRequestFor(pmvPpdIso, enteredSlotFor(pmvPpdIso, { clo_dynamic: 0.8 })), clothingAxes);
    expect(spec.layout.y.title).toContain(q.clo_dynamic.label);
    expect(spec.layout.y.range).toEqual(declaredRangeOf(q.clo));
    expect(new Set(surfaceOf(spec).z.flat()).size).toBeGreaterThan(1);
    expect(markerOf(spec)?.y).toBe(0.8);
  });

  // PMV (ASHRAE 55) corrects nothing at or below 1.2 met, so there the two
  // entries are one number and the two fields one field; above it the swept
  // clothing insulation is corrected in every cell and the dynamic one is not.
  it("gives the model the swept dynamic clothing insulation unchanged, and the swept clothing insulation corrected", () => {
    const fieldOf = (entered: Parameters<typeof enteredSlotFor>[1]) =>
      surfaceOf(dynamicSpec(chartRequestFor(pmvPpdAshrae, enteredSlotFor(pmvPpdAshrae, entered)), clothingAxes)).z;
    expect(fieldOf({ clo_dynamic: 0.5, met: 1.2 })).toEqual(fieldOf({ clo: 0.5, met: 1.2 }));
    expect(fieldOf({ clo_dynamic: 0.5, met: 2 })).not.toEqual(fieldOf({ clo: 0.5, met: 2 }));
  });
});

describe("the scanned chart's hover readout", () => {
  const pmvRequest = chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso));

  // Cell (row 2, column 26) of the 51 × 51 field at PMV (ISO 7730)'s defaults:
  // tdb 25.6 °C, v 0.08 m/s, where the model gives a PMV of -0.2209… on the
  // clothing ISO 7730's rule gives it (0.4238 clo for the 0.5 clo entered).
  it("reads both axis values and the output, each number at two decimals at most", () => {
    const grid = hoverGridOf(dynamicSpec(pmvRequest, isoChart.axes));
    expect(grid.hoverText[2][26]).toEqual([
      "Dry-bulb air temperature: 25.6 °C",
      "Air speed: 0.08 m/s",
      "Predicted Mean Vote: -0.22",
    ]);
  });

  it("reads the axis values in the displayed unit", () => {
    const grid = hoverGridOf(dynamicSpec({ ...pmvRequest, unitSystem: unitSystem.ip }, isoChart.axes));
    expect(grid.hoverText[2][26]).toEqual([
      "Dry-bulb air temperature: 78.08 °F",
      "Air speed: 15.75 fpm",
      "Predicted Mean Vote: -0.22",
    ]);
  });
});
