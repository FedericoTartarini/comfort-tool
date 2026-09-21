import { describe, expect, it } from "vitest";
import { classifyFromBins, type ClassifierBins } from "jsthermalcomfort";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import { enteredQuantities, requireValue, type SlotInputs } from "$lib/core/libraryInputs";
import { dynamicChartOf, type DynamicDeclaration, type RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvIso } from "$lib/models/pmvIso";
import type { BandTrace, ChartRequest, PathTrace, PointTrace } from "./chartSpec";
import { dynamicAxisQuantities, dynamicSpec, resolvedAxes } from "./dynamicChart";

const q = quantities;

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

/** `at(-1)`, which this project's ES2020 target does not have. */
function last<T>(row: readonly T[]): T {
  return row[row.length - 1];
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
    // The declaration draws tdb 10–40 and v 0–2, which is what the deployed
    // tool draws — not ISO 7730's applicability limits of 10–30 and 0–1.
    expect([surface.x[0], last(surface.x)]).toEqual([10, 40]);
    expect([surface.y[0], last(surface.y)]).toEqual([0, 2]);
  });

  it("lists the declared classifier's own bands, in order", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    expect(surface.bands.map((band) => band.label)).toEqual([...declaration.bands.labels]);
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
        expect(surface.hoverText[row][column]).toBe(typeof category === "string" ? category : "");
      }
    }
    // A number rather than a band index: cold and fast-moving air sits well
    // below the first Edge, which no index ever does.
    expect(Number(last(surface.z)[0])).toBeLessThan(declaration.bands.edges[0]);
  });

  it("names every cell with a band of the declared classifier, or with nothing", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    const named = new Set(surface.hoverText.flat());
    for (const name of named) {
      expect(["", ...declaration.bands.labels]).toContain(name);
    }
    // The cold still corner and the warm still corner do not read alike.
    expect(surface.hoverText[0][0]).not.toBe(last(surface.hoverText[0]));
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
    expect([surface.x[0], last(surface.x)]).toEqual([0, 2]);
    expect([surface.y[0], last(surface.y)]).toEqual([1, 4]);
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
    expect(spec.legend).toHaveLength(8);
    expect(spec.legend.filter((entry) => entry.swatch === "marker")).toHaveLength(1);
  });
});

describe("a classifier whose Edges are unevenly spaced", () => {
  // Heat Index's Edges are 27, 32, 39, 51, 1000; Phase 4 registers it. Until
  // then this fixture is what proves the Edges reach the chart unevenly spaced
  // and untouched, and it pins the surface at values a real model reaches only
  // by accident: exactly on an Edge, past the last one, and no number at all.
  const uneven: ClassifierBins = {
    edges: [0, 10, 40, 100],
    labels: ["Low", "Mild", "High", "Extreme"],
    right: false,
  };

  const unevenChart: DynamicDeclaration = { ...declaration, bands: uneven };

  /** The surface of a model whose output is `value` at every point of the field. */
  function flat(value: number, chart: DynamicDeclaration = unevenChart): BandTrace {
    const model = { ...pmvIso, run: () => ({ pmv: value }) } satisfies RegisteredModel;
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
    expect(flat(100).hoverText[0][0]).toBe("");
    expect(numberAt(250)).toBe(250);
    expect(flat(250).hoverText[0][0]).toBe("");
  });

  it("empties only the cell where the model gives no number", () => {
    expect(numberAt(Number.NaN)).toBeNull();
  });

  it("leaves the surface and the Edges in the output's own unit when the axes are displayed in IP", () => {
    // They are never shown, only compared with each other, so nothing converts
    // them — the one exception to the chart spec's display-unit rule.
    const celsius: DynamicDeclaration = { ...unevenChart, output: q.operative_tmp };
    const model = { ...pmvIso, run: () => ({ operative_tmp: 30 }) } satisfies RegisteredModel;
    const surface = bands(dynamicSpec({ ...request, model, unitSystem: unitSystem.ip }, celsius, celsius.axes));
    // 30 °C reads as 86 °F on an axis; here it stays 30.
    expect(surface.z[0][0]).toBe(30);
    expect(surface.bands.map((band) => band.upper)).toEqual([...uneven.edges]);
  });

  it("reads the hover label off the library's classify-from-bins", () => {
    for (const value of [-5, 0, 5, 10, 25, 40, 99]) {
      expect(flat(value).hoverText[0][0]).toBe(classifyFromBins(value, uneven));
    }
    expect(flat(100).hoverText[0][0]).toBe("");
    expect(flat(Number.NaN).hoverText[0][0]).toBe("");
  });

  it("takes the inclusivity of the classifier rather than one of its own", () => {
    // The same value on the same Edge: left-inclusive opens the band above it,
    // right-inclusive closes the band below it.
    expect(flat(10).hoverText[0][0]).toBe("High");
    const rightInclusive: DynamicDeclaration = { ...unevenChart, bands: { ...uneven, right: true } };
    expect(flat(10, rightInclusive).hoverText[0][0]).toBe("Mild");
    // The hover label is the only place inclusivity still shows: the surface
    // keeps the number on either convention, and the last Edge bounds the fill
    // whichever side of it the classifier's last band claims.
    expect(flat(100, rightInclusive).hoverText[0][0]).toBe("Extreme");
    expect(numberAt(100)).toBe(100);
    expect(flat(100, rightInclusive).z[0][0]).toBe(100);
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
