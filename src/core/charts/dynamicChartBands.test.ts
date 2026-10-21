/**
 * The scanned dynamic chart handed a Band list, as Explore asks for it
 * (ADR-0002 decisions 58, 59 and 62): a fill per coloured band over slot 1's
 * scan, up to the top of the coloured bands contiguous above it, a line at
 * every band's upper Edge, a legend entry per coloured band, and a readout
 * naming the list's band. Handed none it paints Comfort zones
 * (`dynamicChart.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { classifyFromBins } from "jsthermalcomfort";
import { bandListOf, moveEdge, setColor, setLabel, type BandList } from "$lib/core/bands";
import { chartInk } from "$lib/core/bandPalette";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import { dynamicChartOf, type AxisRange, type DeclaredDynamicChart, type RegisteredModel } from "$lib/core/modelDeclaration";
import { palette } from "$lib/core/palette";
import { quantities } from "$lib/core/quantities";
import { startingSlot } from "$lib/core/slot";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import { copy } from "$lib/text/copy";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { ChartRequest } from "./chartRequest";
import type { ChartSpec, HoverGridTrace, HoverReadout, PathTrace } from "./chartSpec";
import { bandFillsOf as fillsOf, bandLinesOf as linesOf, heldBetween, numbersAlong, regionOf, zoneFillsOf, zoneLinesOf } from "./chartTestPaths";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
import { dynamicScanFrameFor, dynamicSpec } from "./dynamicChart";
import { scannedField } from "./scan";

const q = quantities;

/** `model`'s dynamic chart. */
function dynamicOf(model: RegisteredModel): DeclaredDynamicChart {
  const chart = dynamicChartOf(model);
  if (!chart) {
    throw new Error(`${model.info.label} no longer declares a dynamic chart`);
  }
  return chart;
}

const isoChart = dynamicOf(pmvPpdIso);
const isoBands = bandListOf(pmvPpdIso.scan.classifier);
const isoRequest = chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso));

/** `model`'s dynamic chart of its starting slot, painting `bands`. */
function bandedSpec(bands: BandList, model: RegisteredModel = pmvPpdIso): ChartSpec {
  const chart = dynamicOf(model);
  return dynamicSpec({ ...chartRequestFor(model, startingSlot(model)), bands }, chart.axes);
}

/** Slot 1's scanned number in `request`'s dynamic chart, `[yIndex][xIndex]`, in SI: what the Bands are painted over. */
function scannedValuesOf(request: ChartRequest): readonly (readonly number[])[] {
  const frame = dynamicScanFrameFor(request.model, dynamicOf(request.model).axes, request.entryModes, request.atmosphericPressure);
  return scannedField(frame, request.slots[0].slot).values;
}

/** `at(-1)`, which this project's ES2020 target does not have. */
function last<T>(row: readonly T[]): T {
  return row[row.length - 1];
}

function hoverGridOf(spec: ChartSpec): HoverGridTrace {
  const trace = spec.traces.find((entry): entry is HoverGridTrace => entry.kind === "hoverGrid");
  if (!trace) {
    throw new Error("spec has no hover grid");
  }
  return trace;
}

/** The band a readout names, after its two axis lines and its output line; empty for none. */
function bandRead(readout: HoverReadout): string {
  return readout[3] ?? "";
}

/** A fill's label, colour and the interval of the number it holds. */
interface BandFill {
  readonly label: string;
  readonly color: string | undefined;
  readonly lower?: number;
  readonly upper: number;
}

/** Band `index` of `list` as a fill: its label and colour, from its lower Edge, the first open below, up to `top`. */
function bandFillOf(list: BandList, index: number, top: number): BandFill {
  return { label: list.labels[index], color: list.colors[index], lower: index === 0 ? undefined : list.edges[index - 1], upper: top };
}

/** Every band of `list`, each coloured, as a fill: all contiguous, so each fills up to the last Edge. */
function contiguousFillsOf(list: BandList): BandFill[] {
  return list.labels.map((_, index) => bandFillOf(list, index, last(list.edges)));
}

/**
 * Whether `spec`'s fills are `expected`, in order: each one's label and
 * colour, and at every grid point of the scan whether it holds the point
 * exactly where the scanned number `values` lies in its interval, at the
 * list's inclusivity `right`.
 */
function expectFills(spec: ChartSpec, expected: readonly BandFill[], values: readonly (readonly number[])[], right: boolean): void {
  const fills = fillsOf(spec);
  expect(fills.map(({ label, color }) => ({ label, color }))).toEqual(expected.map(({ label, color }) => ({ label, color })));
  fills.forEach((fill, index) => expect(regionOf(spec, fill)).toEqual(heldBetween(values, expected[index], right)));
}

/** Each line's label, colour, width and hover. */
function strokesOf(spec: ChartSpec) {
  return linesOf(spec).map(({ label, color, width, hover }) => ({ label, color, width, hover }));
}

/** Every band of `list`, painted or not, as a line in the band line. */
function edgeLinesOf(list: BandList) {
  return list.labels.map((label) => ({ label, color: chartInk.bandLine, width: chartInk.bandLineWidth, hover: "off" }));
}

/**
 * Whether each of `spec`'s lines crosses where the scanned number `values`
 * crosses `list`'s Edge of the same band: the number, interpolated linearly
 * at every vertex as the boundary is, is that Edge.
 */
function expectEdgesCrossed(spec: ChartSpec, list: BandList, values: readonly (readonly number[])[]): void {
  linesOf(spec).forEach((line, index) => {
    for (const number of numbersAlong(spec, line, values)) {
      expect(number).toBeCloseTo(list.edges[index], 9);
    }
  });
}

/** The slot markers, in drawing order. */
function markersOf(spec: ChartSpec) {
  return spec.traces.filter((trace) => trace.kind === "point");
}

describe("the scanned dynamic chart given a Band list", () => {
  const spec = bandedSpec(isoBands);
  const values = scannedValuesOf(isoRequest);

  it("paints one fill per band of the list, holding the points from its lower Edge up to the last, and no Comfort zone", () => {
    expectFills(spec, contiguousFillsOf(isoBands), values, isoBands.right);
    expect(linesOf(spec).map((line) => line.color)).not.toContain(chartInk.zoneLine(palette.slots[0]));
  });

  it("strokes every band's own upper Edge once, in the band line, read by nothing, where the number crosses it", () => {
    expect(strokesOf(spec)).toEqual(edgeLinesOf(isoBands));
    expectEdgesCrossed(spec, isoBands, values);
    // The Edges the field reaches are drawn: Neutral's two among them.
    expect(linesOf(spec)[2].pieces.length).toBeGreaterThan(0);
    expect(linesOf(spec)[3].pieces.length).toBeGreaterThan(0);
  });

  it("draws the fills, the Edge lines, the hover grid, then the marker", () => {
    expect(spec.traces).toEqual([...fillsOf(spec), ...linesOf(spec), hoverGridOf(spec), ...markersOf(spec)]);
    expect(markersOf(spec)).toHaveLength(1);
  });

  it("paints Heat Index's five bands in its own palette, over its own scan", () => {
    const heatBands = bandListOf(heatIndexRothfusz.scan.classifier);
    const heatValues = scannedValuesOf(chartRequestFor(heatIndexRothfusz, startingSlot(heatIndexRothfusz)));
    const drawn = bandedSpec(heatBands, heatIndexRothfusz);
    expectFills(drawn, contiguousFillsOf(heatBands), heatValues, heatBands.right);
    expectEdgesCrossed(drawn, heatBands, heatValues);
    expect(heatBands.labels).toHaveLength(5);
  });

  it("carries one legend: every band, then the slot", () => {
    expect(spec.legend).toEqual([
      ...isoBands.labels.map((label, index) => ({ label, swatch: "fill", color: isoBands.colors[index] })),
      { label: "Input", swatch: "marker", color: chartInk.marker(palette.slots[0]) },
    ]);
  });

  it("reads both axis values, the number and the list's band in every cell, off the hover grid alone", () => {
    expect(spec.traces.filter((trace) => trace.hover !== "off").map((trace) => trace.kind)).toEqual(["hoverGrid"]);
    const { hoverText } = hoverGridOf(spec);
    values.forEach((row, yIndex) =>
      row.forEach((value, xIndex) => {
        const band = classifyFromBins(value, isoBands);
        expect(bandRead(hoverText[yIndex][xIndex])).toBe(typeof band === "string" ? band : "");
      }),
    );
    // Cell (row 4, column 32) at PMV (ISO 7730)'s defaults: PMV -0.1459….
    expect(hoverText[4][32]).toEqual([
      "Dry-bulb air temperature: 26 °C",
      "Air speed: 0.08 m/s",
      "Predicted Mean Vote: -0.15",
      "Neutral",
    ]);
  });

  it("follows an edited list: a moved Edge, a new label", () => {
    const edited = setLabel(moveEdge(isoBands, 2, -0.1), 3, "Comfortable");
    const drawn = bandedSpec(edited);
    expectFills(drawn, contiguousFillsOf(edited), values, edited.right);
    expect(strokesOf(drawn)).toEqual(edgeLinesOf(edited));
    expectEdgesCrossed(drawn, edited, values);
    // -0.15 is below the moved Edge now, so in "Slightly Cool".
    expect(bandRead(hoverGridOf(drawn).hoverText[4][32])).toBe("Slightly Cool");
    expect(bandRead(hoverGridOf(bandedSpec(setLabel(isoBands, 3, "Comfortable"))).hoverText[4][32])).toBe("Comfortable");
  });

  it("paints a band without a colour nowhere, the fills below it stopping at its lower Edge, strokes its Edge, and still names it", () => {
    const hidden = setColor(isoBands, 3, undefined);
    const drawn = bandedSpec(hidden);
    expectFills(
      drawn,
      hidden.labels.flatMap((_, index) =>
        index < 3 ? [bandFillOf(hidden, index, hidden.edges[2])] : index > 3 ? [bandFillOf(hidden, index, last(hidden.edges))] : [],
      ),
      values,
      hidden.right,
    );
    expect(strokesOf(drawn)).toEqual(edgeLinesOf(hidden));
    expectEdgesCrossed(drawn, hidden, values);
    expect(drawn.legend.map((entry) => entry.label)).not.toContain("Neutral");
    expect(bandRead(hoverGridOf(drawn).hoverText[4][32])).toBe("Neutral");
  });

  it("names a coloured band with an empty label as unlabelled in its legend entry and on hover, a labelled one unchanged", () => {
    const drawn = bandedSpec(setLabel(isoBands, 3, ""));
    expect(drawn.legend.slice(0, isoBands.labels.length).map((entry) => entry.label)).toEqual(
      isoBands.labels.map((label, index) => (index === 3 ? "Unlabelled band" : label)),
    );
    expect(bandRead(hoverGridOf(drawn).hoverText[4][32])).toBe("Unlabelled band");
    expect(bandRead(hoverGridOf(drawn).hoverText[4][0])).toBe(bandRead(hoverGridOf(spec).hoverText[4][0]));
  });

  it("paints Comfort zones and no band when given nothing", () => {
    const drawn = dynamicSpec(isoRequest, isoChart.axes);
    const zoneLabels = [...pmvPpdIso.scan.comfortZones].sort((a, b) => b.limit - a.limit).map((zone) => copy.zoneLegend(zone));
    expect(zoneFillsOf(drawn).map((fill) => fill.label)).toEqual(zoneLabels);
    expect(zoneLinesOf(drawn).map((line) => line.label)).toEqual(zoneLabels);
    expect(linesOf(drawn)).toEqual([]);
  });
});

describe("a Band list whose Edges are unevenly spaced", () => {
  // This fixture proves the Edges reach the chart unevenly spaced and
  // untouched, and it pins the readout at values a real model reaches only by
  // accident: exactly on an Edge, past the last one, and no number at all.
  const uneven: BandList = {
    edges: [0, 10, 40, 100],
    labels: ["Low", "Mild", "High", "Extreme"],
    right: false,
    colors: ["#000001", "#000002", "#000003", "#000004"],
  };

  /**
   * The axis ranges the fixture models here are drawn over: their own, so a
   * change to PMV (ISO 7730)'s demonstration ranges moves no Edge here.
   */
  const fixtureAxisRanges: readonly AxisRange[] = [
    { quantity: q.tdb, min: 10, max: 40 },
    { quantity: q.v, min: 0, max: 2 },
  ];

  /** A model whose PMV is `pmvAt` of each point's dry-bulb temperature, on the dynamic chart's tdb × v. */
  function modelOf(pmvAt: (tdb: number) => number): RegisteredModel {
    return { ...pmvPpdIso, axisRanges: fixtureAxisRanges, run: (values) => ({ pmv: pmvAt(values.tdb), warnings: [] }) } satisfies RegisteredModel;
  }

  /** The spec of a model whose PMV is `value` at every point of the field, painting `bands`. */
  function flat(value: number, bands: BandList = uneven, system = unitSystem.si): ChartSpec {
    return dynamicSpec({ ...isoRequest, model: modelOf(() => value), unitSystem: system, bands }, isoChart.axes);
  }

  const readAt = (value: number, bands: BandList = uneven) => bandRead(hoverGridOf(flat(value, bands)).hoverText[0][0]);

  // PMV rising 4 a degree, so the Edges 0, 10, 40 and 100 are crossed at 12.5, 15, 22.5 and 37.5 °C, none a sample.
  const sloped = modelOf((tdb) => 4 * tdb - 50);
  const slopedRequest = { ...isoRequest, model: sloped };
  const slopedValues = scannedValuesOf(slopedRequest);
  const slopedSpec = (bands: BandList, system: UnitSystem = unitSystem.si) => dynamicSpec({ ...slopedRequest, unitSystem: system, bands }, isoChart.axes);

  it("carries the intervals through unevenly spaced and untouched", () => {
    expectFills(slopedSpec(uneven), contiguousFillsOf(uneven), slopedValues, uneven.right);
    expectEdgesCrossed(slopedSpec(uneven), uneven, slopedValues);
    // Each Edge one straight line up the chart at its own temperature.
    expect(linesOf(slopedSpec(uneven)).map((line) => line.pieces.map((piece) => [...new Set(piece.x.map((x) => x.toFixed(9)))]))).toEqual(
      [12.5, 15, 22.5, 37.5].map((tdb) => [[tdb.toFixed(9)]]),
    );
    // An uncoloured band ends the run below it at its own lower Edge.
    const gapped = setColor(uneven, 2, undefined);
    expectFills(slopedSpec(gapped), [bandFillOf(gapped, 0, 10), bandFillOf(gapped, 1, 10), bandFillOf(gapped, 3, 100)], slopedValues, gapped.right);
    // Every band strokes its own upper Edge, the uncoloured one too.
    expect(linesOf(slopedSpec(gapped)).map((line) => line.label)).toEqual(uneven.labels);
    expectEdgesCrossed(slopedSpec(gapped), gapped, slopedValues);
  });

  /** `spec`'s plot frame as one ring, counter-clockwise from its bottom left. */
  function frameRingOf(spec: ChartSpec) {
    const { x, y } = hoverGridOf(spec);
    return { x: [x[0], last(x), last(x), x[0]], y: [y[0], y[0], last(y), last(y)] };
  }

  it("fills the whole field for each band a flat number's band is part of, and strokes no Edge", () => {
    // 25 is in "High": every band up to it fills the field, since each fills up to the last Edge, and "Extreme" nothing.
    const drawn = flat(25);
    expect(fillsOf(drawn).map((fill) => fill.pieces)).toEqual([[frameRingOf(drawn)], [frameRingOf(drawn)], [frameRingOf(drawn)], []]);
    expect(linesOf(drawn).map((line) => line.pieces)).toEqual([[], [], [], []]);
  });

  it("paints no fill where the number is past the last Edge or missing, and names no band there", () => {
    for (const value of [250, Number.NaN]) {
      expect(fillsOf(flat(value)).map((fill) => fill.pieces)).toEqual([[], [], [], []]);
    }
    expect(readAt(100)).toBe("");
    expect(readAt(250)).toBe("");
    expect(readAt(Number.NaN)).toBe("");
  });

  it("ends a band where the number ends, found on the run to a bisection step", () => {
    // No number below 20 °C, which no sample is: 19.6 and 20.2 are the two either side.
    const ending = modelOf((tdb) => (tdb < 20 ? Number.NaN : 4 * tdb - 50));
    const drawn = dynamicSpec({ ...isoRequest, model: ending, bands: uneven }, isoChart.axes);
    // "Low" fills every band up to the last Edge, so from 20 °C, where the number starts at 30, to 37.5 °C.
    const [low] = fillsOf(drawn);
    const step = (40 - 10) / 50;
    const cut = low.pieces.flatMap((ring) => ring.x).filter((x) => x < 20.2);
    expect(cut.length).toBeGreaterThan(0);
    for (const x of cut) {
      expect(Math.abs(x - 20)).toBeLessThanOrEqual(step / 256);
    }
  });

  it("reads the band off the library's classify-from-bins, with the list's own inclusivity", () => {
    for (const value of [-5, 0, 5, 10, 25, 40, 99]) {
      expect(readAt(value)).toBe(classifyFromBins(value, uneven));
    }
    // The same value on the same Edge: left-inclusive opens the band above it,
    // right-inclusive closes the band below it.
    expect(readAt(10)).toBe("High");
    expect(readAt(10, { ...uneven, right: true })).toBe("Mild");
    expect(readAt(100, { ...uneven, right: true })).toBe("Extreme");
  });

  it("draws the bands in IP at their SI vertices converted, holding the same points", () => {
    const si = slopedSpec(uneven);
    const ip = slopedSpec(uneven, unitSystem.ip);
    const [xUnit, yUnit] = [displayUnitFor(q.tdb, unitSystem.ip), displayUnitFor(q.v, unitSystem.ip)];
    const converted = (trace: PathTrace) => trace.pieces.map((piece) => ({ x: piece.x.map(xUnit.fromSi), y: piece.y.map(yUnit.fromSi) }));
    expect(fillsOf(ip).map((fill) => fill.pieces)).toEqual(fillsOf(si).map(converted));
    expect(linesOf(ip).map((line) => line.pieces)).toEqual(linesOf(si).map(converted));
    expect(fillsOf(ip).map((fill) => regionOf(ip, fill))).toEqual(fillsOf(si).map((fill) => regionOf(si, fill)));
  });

  it("compares the Edges with the number in the output's own unit when the axes are displayed in IP", () => {
    // An operative temperature equal to the dry-bulb one, banded in °C: each
    // Edge is crossed at its own temperature, shown in °F on the axis.
    const model = {
      ...pmvPpdIso,
      axisRanges: fixtureAxisRanges,
      scan: { ...pmvPpdIso.scan, output: q.operative_tmp },
      run: (values) => ({ operative_tmp: values.tdb, warnings: [] }),
    } satisfies RegisteredModel;
    const degrees: BandList = { ...uneven, edges: [15, 20, 30, 100] };
    const lines = linesOf(dynamicSpec({ ...isoRequest, model, unitSystem: unitSystem.ip, bands: degrees }, isoChart.axes));
    const xs = lines.map((line) => [...new Set(line.pieces.flatMap((piece) => piece.x.map((x) => x.toFixed(6))))]);
    expect(xs).toEqual([[(59).toFixed(6)], [(68).toFixed(6)], [(86).toFixed(6)], []]);
  });
});

describe("a Band list over several slots", () => {
  it("paints the first slot's scan and reads each slot's number and band", () => {
    const warm = enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 30 });
    const one = bandedSpec(isoBands);
    const two = dynamicSpec({ ...chartRequestForSlots(pmvPpdIso, [startingSlot(pmvPpdIso), warm]), bands: isoBands }, isoChart.axes);
    expect(fillsOf(two).map((fill) => fill.pieces)).toEqual(fillsOf(one).map((fill) => fill.pieces));
    expect(linesOf(two).map((line) => line.pieces)).toEqual(linesOf(one).map((line) => line.pieces));
    expect(hoverGridOf(two).hoverText[4][32]).toHaveLength(6);
  });
});
