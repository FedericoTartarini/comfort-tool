/**
 * The scanned dynamic chart handed a Band list, as Explore asks for it
 * (ADR-0002 decisions 58 and 59): a band per coloured entry over slot 1's
 * scan, a legend entry per coloured band, and a readout naming the list's
 * band. Handed none it paints Comfort zones (`dynamicChart.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { classifyFromBins } from "jsthermalcomfort";
import { bandListOf, moveEdge, setColor, setLabel, type BandList } from "$lib/core/bands";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import { dynamicChartOf, isPolygonsChart, type DeclaredDynamicChart, type RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities } from "$lib/core/quantities";
import { startingSlot } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { unitSystem } from "$lib/core/unitSystem";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import type { BandTrace, ChartSpec, HoverGridTrace, HoverReadout } from "./chartSpec";
import { chartRequestFor } from "./chartTestRequests";
import { dynamicSpec } from "./dynamicChart";

const q = quantities;

/** `model`'s scanned dynamic chart. */
function scannedChartOf(model: RegisteredModel): DeclaredDynamicChart {
  const chart = dynamicChartOf(model);
  if (!chart || isPolygonsChart(chart)) {
    throw new Error(`${model.info.label} no longer declares a scanned dynamic chart`);
  }
  return chart;
}

const isoChart = scannedChartOf(pmvPpdIso);
const isoBands = bandListOf(pmvPpdIso.scan.classifier);
const isoRequest = chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso));

/** `model`'s dynamic chart of its starting slot, painting `bands`. */
function bandedSpec(bands: BandList, model: RegisteredModel = pmvPpdIso): ChartSpec {
  const chart = scannedChartOf(model);
  return dynamicSpec({ ...chartRequestFor(model, startingSlot(model)), bands }, chart, chart.axes);
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

/** The band a readout names, after its two axis lines and its output line; empty for none. */
function bandRead(readout: HoverReadout): string {
  return readout[3] ?? "";
}

/** Each band's label, colour and interval, as the list puts them, the first open below. */
function intervalsOf(list: BandList) {
  return list.labels.map((label, index) => ({
    label,
    color: list.colors[index],
    upper: list.edges[index],
    lower: index === 0 ? undefined : list.edges[index - 1],
  }));
}

describe("the scanned dynamic chart given a Band list", () => {
  const spec = bandedSpec(isoBands);

  it("paints one band per band of the list, with its label, colour and interval, and no Comfort zone", () => {
    expect(bandTraceOf(spec).bands).toEqual(intervalsOf(isoBands));
    expect(spec.traces.some((trace) => trace.kind === "contourZone")).toBe(false);
  });

  it("paints Heat Index's five bands in its own palette", () => {
    const heatBands = bandListOf(heatIndexRothfusz.scan.classifier);
    expect(bandTraceOf(bandedSpec(heatBands, heatIndexRothfusz)).bands).toEqual(intervalsOf(heatBands));
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
    const { z } = bandTraceOf(spec);
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
    expect(bandTraceOf(drawn).bands).toEqual(intervalsOf(edited));
    // -0.22 is below the moved Edge now, so in "Slightly Cool".
    expect(bandRead(hoverGridOf(drawn).hoverText[2][26])).toBe("Slightly Cool");
    expect(bandRead(hoverGridOf(bandedSpec(setLabel(isoBands, 3, "Comfortable"))).hoverText[2][26])).toBe("Comfortable");
  });

  it("paints a band without a colour nowhere, and still names it", () => {
    const hidden = setColor(isoBands, 3, undefined);
    const drawn = bandedSpec(hidden);
    expect(bandTraceOf(drawn).bands).toEqual(intervalsOf(isoBands).filter((band) => band.label !== "Neutral"));
    expect(drawn.legend.map((entry) => entry.label)).not.toContain("Neutral");
    expect(bandRead(hoverGridOf(drawn).hoverText[2][26])).toBe("Neutral");
  });

  it("paints Comfort zones and no band when given nothing", () => {
    const drawn = dynamicSpec(isoRequest, isoChart, isoChart.axes);
    expect(drawn.traces.some((trace) => trace.kind === "bands")).toBe(false);
    expect(drawn.traces.some((trace) => trace.kind === "contourZone")).toBe(true);
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
    return dynamicSpec({ ...isoRequest, model, unitSystem: system, bands }, isoChart, isoChart.axes);
  }

  const readAt = (value: number, bands: BandList = uneven) => bandRead(hoverGridOf(flat(value, bands)).hoverText[0][0]);

  it("carries the intervals through unevenly spaced and untouched", () => {
    expect(bandTraceOf(flat(5)).bands.map((band) => [band.lower, band.upper])).toEqual([
      [undefined, 0],
      [0, 10],
      [10, 40],
      [40, 100],
    ]);
  });

  it("keeps the number past the last Edge, where the fill ends and no band is named", () => {
    expect(bandTraceOf(flat(250)).z[0][0]).toBe(250);
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
    const trace = bandTraceOf(
      dynamicSpec({ ...isoRequest, model, unitSystem: unitSystem.ip, bands: uneven }, isoChart, isoChart.axes),
    );
    // 30 °C reads as 86 °F on an axis; here it stays 30.
    expect(trace.z[0][0]).toBe(30);
    expect(trace.bands.map((band) => band.upper)).toEqual(uneven.edges);
  });
});

describe("a Band list over several slots", () => {
  it("paints the first slot's scan and reads each slot's number and band", () => {
    const warm = enteredSlotFor(pmvPpdIso, { tdb: 30, tr: 30 });
    const request = chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso));
    const one = bandedSpec(isoBands);
    const two = dynamicSpec(
      { ...request, slots: [...request.slots, { ...slotBadges[1], slot: warm }], bands: isoBands },
      isoChart,
      isoChart.axes,
    );
    expect(bandTraceOf(two).z).toEqual(bandTraceOf(one).z);
    expect(hoverGridOf(two).hoverText[2][26]).toHaveLength(6);
  });
});
