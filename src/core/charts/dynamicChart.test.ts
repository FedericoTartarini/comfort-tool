import { describe, expect, it } from "vitest";
import { io } from "jsthermalcomfort";
import type { Quantity } from "jsthermalcomfort/io";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import { enteredQuantities, requireValue, type SlotInputs } from "$lib/core/libraryInputs";
import { dynamicChartOf, type DynamicDeclaration } from "$lib/core/modelDeclaration";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvIso } from "$lib/models/pmvIso";
import type { BandTrace, ChartRequest, PathTrace, PointTrace } from "./chartSpec";
import { dynamicAxisQuantities, dynamicSpec, resolvedAxes } from "./dynamicChart";

const q = io.quantities;
const GRID = 100;

const declaration = dynamicChartOf(pmvIso);
if (!declaration) {
  throw new Error("pmvIso no longer declares a dynamic chart");
}

const slot: SlotInputs = {
  values: new Map<Quantity, number>([
    [q.tdb, 26],
    [q.tr, 26],
    [q.v, 0.1],
    [q.met, 1.1],
    [q.clo, 0.5],
  ]),
  humidity: { mode: humidityMode.rh, value: 50 },
  temperature: { mode: temperatureMode.separate },
};

const request: ChartRequest = { model: pmvIso, slot, slotLabel: "Input 1", unitSystem: unitSystem.si };

function bands(spec: { traces: readonly { kind: string }[] }): BandTrace {
  const trace = spec.traces.find((entry): entry is BandTrace => entry.kind === "bands");
  if (!trace) {
    throw new Error("spec has no band surface");
  }
  return trace;
}

describe("dynamicSpec", () => {
  it("scans a GRID × GRID field across the declared axis ranges", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    expect(surface.x).toHaveLength(GRID);
    expect(surface.y).toHaveLength(GRID);
    expect(surface.z).toHaveLength(GRID);
    expect(surface.z[0]).toHaveLength(GRID);
    // The declaration draws tdb 10–40 and v 0–2, which is what the deployed
    // tool draws — not ISO 7730's applicability limits of 10–30 and 0–1.
    expect([surface.x[0], surface.x[GRID - 1]]).toEqual([10, 40]);
    expect([surface.y[0], surface.y[GRID - 1]]).toEqual([0, 2]);
  });

  it("bands by position in the model's own classification scale", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    const scale = pmvIso.model.tsv;
    expect(surface.bands.map((band) => band.label)).toEqual(scale?.intervals.map((interval) => interval.label));
    // Cold and still at the bottom left, warm and still at the bottom right.
    const coldest = surface.z[0][0];
    const warmest = surface.z[0][GRID - 1];
    expect(coldest).not.toBeNull();
    expect(warmest).not.toBeNull();
    expect(coldest).toBeLessThan(Number(warmest));
    expect(surface.bands.map((band) => band.color)).toHaveLength(7);
  });

  it("marks the value the user entered, not the derived one", () => {
    const spec = dynamicSpec(request, declaration, declaration.axes);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBe(26);
    // The library is called with vr = v_relative(v, met); the axis is the entered v.
    expect(marker?.y).toBe(0.1);
  });

  it("sweeps a swapped axis just as well", () => {
    const surface = bands(dynamicSpec(request, declaration, { x: q.clo, y: q.met }));
    expect([surface.x[0], surface.x[GRID - 1]]).toEqual([0, 2]);
    expect([surface.y[0], surface.y[GRID - 1]]).toEqual([1, 4]);
  });

  it("converts both axes to the displayed unit", () => {
    const spec = dynamicSpec({ ...request, unitSystem: unitSystem.ip }, declaration, declaration.axes);
    const surface = bands(spec);
    expect(surface.x[0]).toBeCloseTo(50, 10);
    expect(surface.y[GRID - 1]).toBeCloseTo(393.7, 2);
    expect(spec.layout.y.title).toContain("fpm");
  });

  it("carries one legend: every band plus the slot", () => {
    const spec = dynamicSpec(request, declaration, declaration.axes);
    expect(spec.legend).toHaveLength(8);
    expect(spec.legend.filter((entry) => entry.swatch === "marker")).toHaveLength(1);
  });
});

describe("a declared zones source", () => {
  // Phase 4's Adaptive is the real consumer; this stands in for it, and proves
  // the source is handed the resolved SI inputs and the drawn x extent.
  const zoned: DynamicDeclaration = {
    ...declaration,
    zones: ({ values, xRange }) => [
      {
        label: "80% acceptability",
        x: [xRange.min, xRange.max, xRange.max],
        y: [0, 0, requireValue(values, q.vr)],
      },
    ],
  };

  it("replaces the grid scan with the exact polygons", () => {
    const spec = dynamicSpec(request, zoned, zoned.axes);
    expect(spec.traces.find((trace) => trace.kind === "bands")).toBeUndefined();
    const polygon = spec.traces.find((trace): trace is PathTrace => trace.kind === "path");
    expect(polygon?.label).toBe("80% acceptability");
    expect(polygon?.x).toEqual([10, 40, 40]);
    // The slot's entered v = 0.1 at met = 1.1 reaches the source as vr.
    expect(polygon?.y[2]).toBeCloseTo(0.13, 12);
  });

  it("carries the polygons into the one legend, ahead of the slot marker", () => {
    const spec = dynamicSpec(request, zoned, zoned.axes);
    expect(spec.legend.map((entry) => entry.label)).toEqual(["80% acceptability", "Input 1"]);
  });
});

describe("dynamicAxisQuantities", () => {
  it("offers every entered quantity the chart declares a range for", () => {
    const separate = dynamicAxisQuantities(pmvIso, temperatureMode.separate);
    // Every entered quantity, humidity included: no standard limits `rh`, and
    // an axis range is a viewport rather than an applicability limit.
    expect(separate).toEqual(enteredQuantities(pmvIso, temperatureMode.separate));
    expect(separate).toContain(q.rh);
  });

  it("follows the temperature entry mode", () => {
    const operative = dynamicAxisQuantities(pmvIso, temperatureMode.operative);
    expect(operative).toContain(q.operative_tmp);
    expect(operative).not.toContain(q.tdb);
  });
});

describe("axes across a temperature entry mode switch", () => {
  it("sweeps the operative temperature when a remembered tdb axis no longer exists", () => {
    const operativeSlot: SlotInputs = {
      values: new Map<Quantity, number>([
        [q.operative_tmp, 26],
        [q.v, 0.1],
        [q.met, 1.1],
        [q.clo, 0.5],
      ]),
      humidity: { mode: humidityMode.rh, value: 50 },
      temperature: { mode: temperatureMode.operative },
    };
    // declaration.axes.x is tdb, which the slot no longer holds.
    const spec = dynamicSpec({ ...request, slot: operativeSlot }, declaration, declaration.axes);
    expect(spec.layout.x.title).toContain(q.operative_tmp.label);
    // The whole field would carry one band if the sweep were being discarded.
    const surface = bands(spec);
    expect(new Set(surface.z.flat()).size).toBeGreaterThan(1);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBe(26);
  });

  it("moves the second axis off the first when the mode maps both onto operative_tmp", () => {
    // tdb × tr is a chart under separate entry; under operative entry both
    // become operative_tmp, and a quantity against itself is not a chart.
    const axes = resolvedAxes(pmvIso, { x: q.tdb, y: q.tr }, temperatureMode.operative);
    expect(axes.x).toBe(q.operative_tmp);
    expect(axes.y).not.toBe(q.operative_tmp);
    expect(dynamicAxisQuantities(pmvIso, temperatureMode.operative)).toContain(axes.y);
  });

  it("leaves axes that do not collide alone", () => {
    expect(resolvedAxes(pmvIso, { x: q.tdb, y: q.v }, temperatureMode.separate)).toEqual({ x: q.tdb, y: q.v });
  });
});
