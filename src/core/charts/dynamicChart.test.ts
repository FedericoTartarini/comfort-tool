import { describe, expect, it } from "vitest";
import { ADAPTIVE_ASHRAE_INFO, classifyFromBins, t_o, type ClassifierBins } from "jsthermalcomfort";
import { sensationPalette } from "$lib/core/bandPalette";
import { chartType } from "$lib/core/chartType";
import { defaultSlot, enteredSlotFor } from "$lib/core/declarationTestSlots";
import { temperatureMode } from "$lib/core/entryModes";
import { valuesReader } from "$lib/core/libraryInputs";
import {
  dynamicChartOf,
  isPolygonsChart,
  psychrometricChartOf,
  requireAxisRange,
  type PolygonsDeclaration,
  type RegisteredModel,
  type ScannedDeclaration,
} from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { enteredQuantities, withEnteredValues, type SlotInputs } from "$lib/core/slot";
import { unitSystem } from "$lib/core/unitSystem";
import { copy } from "$lib/text/copy";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { BandTrace, ChartRequest, ChartSpec, HoverGridTrace, HoverReadout, PathTrace, PointTrace } from "./chartSpec";
import { dynamicAxisQuantities, dynamicSpec, resolvedAxes } from "./dynamicChart";
import { psychrometricSpec } from "./psychrometricChart";

const q = quantities;

const declaration = dynamicChartOf(pmvPpdIso);
if (!declaration || isPolygonsChart(declaration)) {
  throw new Error("pmvPpdIso no longer declares a scanned dynamic chart");
}

const slot = enteredSlotFor(pmvPpdIso, { tdb: 26, tr: 26 });

const request: ChartRequest = { model: pmvPpdIso, slot, slotLabel: "Input 1", unitSystem: unitSystem.si };

/** PMV (ISO 7730)'s own air speed, which every slot here keeps. */
const { v } = valuesReader(defaultSlot(pmvPpdIso).values);

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

/** The band a scanned cell's readout names, after its two axis lines and its output line; empty for none. */
function bandRead(readout: HoverReadout): string {
  return readout[3] ?? "";
}

function bands(spec: { traces: readonly { kind: string }[] }): BandTrace {
  const trace = spec.traces.find((entry): entry is BandTrace => entry.kind === "bands");
  if (!trace) {
    throw new Error("spec has no band surface");
  }
  return trace;
}

describe("dynamicSpec", () => {
  it("scans a square field across the declared axis ranges", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    // One grid count for both axes, whatever it is; the surface and its hover
    // text follow the axes rather than a number restated here.
    const grid = surface.x.length;
    expect(surface.y).toHaveLength(grid);
    expect(surface.z).toHaveLength(grid);
    expect(surface.z[0]).toHaveLength(grid);
    expect(surface.hoverText).toHaveLength(grid);
    expect(surface.hoverText[0]).toHaveLength(grid);
    // The declared ranges, which are what the deployed tool draws, not
    // ISO 7730's applicability limits.
    expect([surface.x[0], last(surface.x)]).toEqual(declaredRangeOf(q.tdb));
    expect([surface.y[0], last(surface.y)]).toEqual(declaredRangeOf(q.v));
  });

  it("lists the declared classifier's own bands, in order", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    expect(surface.bands.map((band) => band.label)).toEqual([...declaration.bands.labels]);
  });

  it("paints each band by its position in the palette, Cold to Hot", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    expect(surface.bands.map((band) => band.color)).toEqual([...sensationPalette]);
  });

  it("puts a cold still point in a lower band than a warm one", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    // Cold and still at the bottom left, warm and still at the bottom right.
    const coldest = surface.z[0][0];
    const warmest = last(surface.z[0]);
    expect(coldest).not.toBeNull();
    expect(warmest).not.toBeNull();
    expect(coldest).toBeLessThan(Number(warmest));
  });

  it("gives every band the interval of the number it fills, the first open below", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    const { edges } = declaration.bands;
    expect(surface.bands.map((band) => [band.lower, band.upper])).toEqual(
      edges.map((edge, index) => [index === 0 ? undefined : edges[index - 1], edge]),
    );
  });

  it("carries the model's own number in every cell, which is what the hover label bins", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    for (const [row, values] of surface.z.entries()) {
      for (const [column, value] of values.entries()) {
        const category = value === null ? "" : classifyFromBins(value, declaration.bands);
        expect(bandRead(surface.hoverText[row][column])).toBe(typeof category === "string" ? category : "");
      }
    }
    // A number rather than a band index: cold and fast-moving air sits well
    // below the first Edge, which no index ever does.
    expect(Number(last(surface.z)[0])).toBeLessThan(declaration.bands.edges[0]);
  });

  it("names the cold still corner and the warm still corner with different bands", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    expect(bandRead(surface.hoverText[0][0])).not.toBe(bandRead(last(surface.hoverText[0])));
  });

  it("marks the value the user entered, not the derived one", () => {
    const marker = markerOf(dynamicSpec(request, declaration, declaration.axes));
    expect(marker?.x).toBe(26);
    // The library is called with vr = v_relative(v, met); the axis is the entered v.
    expect(marker?.y).toBe(v);
  });

  it("sweeps a swapped axis just as well", () => {
    const surface = bands(dynamicSpec(request, declaration, { x: q.clo, y: q.met }));
    expect([surface.x[0], last(surface.x)]).toEqual(declaredRangeOf(q.clo));
    expect([surface.y[0], last(surface.y)]).toEqual(declaredRangeOf(q.met));
  });

  it("converts both axes to the displayed unit", () => {
    const spec = dynamicSpec({ ...request, unitSystem: unitSystem.ip }, declaration, declaration.axes);
    const surface = bands(spec);
    expect(surface.x[0]).toBeCloseTo(50, 10);
    expect(last(surface.y)).toBeCloseTo(393.7, 2);
    expect(spec.layout.y.title).toContain("fpm");
  });

  it("carries one legend: every band plus the slot", () => {
    const spec = dynamicSpec(request, declaration, declaration.axes);
    expect(spec.legend).toHaveLength(declaration.bands.labels.length + 1);
    expect(spec.legend.filter((entry) => entry.swatch === "marker")).toHaveLength(1);
  });
});

describe("a classifier whose Edges are unevenly spaced", () => {
  // This fixture proves the Edges reach the chart unevenly spaced and
  // untouched, and it pins the surface at values a real model reaches only by
  // accident: exactly on an Edge, past the last one, and no number at all.
  const uneven: ClassifierBins = {
    edges: [0, 10, 40, 100],
    labels: ["Low", "Mild", "High", "Extreme"],
    right: false,
  };

  const unevenChart: ScannedDeclaration = { ...declaration, bands: uneven };

  /** The surface of a model whose output is `value` at every point of the field. */
  function flat(value: number, chart: ScannedDeclaration = unevenChart): BandTrace {
    const model = { ...pmvPpdIso, run: () => ({ pmv: value }) } satisfies RegisteredModel;
    return bands(dynamicSpec({ ...request, model }, chart, chart.axes));
  }

  function numberAt(value: number): number | null {
    return flat(value).z[0][0];
  }

  it("carries the intervals through unevenly spaced and untouched", () => {
    expect(flat(5).bands.map((band) => [band.lower, band.upper])).toEqual([
      [undefined, 0],
      [0, 10],
      [10, 40],
      [40, 100],
    ]);
  });

  it("hands the model's own number on, wherever it falls among the Edges", () => {
    expect(numberAt(-500)).toBe(-500);
    expect(numberAt(0)).toBe(0);
    expect(numberAt(5)).toBe(5);
    expect(numberAt(25)).toBe(25);
    expect(numberAt(99)).toBe(99);
  });

  it("keeps the number past the last Edge, where the fill ends and no band is named", () => {
    // The last Edge bounds the paint, not the surface: a kept number lets the
    // boundary there be interpolated like every other one, and the pointer
    // still reads no band anywhere beyond it.
    expect(numberAt(100)).toBe(100);
    expect(bandRead(flat(100).hoverText[0][0])).toBe("");
    expect(numberAt(250)).toBe(250);
    expect(bandRead(flat(250).hoverText[0][0])).toBe("");
  });

  it("empties only the cell where the model gives no number", () => {
    expect(numberAt(Number.NaN)).toBeNull();
  });

  it("reads a dash for the output where the model gives no number, as the results table does", () => {
    expect(flat(Number.NaN).hoverText[0][0][2]).toBe(`${q.pmv.label}: ${copy.notAvailable}`);
  });

  it("leaves the surface and the Edges in the output's own unit when the axes are displayed in IP", () => {
    // They are never shown, only compared with each other, so nothing converts
    // them — the one exception to the chart spec's display-unit rule.
    const celsius: ScannedDeclaration = { ...unevenChart, output: q.operative_tmp };
    const model = { ...pmvPpdIso, run: () => ({ operative_tmp: 30 }) } satisfies RegisteredModel;
    const surface = bands(dynamicSpec({ ...request, model, unitSystem: unitSystem.ip }, celsius, celsius.axes));
    // 30 °C reads as 86 °F on an axis; here it stays 30.
    expect(surface.z[0][0]).toBe(30);
    expect(surface.bands.map((band) => band.upper)).toEqual([...uneven.edges]);
  });

  it("reads the hover label off the library's classify-from-bins", () => {
    for (const value of [-5, 0, 5, 10, 25, 40, 99]) {
      expect(bandRead(flat(value).hoverText[0][0])).toBe(classifyFromBins(value, uneven));
    }
    expect(bandRead(flat(100).hoverText[0][0])).toBe("");
    expect(bandRead(flat(Number.NaN).hoverText[0][0])).toBe("");
  });

  it("takes the inclusivity of the classifier rather than one of its own", () => {
    // The same value on the same Edge: left-inclusive opens the band above it,
    // right-inclusive closes the band below it.
    expect(bandRead(flat(10).hoverText[0][0])).toBe("High");
    const rightInclusive: ScannedDeclaration = { ...unevenChart, bands: { ...uneven, right: true } };
    expect(bandRead(flat(10, rightInclusive).hoverText[0][0])).toBe("Mild");
    // The hover label is the only place inclusivity still shows: the surface
    // keeps the number on either convention, and the last Edge bounds the fill
    // whichever side of it the classifier's last band claims.
    expect(bandRead(flat(100, rightInclusive).hoverText[0][0])).toBe("Extreme");
    expect(numberAt(100)).toBe(100);
    expect(flat(100, rightInclusive).z[0][0]).toBe(100);
  });
});

describe("a declared zones source", () => {
  // Adaptive is the real consumer; this stands in for it on the registered
  // model's inputs and ranges, and proves the source is handed the resolved SI
  // inputs, read through the checked reader, and the drawn x range, and that
  // its operative axis is locked.
  const zoned: PolygonsDeclaration = {
    type: chartType.dynamic,
    axes: { x: q.operative_tmp, y: q.v },
    zones: ({ values, xRange }) => [
      {
        label: "80% acceptability",
        x: [xRange.min, xRange.max, xRange.max],
        y: [0, 0, values.vr],
      },
      { label: "90% acceptability", x: [20, 30, 30], y: [0, 0, 1] },
    ],
  };

  /** Dry-bulb and mean radiant apart, so their operative temperature is not either one. */
  const apart: SlotInputs = withEnteredValues(slot, new Map<Quantity, number>([
    [q.tdb, 24],
    [q.tr, 30],
  ]));

  it("replaces the grid scan with the exact polygons", () => {
    const spec = dynamicSpec(request, zoned, zoned.axes);
    expect(spec.traces.find((trace) => trace.kind === "bands")).toBeUndefined();
    const polygon = spec.traces.find((trace): trace is PathTrace => trace.kind === "path");
    expect(polygon?.label).toBe("80% acceptability");
    const [min, max] = declaredRangeOf(q.operative_tmp);
    expect(polygon?.x).toEqual([min, max, max]);
    // The slot's entered v = 0.1 at met = 1.1 reaches the source as vr.
    expect(polygon?.y[2]).toBeCloseTo(0.13, 12);
  });

  it("carries every polygon into the one legend, ahead of the slot marker", () => {
    const spec = dynamicSpec(request, zoned, zoned.axes);
    expect(spec.legend.map((entry) => entry.label)).toEqual(["80% acceptability", "90% acceptability", "Input 1"]);
  });

  it("stays on its declared operative axis under separate entry, where a scanned chart would map it to tdb", () => {
    const spec = dynamicSpec({ ...request, slot: apart }, zoned, zoned.axes);
    expect(spec.layout.x.title).toContain(q.operative_tmp.label);
    expect(spec.layout.x.range).toEqual(declaredRangeOf(q.operative_tmp));
    expect(spec.layout.y.title).toContain(q.v.label);
  });

  it("stays on its declared axes under operative entry", () => {
    const spec = dynamicSpec({ ...request, slot: enteredSlotFor(pmvPpdIso, { operative_tmp: 26 }) }, zoned, zoned.axes);
    expect(spec.layout.x.title).toContain(q.operative_tmp.label);
    expect(spec.layout.y.title).toContain(q.v.label);
  });

  it("is drawn on its declared axes whatever axes it is handed", () => {
    const spec = dynamicSpec(request, zoned, { x: q.clo, y: q.met });
    expect(spec.layout.x.title).toContain(q.operative_tmp.label);
    expect(spec.layout.y.title).toContain(q.v.label);
  });

  it("marks the library's t_o by the model's standard under separate entry, and the other axis as entered", () => {
    // At 0.6 m/s ISO 7726 weighs the air temperature by √(10v), so the marker
    // leaves the plain mean 27 the deployed chart puts it at.
    const moving = withEnteredValues(apart, new Map([[q.v, 0.6]]));
    const marker = markerOf(dynamicSpec({ ...request, slot: moving }, zoned, zoned.axes));
    expect(marker?.x).toBe(t_o(24, 30, 0.6, pmvPpdIso.standard));
    expect(marker?.x).not.toBeCloseTo(27, 1);
    expect(marker?.y).toBe(0.6);
  });

  it("marks the entered operative temperature under operative entry", () => {
    const marker = markerOf(dynamicSpec({ ...request, slot: enteredSlotFor(pmvPpdIso, { operative_tmp: 26 }) }, zoned, zoned.axes));
    expect(marker?.x).toBe(26);
    expect(marker?.y).toBe(v);
  });

  it("converts the polygons and the marker to the displayed unit", () => {
    const spec = dynamicSpec({ ...request, slot: apart, unitSystem: unitSystem.ip }, zoned, zoned.axes);
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
    const readsMissing: PolygonsDeclaration = {
      ...zoned,
      zones: ({ values }) => [{ label: "Unreached", x: [values.t_running_mean], y: [0] }],
    };
    expect(() => dynamicSpec(request, readsMissing, readsMissing.axes)).toThrow(q.t_running_mean.label);
  });

  it("offers no axis to pick", () => {
    const model = { ...pmvPpdIso, charts: [zoned] } satisfies RegisteredModel;
    expect(dynamicAxisQuantities(model, temperatureMode.separate)).toEqual([]);
    expect(dynamicAxisQuantities(model, temperatureMode.operative)).toEqual([]);
  });
});

describe("dynamicAxisQuantities", () => {
  it("offers every entered quantity the chart declares a range for", () => {
    const separate = dynamicAxisQuantities(pmvPpdIso, temperatureMode.separate);
    // Every entered quantity, humidity included: no standard limits `rh`, and
    // an axis range is a viewport rather than an applicability limit.
    expect(separate).toEqual(enteredQuantities(pmvPpdIso, temperatureMode.separate));
    expect(separate).toContain(q.rh);
  });

  it("follows the temperature entry mode", () => {
    const operative = dynamicAxisQuantities(pmvPpdIso, temperatureMode.operative);
    expect(operative).toContain(q.operative_tmp);
    expect(operative).not.toContain(q.tdb);
  });

  it("never offers a yes-or-no quantity, which has no range to sweep", () => {
    const model = {
      ...pmvPpdIso,
      inputs: [...pmvPpdIso.inputs, { quantity: q.compliance, value: 0 }],
    } satisfies RegisteredModel;
    expect(enteredQuantities(model, temperatureMode.separate)).toContain(q.compliance);
    expect(dynamicAxisQuantities(model, temperatureMode.separate)).not.toContain(q.compliance);
  });
});

describe("axes across a temperature entry mode switch", () => {
  it("sweeps the operative temperature when a remembered tdb axis no longer exists", () => {
    // declaration.axes.x is tdb, which the slot no longer holds.
    const spec = dynamicSpec({ ...request, slot: enteredSlotFor(pmvPpdIso, { operative_tmp: 26 }) }, declaration, declaration.axes);
    expect(spec.layout.x.title).toContain(q.operative_tmp.label);
    // The whole field would carry one band if the sweep were being discarded.
    const surface = bands(spec);
    expect(new Set(surface.z.flat()).size).toBeGreaterThan(1);
    expect(markerOf(spec)?.x).toBe(26);
  });

  it("moves the second axis off the first when the mode maps both onto operative_tmp", () => {
    // tdb × tr is a chart under separate entry; under operative entry both
    // become operative_tmp, and a quantity against itself is not a chart.
    const axes = resolvedAxes(pmvPpdIso, { x: q.tdb, y: q.tr }, temperatureMode.operative);
    expect(axes.x).toBe(q.operative_tmp);
    expect(axes.y).not.toBe(q.operative_tmp);
    expect(dynamicAxisQuantities(pmvPpdIso, temperatureMode.operative)).toContain(axes.y);
  });

  it("leaves axes that do not collide alone", () => {
    expect(resolvedAxes(pmvPpdIso, { x: q.tdb, y: q.v }, temperatureMode.separate)).toEqual({ x: q.tdb, y: q.v });
  });
});

const adaptiveChart = dynamicChartOf(adaptiveAshrae);
if (!adaptiveChart) {
  throw new Error("adaptiveAshrae no longer declares a dynamic chart");
}
const adaptiveRequest: ChartRequest = {
  model: adaptiveAshrae,
  slot: defaultSlot(adaptiveAshrae),
  slotLabel: "Input 1",
  unitSystem: unitSystem.si,
};

describe("Adaptive's running mean axis", () => {
  const bound = ADAPTIVE_ASHRAE_INFO.inputs.t_running_mean?.applicability;

  it("spans the library's applicability, 10 to 33.5 °C today", () => {
    const spec = dynamicSpec(adaptiveRequest, adaptiveChart, adaptiveChart.axes);
    expect(spec.layout.x.range).toEqual([bound?.min, bound?.max]);
    expect(spec.layout.x.range).toEqual([10, 33.5]);
  });

  it("converts the same bound in IP", () => {
    const spec = dynamicSpec({ ...adaptiveRequest, unitSystem: unitSystem.ip }, adaptiveChart, adaptiveChart.axes);
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
    const spec = dynamicSpec({ ...adaptiveRequest, model: moved }, adaptiveChart, adaptiveChart.axes);
    expect(spec.layout.x.range).toEqual([12, 30]);
  });
});

describe("Adaptive's acceptability zones", () => {
  // Nested Comfort zones on the Standard page, painted as the psychrometric
  // chart paints its own (ADR-0002 decision 37's note of 2026-09-28).
  const spec = dynamicSpec(adaptiveRequest, adaptiveChart, adaptiveChart.axes);
  const zones = zoneTraces(spec);
  const psychrometric = psychrometricChartOf(pmvPpdIso);
  if (!psychrometric) {
    throw new Error("pmvPpdIso no longer declares a psychrometric chart");
  }
  const psychrometricZones = zoneTraces(
    psychrometricSpec(
      { model: pmvPpdIso, slot: defaultSlot(pmvPpdIso), slotLabel: "Input 1", unitSystem: unitSystem.si },
      psychrometric,
    ),
  );

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

/** The filled paths: a chart's zones. */
function zoneTraces(spec: ChartSpec): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill !== undefined);
}

function rgbaOf(color: string | undefined): { rgb: string; alpha: number } {
  const match = /^rgba\((\d+, \d+, \d+), ([\d.]+)\)$/.exec(color ?? "");
  if (!match) {
    throw new Error(`${color} is not an rgba() fill`);
  }
  return { rgb: match[1], alpha: Number(match[2]) };
}

describe("the scanned chart's hover readout", () => {
  const pmvRequest: ChartRequest = { ...request, slot: defaultSlot(pmvPpdIso) };

  // Cell (row 2, column 26) of the 51 × 51 field at PMV (ISO 7730)'s defaults:
  // tdb 25.6 °C, v 0.08 m/s, where the model gives a PMV of -0.0618….
  it("reads both axis values, the output and the band, each number at two decimals at most", () => {
    const surface = bands(dynamicSpec(pmvRequest, declaration, declaration.axes));
    expect(surface.hoverText[2][26]).toEqual([
      "Dry-bulb air temperature: 25.6 °C",
      "Air speed: 0.08 m/s",
      "Predicted Mean Vote: -0.06",
      "Neutral",
    ]);
  });

  it("reads the axis values in the displayed unit", () => {
    const surface = bands(dynamicSpec({ ...pmvRequest, unitSystem: unitSystem.ip }, declaration, declaration.axes));
    expect(surface.hoverText[2][26]).toEqual([
      "Dry-bulb air temperature: 78.08 °F",
      "Air speed: 15.75 fpm",
      "Predicted Mean Vote: -0.06",
      "Neutral",
    ]);
  });
});

describe("a polygons chart's hover grid", () => {
  // Two nested rectangles on operative temperature × air speed, largest first.
  const rectangles: PolygonsDeclaration = {
    type: chartType.dynamic,
    axes: { x: q.operative_tmp, y: q.v },
    zones: () => [
      { label: "Outer", x: [15, 35, 35, 15], y: [0, 0, 1, 1] },
      { label: "Inner", x: [20, 30, 30, 20], y: [0.2, 0.2, 0.6, 0.6] },
    ],
  };

  function hoverGrid(spec: ChartSpec): HoverGridTrace {
    const trace = spec.traces.find((entry): entry is HoverGridTrace => entry.kind === "hoverGrid");
    if (!trace) {
      throw new Error("spec has no hover grid");
    }
    return trace;
  }

  // The field is operative temperature 10–40 °C and air speed 0–2 m/s, 51
  // samples each: column 25 is 25 °C, column 10 is 16 °C, column 5 is 13 °C,
  // and row 10 is 0.4 m/s.
  it("reads both axis values and the innermost zone the cell is in", () => {
    const grid = hoverGrid(dynamicSpec(request, rectangles, rectangles.axes));
    expect(grid.hoverText[10][25]).toEqual(["Operative temperature: 25 °C", "Air speed: 0.4 m/s", "Inner"]);
    expect(grid.hoverText[10][10]).toEqual(["Operative temperature: 16 °C", "Air speed: 0.4 m/s", "Outer"]);
  });

  it("reads only the axis values outside every zone", () => {
    const grid = hoverGrid(dynamicSpec(request, rectangles, rectangles.axes));
    expect(grid.hoverText[10][5]).toEqual(["Operative temperature: 13 °C", "Air speed: 0.4 m/s"]);
  });

  it("reads the axis values in the displayed unit, at the displayed grid", () => {
    const grid = hoverGrid(dynamicSpec({ ...request, unitSystem: unitSystem.ip }, rectangles, rectangles.axes));
    expect(grid.x[25]).toBeCloseTo(77, 10);
    expect(grid.y[10]).toBeCloseTo(78.74, 2);
    expect(grid.hoverText[10][25]).toEqual(["Operative temperature: 77 °F", "Air speed: 78.74 fpm", "Inner"]);
  });

  it("is the only trace that reads the pointer: the polygons and the marker do not", () => {
    const spec = dynamicSpec(request, rectangles, rectangles.axes);
    expect(spec.traces.filter((trace) => trace.hover !== "off")).toEqual([hoverGrid(spec)]);
  });

  it("names both of Adaptive's acceptability zones somewhere on the field", () => {
    const grid = hoverGrid(dynamicSpec(adaptiveRequest, adaptiveChart, adaptiveChart.axes));
    const named = new Set(grid.hoverText.flat().map((readout) => readout[2]));
    expect(named).toEqual(new Set([undefined, q.acceptability_80.label, q.acceptability_90.label]));
  });
});
