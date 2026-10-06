import { describe, expect, it } from "vitest";
import { ADAPTIVE_ASHRAE_INFO, t_o } from "jsthermalcomfort";
import { chartType } from "$lib/core/chartType";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import { valuesReader } from "$lib/core/libraryInputs";
import { requireAxisRange, type DeclaredAdaptiveChart, type RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { startingSlot, withEnteredValues, type Slot } from "$lib/core/slot";
import { unitSystem } from "$lib/core/unitSystem";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { adaptiveSpec } from "./adaptiveChart";
import type { ChartSpec, ContourZoneTrace, HoverGridTrace, PathTrace, PointTrace } from "./chartSpec";
import { chartRequestFor } from "./chartTestRequests";
import { psychrometricSpec } from "./psychrometricChart";

const q = quantities;

/** PMV (ISO 7730)'s declaration with `chart` as its one chart, on whose inputs and ranges a fixture chart is drawn. */
function isoDrawing(chart: DeclaredAdaptiveChart): RegisteredModel {
  return { ...pmvPpdIso, charts: [chart] };
}

const slot = enteredSlotFor(pmvPpdIso, { tdb: 26, tr: 26 });

/** PMV (ISO 7730)'s own air speed, which every slot here keeps. */
const { v } = valuesReader(startingSlot(pmvPpdIso).values);

/** The range `pmvPpdIso` declares for `quantity`, as the layout writes a range. */
function declaredRangeOf(quantity: Quantity): [number, number] {
  const { min, max } = requireAxisRange(pmvPpdIso, quantity);
  return [min, max];
}

function markerOf(spec: ChartSpec): PointTrace | undefined {
  return spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
}

function hoverGridOf(spec: ChartSpec): HoverGridTrace {
  const trace = spec.traces.find((entry): entry is HoverGridTrace => entry.kind === "hoverGrid");
  if (!trace) {
    throw new Error("spec has no hover grid");
  }
  return trace;
}

/** The adaptive chart's zones: its filled paths. */
function zoneTraces(spec: ChartSpec): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill !== undefined);
}

function contourZonesOf(spec: ChartSpec): ContourZoneTrace[] {
  return spec.traces.filter((trace): trace is ContourZoneTrace => trace.kind === "contourZone");
}

function rgbaOf(color: string | undefined): { rgb: string; alpha: number } {
  const match = /^rgba\((\d+, \d+, \d+), ([\d.]+)\)$/.exec(color ?? "");
  if (!match) {
    throw new Error(`${color} is not an rgba() fill`);
  }
  return { rgb: match[1], alpha: Number(match[2]) };
}

describe("a declared zones source", () => {
  // Adaptive is the real consumer; this stands in for it on PMV (ISO 7730)'s
  // inputs and ranges, and proves the source is handed the resolved SI
  // inputs, read through the checked reader, and the drawn x range, and that
  // its operative axis stays operative in every entry mode.
  const zoned: DeclaredAdaptiveChart = {
    type: chartType.adaptive,
    axes: { x: q.operative_tmp, y: q.v },
    comfortZones: ({ values, xRange }) => [
      {
        label: "80% acceptability",
        x: [xRange.min, xRange.max, xRange.max],
        y: [0, 0, values.vr],
      },
      { label: "90% acceptability", x: [20, 30, 30], y: [0, 0, 1] },
    ],
  };
  const model = isoDrawing(zoned);
  const request = chartRequestFor(model, slot);

  /** Dry-bulb and mean radiant apart, so their operative temperature is not either one. */
  const apart: Slot = withEnteredValues(slot, new Map<Quantity, number>([
    [q.tdb, 24],
    [q.tr, 30],
  ]));

  it("draws the exact polygons, with no grid scan", () => {
    const spec = adaptiveSpec(request);
    expect(spec.traces.find((trace) => trace.kind === "bands" || trace.kind === "contourZone")).toBeUndefined();
    const polygon = spec.traces.find((trace): trace is PathTrace => trace.kind === "path");
    expect(polygon?.label).toBe("80% acceptability");
    const [min, max] = declaredRangeOf(q.operative_tmp);
    expect(polygon?.x).toEqual([min, max, max]);
    // The slot's entered v = 0.1 at met = 1.1 reaches the source as vr.
    expect(polygon?.y[2]).toBeCloseTo(0.13, 12);
  });

  it("carries every polygon into the one legend, ahead of the slot marker", () => {
    const spec = adaptiveSpec(request);
    expect(spec.legend.map((entry) => entry.label)).toEqual(["80% acceptability", "90% acceptability", "Input 1"]);
  });

  it("stays on its declared operative axis under separate entry, where the dynamic chart would map it to tdb", () => {
    const spec = adaptiveSpec(chartRequestFor(model, apart));
    expect(spec.layout.x.title).toContain(q.operative_tmp.label);
    expect(spec.layout.x.range).toEqual(declaredRangeOf(q.operative_tmp));
    expect(spec.layout.y.title).toContain(q.v.label);
  });

  it("stays on its declared axes under operative entry", () => {
    const spec = adaptiveSpec(chartRequestFor(model, enteredSlotFor(pmvPpdIso, { operative_tmp: 26 })));
    expect(spec.layout.x.title).toContain(q.operative_tmp.label);
    expect(spec.layout.y.title).toContain(q.v.label);
  });

  it("marks the library's t_o by the model's standard under separate entry, and the other axis as entered", () => {
    // At 0.6 m/s ISO 7726 weighs the air temperature by √(10v), so the marker
    // leaves the plain mean 27 the deployed chart puts it at.
    const moving = withEnteredValues(apart, new Map([[q.v, 0.6]]));
    const marker = markerOf(adaptiveSpec(chartRequestFor(model, moving)));
    expect(marker?.x).toBe(t_o(24, 30, 0.6, pmvPpdIso.standard));
    expect(marker?.x).not.toBeCloseTo(27, 1);
    expect(marker?.y).toBe(0.6);
  });

  it("marks the entered operative temperature under operative entry", () => {
    const marker = markerOf(adaptiveSpec(chartRequestFor(model, enteredSlotFor(pmvPpdIso, { operative_tmp: 26 }))));
    expect(marker?.x).toBe(26);
    expect(marker?.y).toBe(v);
  });

  it("converts the polygons and the marker to the displayed unit", () => {
    const spec = adaptiveSpec(chartRequestFor(model, apart, unitSystem.ip));
    const polygon = spec.traces.find((trace): trace is PathTrace => trace.kind === "path");
    expect(polygon?.x[0]).toBeCloseTo(50, 10);
    expect(polygon?.x[1]).toBeCloseTo(104, 10);
    // 0.13 m/s of vr is 25.6 fpm.
    expect(polygon?.y[2]).toBeCloseTo(25.59, 2);
    const marker = markerOf(spec);
    expect(marker?.x).toBeCloseTo(80.6, 10);
    expect(marker?.y).toBeCloseTo(19.69, 2);
    expect(spec.layout.x.title).toContain("°F");
  });

  it("throws, naming it, when the source reads a quantity the slot does not hold", () => {
    const readsMissing = isoDrawing({
      ...zoned,
      comfortZones: ({ values }) => [{ label: "Unreached", x: [values.t_running_mean], y: [0] }],
    });
    expect(() => adaptiveSpec(chartRequestFor(readsMissing, slot))).toThrow(q.t_running_mean.label);
  });

  it("throws, naming the model, for a model that declares no adaptive chart", () => {
    expect(() => adaptiveSpec(chartRequestFor(pmvPpdIso, slot))).toThrow(pmvPpdIso.info.label);
  });
});

const adaptiveRequest = chartRequestFor(adaptiveAshrae, startingSlot(adaptiveAshrae));

describe("Adaptive's running mean axis", () => {
  const bound = ADAPTIVE_ASHRAE_INFO.inputs.t_running_mean?.applicability;

  it("spans the library's applicability, 10 to 33.5 °C today", () => {
    const spec = adaptiveSpec(adaptiveRequest);
    expect(spec.layout.x.range).toEqual([bound?.min, bound?.max]);
    expect(spec.layout.x.range).toEqual([10, 33.5]);
  });

  it("converts the same bound in IP", () => {
    const spec = adaptiveSpec({ ...adaptiveRequest, unitSystem: unitSystem.ip });
    expect(spec.layout.x.range[0]).toBeCloseTo(50, 10);
    expect(spec.layout.x.range[1]).toBeCloseTo(92.3, 10);
  });

  it("moves with the library's bound, since the declaration writes none of its own", () => {
    const info = ADAPTIVE_ASHRAE_INFO;
    const moved = {
      ...adaptiveAshrae,
      info: {
        ...info,
        inputs: { ...info.inputs, t_running_mean: { ...info.inputs.t_running_mean, applicability: { min: 12, max: 30 } } },
      },
    } satisfies RegisteredModel;
    const spec = adaptiveSpec({ ...adaptiveRequest, model: moved });
    expect(spec.layout.x.range).toEqual([12, 30]);
  });
});

describe("Adaptive's acceptability zones", () => {
  // Nested Comfort zones on the Standard page, painted as the psychrometric
  // chart paints its own (ADR-0002 decision 37's note of 2026-09-28).
  const spec = adaptiveSpec(adaptiveRequest);
  const zones = zoneTraces(spec);
  const psychrometricZones = contourZonesOf(psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso))));

  it("fills both, largest first, in the psychrometric zones' one hue, opacity rising inwards", () => {
    expect(zones.map((zone) => zone.label)).toEqual([q.acceptability_80.label, q.acceptability_90.label]);
    const fills = zones.map((zone) => rgbaOf(zone.fill));
    const hue = rgbaOf(psychrometricZones[0]?.fill).rgb;
    expect(fills.map((fill) => fill.rgb)).toEqual([hue, hue]);
    expect(fills[0]?.alpha).toBeGreaterThan(0);
    expect(fills[1]?.alpha).toBeGreaterThan(fills[0]?.alpha ?? Infinity);
    // The innermost zone keeps the fill a lone zone has, on either chart.
    expect(fills[1]?.alpha).toBeCloseTo(rgbaOf(psychrometricZones[psychrometricZones.length - 1]?.fill).alpha, 12);
  });

  it("outlines both in the psychrometric chart's zone line", () => {
    const line = { color: psychrometricZones[0]?.color, width: psychrometricZones[0]?.width };
    expect(zones.map((zone) => ({ color: zone.color, width: zone.width }))).toEqual([line, line]);
  });

  it("gives each a legend swatch in its own fill", () => {
    const swatches = spec.legend.filter((entry) => zones.some((zone) => zone.label === entry.label));
    expect(swatches).toEqual(zones.map((zone) => ({ label: zone.label, swatch: "fill", color: zone.fill })));
  });
});

describe("the adaptive chart's hover grid", () => {
  // Two nested rectangles on operative temperature × air speed, largest first.
  const rectangles = isoDrawing({
    type: chartType.adaptive,
    axes: { x: q.operative_tmp, y: q.v },
    comfortZones: () => [
      { label: "Outer", x: [15, 35, 35, 15], y: [0, 0, 1, 1] },
      { label: "Inner", x: [20, 30, 30, 20], y: [0.2, 0.2, 0.6, 0.6] },
    ],
  });
  const request = chartRequestFor(rectangles, slot);

  // The field is operative temperature 10–40 °C and air speed 0–2 m/s, 51
  // samples each: column 25 is 25 °C, column 10 is 16 °C, column 5 is 13 °C,
  // and row 10 is 0.4 m/s.
  it("reads both axis values and the innermost zone the cell is in", () => {
    const grid = hoverGridOf(adaptiveSpec(request));
    expect(grid.hoverText[10][25]).toEqual(["Operative temperature: 25 °C", "Air speed: 0.4 m/s", "Inner"]);
    expect(grid.hoverText[10][10]).toEqual(["Operative temperature: 16 °C", "Air speed: 0.4 m/s", "Outer"]);
  });

  it("reads only the axis values outside every zone", () => {
    const grid = hoverGridOf(adaptiveSpec(request));
    expect(grid.hoverText[10][5]).toEqual(["Operative temperature: 13 °C", "Air speed: 0.4 m/s"]);
  });

  it("reads the axis values in the displayed unit, at the displayed grid", () => {
    const grid = hoverGridOf(adaptiveSpec({ ...request, unitSystem: unitSystem.ip }));
    expect(grid.x[25]).toBeCloseTo(77, 10);
    expect(grid.y[10]).toBeCloseTo(78.74, 2);
    expect(grid.hoverText[10][25]).toEqual(["Operative temperature: 77 °F", "Air speed: 78.74 fpm", "Inner"]);
  });

  it("is the only trace that reads the pointer: the polygons and the marker do not", () => {
    const spec = adaptiveSpec(request);
    expect(spec.traces.filter((trace) => trace.hover !== "off")).toEqual([hoverGridOf(spec)]);
  });

  it("names both of Adaptive's acceptability zones somewhere on the field", () => {
    const grid = hoverGridOf(adaptiveSpec(adaptiveRequest));
    const named = new Set(grid.hoverText.flat().map((readout) => readout[2]));
    expect(named).toEqual(new Set([undefined, q.acceptability_80.label, q.acceptability_90.label]));
  });
});
