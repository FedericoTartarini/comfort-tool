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
import { dynamicChartOf, type DeclaredDynamicChart, type RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";
import { startingSlot } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { unitSystem } from "$lib/core/unitSystem";
import { copy } from "$lib/text/copy";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { ChartSpec, ContourFillTrace, ContourLineTrace, HoverGridTrace, HoverReadout } from "./chartSpec";
import { chartRequestFor } from "./chartTestRequests";
import { dynamicSpec } from "./dynamicChart";

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

function fillsOf(spec: ChartSpec): ContourFillTrace[] {
  return spec.traces.filter((trace): trace is ContourFillTrace => trace.kind === "contourFill");
}

function linesOf(spec: ChartSpec): ContourLineTrace[] {
  return spec.traces.filter((trace): trace is ContourLineTrace => trace.kind === "contourLine");
}

/** The first fill, which carries slot 1's scanned field. */
function surfaceOf(spec: ChartSpec): ContourFillTrace {
  const [fill] = fillsOf(spec);
  if (!fill) {
    throw new Error("spec has no fill");
  }
  return fill;
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

/** Each fill's label, colour and interval. */
function intervalsOf(spec: ChartSpec) {
  return fillsOf(spec).map(({ label, color, lower, upper }) => ({ label, color, lower, upper }));
}

/** Band `index` of `list` as a fill: its label and colour, from its lower Edge, the first open below, up to `top`. */
function bandFillOf(list: BandList, index: number, top: number) {
  return { label: list.labels[index], color: list.colors[index], lower: index === 0 ? undefined : list.edges[index - 1], upper: top };
}

/** Every band of `list`, each coloured, as a fill: all contiguous, so each fills up to the last Edge. */
function contiguousFillsOf(list: BandList) {
  return list.labels.map((_, index) => bandFillOf(list, index, last(list.edges)));
}

/** Each line's label, colour, width, interval and hover. */
function strokesOf(spec: ChartSpec) {
  return linesOf(spec).map(({ label, color, width, lower, upper, hover }) => ({ label, color, width, lower, upper, hover }));
}

/** Every band of `list`, painted or not, as a line at its own upper Edge with no lower value, in the band line. */
function edgeLinesOf(list: BandList) {
  return list.labels.map((label, index) => ({
    label,
    color: chartInk.bandLine,
    width: chartInk.bandLineWidth,
    lower: undefined,
    upper: list.edges[index],
    hover: "off",
  }));
}

/** The slot markers, in drawing order. */
function markersOf(spec: ChartSpec) {
  return spec.traces.filter((trace) => trace.kind === "point");
}

describe("the scanned dynamic chart given a Band list", () => {
  const spec = bandedSpec(isoBands);

  it("paints one fill per band of the list, from its lower Edge up to the last, and no Comfort zone", () => {
    expect(intervalsOf(spec)).toEqual(contiguousFillsOf(isoBands));
    expect(linesOf(spec).map((line) => line.color)).not.toContain(slotBadges[0].hue.zoneLine);
  });

  it("strokes every band's own upper Edge once, in the band line, read by nothing", () => {
    expect(strokesOf(spec)).toEqual(edgeLinesOf(isoBands));
  });

  it("draws the fills, the Edge lines, the hover grid, then the marker", () => {
    expect(spec.traces).toEqual([...fillsOf(spec), ...linesOf(spec), hoverGridOf(spec), ...markersOf(spec)]);
    expect(markersOf(spec)).toHaveLength(1);
  });

  it("paints Heat Index's five bands in its own palette", () => {
    const heatBands = bandListOf(heatIndexRothfusz.scan.classifier);
    expect(intervalsOf(bandedSpec(heatBands, heatIndexRothfusz))).toEqual(contiguousFillsOf(heatBands));
    expect(heatBands.labels).toHaveLength(5);
  });

  it("carries one legend: every band, then the slot", () => {
    expect(spec.legend).toEqual([
      ...isoBands.labels.map((label, index) => ({ label, swatch: "fill", color: isoBands.colors[index] })),
      { label: slotBadges[0].name, swatch: "marker", color: slotBadges[0].hue.marker },
    ]);
  });

  it("reads both axis values, the number and the list's band in every cell, off the hover grid alone", () => {
    expect(spec.traces.filter((trace) => trace.hover !== "off").map((trace) => trace.kind)).toEqual(["hoverGrid"]);
    const { hoverText } = hoverGridOf(spec);
    const { z } = surfaceOf(spec);
    z.forEach((row, yIndex) =>
      row.forEach((value, xIndex) => {
        const band = value === null ? Number.NaN : classifyFromBins(value, isoBands);
        expect(bandRead(hoverText[yIndex][xIndex])).toBe(typeof band === "string" ? band : "");
      }),
    );
    // Cell (row 2, column 26) at PMV (ISO 7730)'s defaults: PMV -0.2209….
    expect(hoverText[2][26]).toEqual([
      "Dry-bulb air temperature: 25.6 °C",
      "Air speed: 0.08 m/s",
      "Predicted Mean Vote: -0.22",
      "Neutral",
    ]);
  });

  it("follows an edited list: a moved Edge, a new label", () => {
    const edited = setLabel(moveEdge(isoBands, 2, -0.1), 3, "Comfortable");
    const drawn = bandedSpec(edited);
    expect(intervalsOf(drawn)).toEqual(contiguousFillsOf(edited));
    expect(strokesOf(drawn)).toEqual(edgeLinesOf(edited));
    // -0.22 is below the moved Edge now, so in "Slightly Cool".
    expect(bandRead(hoverGridOf(drawn).hoverText[2][26])).toBe("Slightly Cool");
    expect(bandRead(hoverGridOf(bandedSpec(setLabel(isoBands, 3, "Comfortable"))).hoverText[2][26])).toBe("Comfortable");
  });

  it("paints a band without a colour nowhere, the fills below it stopping at its lower Edge, strokes its Edge, and still names it", () => {
    const hidden = setColor(isoBands, 3, undefined);
    const drawn = bandedSpec(hidden);
    expect(intervalsOf(drawn)).toEqual(
      hidden.labels.flatMap((_, index) =>
        index < 3 ? [bandFillOf(hidden, index, hidden.edges[2])] : index > 3 ? [bandFillOf(hidden, index, last(hidden.edges))] : [],
      ),
    );
    expect(strokesOf(drawn)).toEqual(edgeLinesOf(hidden));
    expect(drawn.legend.map((entry) => entry.label)).not.toContain("Neutral");
    expect(bandRead(hoverGridOf(drawn).hoverText[2][26])).toBe("Neutral");
  });

  it("paints Comfort zones and no band when given nothing", () => {
    const drawn = dynamicSpec(isoRequest, isoChart.axes);
    const zoneLabels = [...pmvPpdIso.scan.comfortZones].sort((a, b) => b.limit - a.limit).map((zone) => copy.zoneLegend(zone));
    expect(fillsOf(drawn).map((fill) => fill.label)).toEqual(zoneLabels);
    expect(linesOf(drawn).map((line) => line.label)).toEqual(zoneLabels);
    expect(linesOf(drawn).map((line) => line.color)).not.toContain(chartInk.bandLine);
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

  /** The spec of a model whose PMV is `value` at every point of the field, painting `bands`. */
  function flat(value: number, bands: BandList = uneven, system = unitSystem.si): ChartSpec {
    const model = { ...pmvPpdIso, run: () => ({ pmv: value }) } satisfies RegisteredModel;
    return dynamicSpec({ ...isoRequest, model, unitSystem: system, bands }, isoChart.axes);
  }

  const readAt = (value: number, bands: BandList = uneven) => bandRead(hoverGridOf(flat(value, bands)).hoverText[0][0]);

  it("carries the intervals through unevenly spaced and untouched", () => {
    expect(fillsOf(flat(5)).map((fill) => [fill.lower, fill.upper])).toEqual([
      [undefined, 100],
      [0, 100],
      [10, 100],
      [40, 100],
    ]);
    // An uncoloured band ends the run below it at its own lower Edge.
    const gapped = setColor(uneven, 2, undefined);
    expect(fillsOf(flat(5, gapped)).map((fill) => [fill.lower, fill.upper])).toEqual([
      [undefined, 10],
      [0, 10],
      [40, 100],
    ]);
    // Every band strokes its own upper Edge, the uncoloured one too.
    expect(linesOf(flat(5, gapped)).map((line) => line.upper)).toEqual(uneven.edges);
  });

  it("keeps the number past the last Edge, where the fill ends and no band is named", () => {
    expect(surfaceOf(flat(250)).z[0][0]).toBe(250);
    expect(readAt(100)).toBe("");
    expect(readAt(250)).toBe("");
    expect(readAt(Number.NaN)).toBe("");
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

  it("leaves the surface and the Edges in the output's own unit when the axes are displayed in IP", () => {
    // They are never shown, only compared with each other, so nothing converts
    // them — the one exception to the chart spec's display-unit rule.
    const model = {
      ...pmvPpdIso,
      scan: { ...pmvPpdIso.scan, output: q.operative_tmp },
      run: () => ({ operative_tmp: 30 }),
    } satisfies RegisteredModel;
    const fills = fillsOf(dynamicSpec({ ...isoRequest, model, unitSystem: unitSystem.ip, bands: uneven }, isoChart.axes));
    // 30 °C reads as 86 °F on an axis; here it stays 30.
    expect(fills[0].z[0][0]).toBe(30);
    expect(fills.map((fill) => fill.lower)).toEqual([undefined, ...uneven.edges.slice(0, -1)]);
    expect(fills.map((fill) => fill.upper)).toEqual(uneven.edges.map(() => last(uneven.edges)));
  });
});

describe("a Band list over several slots", () => {
  it("paints the first slot's scan and reads each slot's number and band", () => {
    const warm = enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 30 });
    const request = chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso));
    const one = bandedSpec(isoBands);
    const two = dynamicSpec(
      { ...request, slots: [...request.slots, { ...slotBadges[1], slot: warm }], bands: isoBands },
      isoChart.axes,
    );
    expect(fillsOf(two).map((fill) => fill.z)).toEqual(fillsOf(one).map((fill) => fill.z));
    expect(hoverGridOf(two).hoverText[2][26]).toHaveLength(6);
  });
});
