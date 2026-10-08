import { describe, expect, it } from "vitest";
import { ADAPTIVE_ASHRAE_INFO, t_o } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import { chartType } from "$lib/core/chartType";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import { valuesReader } from "$lib/core/libraryInputs";
import { requireAxisRange, type DeclaredAdaptiveChart, type RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { startingSlot, withEnteredValues, type Slot } from "$lib/core/slot";
import { unitSystem } from "$lib/core/unitSystem";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { adaptive_ashrae_zone, type AdaptivePoint } from "$lib/temporary-library/adaptive_ashrae_zone";
import { adaptiveSpec } from "./adaptiveChart";
import type { ChartSpec, ContourFillTrace, ContourLineTrace, HoverGridTrace, PathTrace, PointTrace, Trace } from "./chartSpec";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
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

/** The adaptive chart's zone fills: its filled paths. */
function fillsOf(spec: ChartSpec): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill !== undefined);
}

/** Its limit lines: its stroked paths, which fill nothing. */
function linesOf(spec: ChartSpec): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill === undefined);
}

/** A scanned chart's zone fills. */
function contourFillsOf(spec: ChartSpec): ContourFillTrace[] {
  return spec.traces.filter((trace): trace is ContourFillTrace => trace.kind === "contourFill");
}

/** A scanned chart's zone lines. */
function contourLinesOf(spec: ChartSpec): ContourLineTrace[] {
  return spec.traces.filter((trace): trace is ContourLineTrace => trace.kind === "contourLine");
}

function rgbaOf(color: string | undefined): { rgb: string; alpha: number } {
  const match = /^rgba\((\d+, \d+, \d+), ([\d.]+)\)$/.exec(color ?? "");
  if (!match) {
    throw new Error(`${color} is not an rgba() fill`);
  }
  return { rgb: match[1], alpha: Number(match[2]) };
}

describe("a declared limits source", () => {
  // Adaptive is the real consumer; this stands in for it on PMV (ISO 7730)'s
  // inputs and ranges, and proves the source is handed the resolved SI
  // inputs, read through the checked reader, and the drawn x range, and that
  // its operative axis stays operative in every entry mode.
  const zoned: DeclaredAdaptiveChart = {
    type: chartType.adaptive,
    axes: { x: q.operative_tmp, y: q.v },
    limits: ({ values, xRange }) => [
      {
        label: "80% acceptability",
        lower: [{ x: xRange.min, y: 0 }, { x: xRange.max, y: 0 }],
        upper: [{ x: xRange.min, y: values.vr }, { x: xRange.max, y: values.vr }],
      },
      { label: "90% acceptability", lower: [{ x: 20, y: 0 }, { x: 30, y: 0 }], upper: [{ x: 20, y: 1 }, { x: 30, y: 1 }] },
    ],
  };
  const model = isoDrawing(zoned);
  const request = chartRequestFor(model, slot);

  /** Dry-bulb and mean radiant apart, so their operative temperature is not either one. */
  const apart: Slot = withEnteredValues(slot, new Map<Quantity, number>([
    [q.tdb, 24],
    [q.tr, 30],
  ]));

  it("fills between the lines it is handed and strokes them, with no grid scan", () => {
    const spec = adaptiveSpec(request);
    expect(spec.traces.find((trace) => trace.kind === "contourFill" || trace.kind === "contourLine")).toBeUndefined();
    const [fill] = fillsOf(spec);
    const [upper, lower] = linesOf(spec);
    expect(fill?.label).toBe("80% acceptability");
    const [min, max] = declaredRangeOf(q.operative_tmp);
    expect(fill?.x).toEqual([min, max, max, min]);
    expect(upper?.x).toEqual([min, max]);
    expect(lower?.y).toEqual([0, 0]);
    // The slot's entered v = 0.1 at met = 1.1 reaches the source as vr.
    expect(fill?.y[0]).toBeCloseTo(0.13, 12);
    expect(upper?.y[0]).toBeCloseTo(0.13, 2);
  });

  it("carries every zone into the one legend, ahead of the slot marker", () => {
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

  it("converts the fill, the lines and the marker to the displayed unit", () => {
    const spec = adaptiveSpec(chartRequestFor(model, apart, unitSystem.ip));
    const [fill] = fillsOf(spec);
    const [upper] = linesOf(spec);
    expect(fill?.x[0]).toBeCloseTo(50, 10);
    expect(fill?.x[1]).toBeCloseTo(104, 10);
    expect(upper?.x[1]).toBeCloseTo(104, 10);
    // 0.13 m/s of vr is 25.6 fpm.
    expect(fill?.y[0]).toBeCloseTo(25.59, 2);
    expect(upper?.y[0]).toBeCloseTo(25.59, 2);
    const marker = markerOf(spec);
    expect(marker?.x).toBeCloseTo(80.6, 10);
    expect(marker?.y).toBeCloseTo(19.69, 2);
    expect(spec.layout.x.title).toContain("°F");
  });

  it("throws, naming it, when the source reads a quantity the slot does not hold", () => {
    const readsMissing = isoDrawing({
      ...zoned,
      limits: ({ values }) => [{ label: "Unreached", lower: [{ x: values.t_running_mean, y: 0 }], upper: [] }],
    });
    expect(() => adaptiveSpec(chartRequestFor(readsMissing, slot))).toThrow(q.t_running_mean.label);
  });

  it("throws, naming the model, for a model that declares no adaptive chart", () => {
    expect(() => adaptiveSpec(chartRequestFor(pmvPpdIso, slot))).toThrow(pmvPpdIso.info.label);
  });
});

const adaptiveRequest = chartRequestFor(adaptiveAshrae, startingSlot(adaptiveAshrae));

/** Adaptive's own air speed, at which `adaptiveRequest` draws. */
const { v: startingAirSpeed } = valuesReader(startingSlot(adaptiveAshrae).values);

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

/** Adaptive at its defaults but `v`, slot 1. */
function adaptiveAt(airSpeed: number): Slot {
  return enteredSlotFor(adaptiveAshrae, { v: airSpeed });
}

/** The temporary library's two bands for Adaptive's chart at `airSpeed`, over the drawn running means, 80 % first. */
function libraryBandsAt(airSpeed: number) {
  const { min, max } = requireAxisRange(adaptiveAshrae, q.t_running_mean);
  const zone = adaptive_ashrae_zone({ v: airSpeed, t_running_mean_range: [min, max] });
  return [zone.acceptability_80, zone.acceptability_90];
}

/** A limit of the temporary library's as a path's two coordinate lists. */
function pathOf(points: readonly AdaptivePoint[]): { x: number[]; y: number[] } {
  return { x: points.map((point) => point.t_running_mean), y: points.map((point) => point.operative_tmp) };
}

/** Whether `path` has a segment with both ends at `x`: a side running down it. */
function runsDownAt(path: PathTrace, x: number): boolean {
  return path.x.some((value, index) => index > 0 && value === x && path.x[index - 1] === x);
}

/** Whether `path` has two consecutive vertices at one x: a step. */
function holdsStep(path: PathTrace): boolean {
  return path.x.some((value, index) => index > 0 && value === path.x[index - 1]);
}

/** Which layer of the one drawing order a trace is laid in: a fill, an outline, or its own kind. */
function layerOf(trace: Trace): string {
  if (trace.kind === "path") {
    return trace.fill === undefined ? "outline" : "fill";
  }
  return trace.kind;
}

describe("Adaptive's acceptability zones", () => {
  // Nested Comfort zones on the Standard page, painted as the psychrometric
  // chart paints its own (ADR-0002 decision 37's note of 2026-09-28), each
  // a fill between its two limit lines and the two lines stroked (decision 62).
  const spec = adaptiveSpec(adaptiveRequest);
  const fills = fillsOf(spec);
  const lines = linesOf(spec);
  const psychrometric = psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)));
  const psychrometricFills = contourFillsOf(psychrometric);
  const psychrometricLines = contourLinesOf(psychrometric);
  const { min, max } = requireAxisRange(adaptiveAshrae, q.t_running_mean);

  it("gives each zone one fill of no stroke, closed from the upper limit out and the lower limit back", () => {
    expect(fills.map((fill) => ({ label: fill.label, width: fill.width }))).toEqual([
      { label: q.acceptability_80.label, width: 0 },
      { label: q.acceptability_90.label, width: 0 },
    ]);
    expect(fills.map((fill) => ({ x: fill.x, y: fill.y }))).toEqual(
      libraryBandsAt(startingAirSpeed).map((band) => pathOf([...band.upper_limit, ...[...band.lower_limit].reverse()])),
    );
  });

  it("strokes each zone's upper and lower limit as two open paths, the temporary library's own", () => {
    expect(lines.map((line) => ({ label: line.label, x: line.x, y: line.y }))).toEqual(
      libraryBandsAt(startingAirSpeed).flatMap((band, index) =>
        [band.upper_limit, band.lower_limit].map((limit) => ({ label: fills[index]?.label, ...pathOf(limit) })),
      ),
    );
  });

  it.each([0, startingAirSpeed, 0.9])("strokes no side down either end of the running means at %s m/s, where the fill closes", (airSpeed) => {
    const drawn = adaptiveSpec(chartRequestFor(adaptiveAshrae, adaptiveAt(airSpeed)));
    for (const line of linesOf(drawn)) {
      expect(line.x[0]).toBe(min);
      expect(line.x[line.x.length - 1]).toBe(max);
      expect(runsDownAt(line, min) || runsDownAt(line, max)).toBe(false);
    }
    for (const fill of fillsOf(drawn)) {
      expect(runsDownAt(fill, max)).toBe(true);
    }
  });

  it("strokes the step in each upper limit at 0.9 m/s, and none in still air", () => {
    const moving = linesOf(adaptiveSpec(chartRequestFor(adaptiveAshrae, adaptiveAt(0.9))));
    const uppers = libraryBandsAt(0.9).map((band) => pathOf(band.upper_limit));
    expect(moving.filter(holdsStep).map((line) => ({ x: line.x, y: line.y }))).toEqual(uppers);
    expect(linesOf(adaptiveSpec(chartRequestFor(adaptiveAshrae, adaptiveAt(0)))).filter(holdsStep)).toEqual([]);
  });

  it("fills both, largest first, in the psychrometric zones' one hue, opacity rising inwards", () => {
    const rgbas = fills.map((fill) => rgbaOf(fill.fill));
    const hue = rgbaOf(psychrometricFills[0]?.color).rgb;
    expect(rgbas.map((fill) => fill.rgb)).toEqual([hue, hue]);
    expect(rgbas[0]?.alpha).toBeGreaterThan(0);
    expect(rgbas[1]?.alpha).toBeGreaterThan(rgbas[0]?.alpha ?? Infinity);
    // The innermost zone keeps the fill a lone zone has, on either chart.
    expect(rgbas[1]?.alpha).toBeCloseTo(rgbaOf(psychrometricFills[psychrometricFills.length - 1]?.color).alpha, 12);
  });

  it("strokes the four limit lines in the psychrometric chart's zone line", () => {
    const line = { color: psychrometricLines[0]?.color, width: psychrometricLines[0]?.width };
    expect(lines.map((path) => ({ color: path.color, width: path.width }))).toEqual([line, line, line, line]);
    expect(line.width).toBe(chartInk.zoneLineWidth);
  });

  it("gives each zone a legend swatch in its own fill, then the slot", () => {
    expect(spec.legend).toEqual([
      ...fills.map((fill) => ({ label: fill.label, swatch: "fill", color: fill.fill })),
      expect.objectContaining({ label: "Input 1", swatch: "marker" }),
    ]);
  });

  it.each([1, 3])("lays every fill, then every outline, then the hover grid, then the markers, for %s slot(s)", (count) => {
    const slots = [startingSlot(adaptiveAshrae), adaptiveAt(0.9), adaptiveAt(1.2)].slice(0, count);
    const layers = adaptiveSpec(chartRequestForSlots(adaptiveAshrae, slots)).traces.map(layerOf);
    expect(layers).toEqual([
      ...Array(2 * count).fill("fill"),
      ...Array(4 * count).fill("outline"),
      "hoverGrid",
      ...Array(count).fill("point"),
    ]);
  });
});

describe("the adaptive chart's hover grid", () => {
  // Two nested rectangles on operative temperature × air speed, largest first.
  const rectangles = isoDrawing({
    type: chartType.adaptive,
    axes: { x: q.operative_tmp, y: q.v },
    limits: () => [
      { label: "Outer", lower: [{ x: 15, y: 0 }, { x: 35, y: 0 }], upper: [{ x: 15, y: 1 }, { x: 35, y: 1 }] },
      { label: "Inner", lower: [{ x: 20, y: 0.2 }, { x: 30, y: 0.2 }], upper: [{ x: 20, y: 0.6 }, { x: 30, y: 0.6 }] },
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

  it("names a zone at a cell on its limit line, the model's limits being inclusive", () => {
    // Row 15 is 0.6 m/s, the inner rectangle's upper line; row 25 is 1 m/s, the outer one's.
    const grid = hoverGridOf(adaptiveSpec(request));
    expect(grid.hoverText[15][25][2]).toBe("Inner");
    expect(grid.hoverText[25][25][2]).toBe("Outer");
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

  it("is the only trace that reads the pointer: the fills, the lines and the marker do not", () => {
    const spec = adaptiveSpec(request);
    expect(spec.traces.filter((trace) => trace.hover !== "off")).toEqual([hoverGridOf(spec)]);
  });

  it("names both of Adaptive's acceptability zones somewhere on the field", () => {
    const grid = hoverGridOf(adaptiveSpec(adaptiveRequest));
    const named = new Set(grid.hoverText.flat().map((readout) => readout[2]));
    expect(named).toEqual(new Set([undefined, q.acceptability_80.label, q.acceptability_90.label]));
  });

  it.each(["lowest", "highest"] as const)(
    "names Adaptive's zones at the %s running mean drawn, whose closing side is no limit",
    (end) => {
      // The model's limits are inclusive and the closing side is where the
      // chart stops, so a cell on it between the limits is in the zone.
      const grid = hoverGridOf(adaptiveSpec(adaptiveRequest));
      const column = end === "lowest" ? 0 : grid.x.length - 1;
      const at = (limit: readonly AdaptivePoint[]) => (end === "lowest" ? limit[0] : limit[limit.length - 1])?.operative_tmp ?? NaN;
      const labels = [q.acceptability_80.label, q.acceptability_90.label];
      const bands = libraryBandsAt(startingAirSpeed);
      const innermost = grid.y.map((y) =>
        bands
          .map((band, index) => (at(band.lower_limit) <= y && y <= at(band.upper_limit) ? labels[index] : undefined))
          .filter((label) => label !== undefined)
          .slice(-1)[0],
      );
      expect(new Set(innermost)).toEqual(new Set([undefined, ...labels]));
      expect(grid.hoverText.map((row) => row[column]?.[2])).toEqual(innermost);
    },
  );
});
