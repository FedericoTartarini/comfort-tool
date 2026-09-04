import { describe, expect, it } from "vitest";
import { io } from "jsthermalcomfort";
import type { Quantity } from "jsthermalcomfort/io";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import type { SlotInputs } from "$lib/core/libraryInputs";
import { dynamicChartOf } from "$lib/core/modelDeclaration";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvIso } from "$lib/models/pmvIso";
import type { BandTrace, ChartRequest, PointTrace } from "./chartSpec";
import { dynamicAxisQuantities, dynamicSpec } from "./dynamicChart";

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
  it("scans a GRID × GRID field across the model's applicability range", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    expect(surface.x).toHaveLength(GRID);
    expect(surface.y).toHaveLength(GRID);
    expect(surface.z).toHaveLength(GRID);
    expect(surface.z[0]).toHaveLength(GRID);
    // ISO 7730 limits tdb to 10–30 and v to 0–1.
    expect([surface.x[0], surface.x[GRID - 1]]).toEqual([10, 30]);
    expect([surface.y[0], surface.y[GRID - 1]]).toEqual([0, 1]);
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
    expect([surface.y[0], surface.y[GRID - 1]]).toEqual([0, 4]);
  });

  it("converts both axes to the displayed unit", () => {
    const spec = dynamicSpec({ ...request, unitSystem: unitSystem.ip }, declaration, declaration.axes);
    const surface = bands(spec);
    expect(surface.x[0]).toBeCloseTo(50, 10);
    expect(surface.y[GRID - 1]).toBeCloseTo(196.85, 2);
    expect(spec.layout.y.title).toContain("fpm");
  });

  it("carries one legend: every band plus the slot", () => {
    const spec = dynamicSpec(request, declaration, declaration.axes);
    expect(spec.legend).toHaveLength(8);
    expect(spec.legend.filter((entry) => entry.swatch === "marker")).toHaveLength(1);
  });
});

describe("dynamicAxisQuantities", () => {
  it("offers the entered quantities the model declares a range for", () => {
    const separate = dynamicAxisQuantities(pmvIso, temperatureMode.separate);
    expect(separate).toContain(q.tdb);
    expect(separate).toContain(q.tr);
    // ISO 7730 sets no relative-humidity limit, so there is nothing to sweep between.
    expect(separate).not.toContain(q.rh);
  });

  it("follows the temperature entry mode", () => {
    const operative = dynamicAxisQuantities(pmvIso, temperatureMode.operative);
    expect(operative).toContain(q.t_o);
    expect(operative).not.toContain(q.tdb);
  });
});

describe("axes across a temperature entry mode switch", () => {
  it("sweeps the operative temperature when a remembered tdb axis no longer exists", () => {
    const operativeSlot: SlotInputs = {
      values: new Map<Quantity, number>([
        [q.t_o, 26],
        [q.v, 0.1],
        [q.met, 1.1],
        [q.clo, 0.5],
      ]),
      humidity: { mode: humidityMode.rh, value: 50 },
      temperature: { mode: temperatureMode.operative },
    };
    // declaration.axes.x is tdb, which the slot no longer holds.
    const spec = dynamicSpec({ ...request, slot: operativeSlot }, declaration, declaration.axes);
    expect(spec.layout.x.title).toContain(q.t_o.label);
    // The whole field would carry one band if the sweep were being discarded.
    const surface = bands(spec);
    expect(new Set(surface.z.flat()).size).toBeGreaterThan(1);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBe(26);
  });
});
