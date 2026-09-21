import { describe, expect, it } from "vitest";
import { classifyFromBins, type ClassifierBins } from "jsthermalcomfort";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import { enteredQuantities, requireValue, type SlotInputs } from "$lib/core/libraryInputs";
import { dynamicChartOf, type DynamicDeclaration, type RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { unitSystem } from "$lib/core/unitSystem";
import { pmvIso } from "$lib/models/pmvIso";
import { BAND_SCALE_FLOOR, type BandTrace, type ChartRequest, type PathTrace, type PointTrace } from "./chartSpec";
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

  it("keeps every cell on the band-position scale the colours are mapped over", () => {
    const surface = bands(dynamicSpec(request, declaration, declaration.axes));
    // The whole surface has to stay inside the scale or the chart paints off
    // the end of its own colours.
    for (const row of surface.z) {
      for (const position of row) {
        if (position === null) continue;
        expect(position).toBeGreaterThanOrEqual(BAND_SCALE_FLOOR);
        expect(position).toBeLessThanOrEqual(surface.bands.length - 1);
      }
    }
    // Cold and fast-moving air is several bands below the first Edge, so this
    // chart really does reach the floor rather than passing the check vacuously.
    expect(last(surface.z)[0]).toBe(BAND_SCALE_FLOOR);
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
  // then this fixture is what proves an evenly spaced set of contour levels
  // still draws unevenly spaced Edges, and it pins the remap at values a real
  // model reaches only by accident: exactly on an Edge, past the last one, and
  // no number at all.
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

  function positionAt(value: number): number | null {
    return flat(value).z[0][0];
  }

  it("puts a value sitting on an Edge at that Edge's own integer", () => {
    expect(positionAt(0)).toBe(0);
    expect(positionAt(10)).toBe(1);
    expect(positionAt(40)).toBe(2);
  });

  it("interpolates between two Edges however wide the interval is", () => {
    // Halfway across a 10-wide interval and halfway across a 30-wide one are
    // both half a band: contours one step apart draw both boundaries.
    expect(positionAt(5)).toBeCloseTo(0.5, 12);
    expect(positionAt(25)).toBeCloseTo(1.5, 12);
  });

  it("scales the top band by the interval below it, not by the cutoff above it", () => {
    // The last Edge is where the classifier stops answering, not a boundary
    // between two bands. Knotting it would stretch the top band over 40..100
    // and bend the 40 Edge, which is a drawn one; borrowing the 30-wide
    // interval below leaves that Edge straight and holds the rest at the top.
    expect(positionAt(55)).toBeCloseTo(2.5, 12);
    expect(positionAt(70)).toBe(3);
    expect(positionAt(99)).toBe(3);
  });

  it("puts a value below the first Edge in the first band, and holds it there", () => {
    // The first band is drawn from the scale's floor up to 0, so "below the
    // first Edge" means inside that interval and not merely under 0.
    const position = positionAt(-5);
    expect(position).toBeGreaterThanOrEqual(BAND_SCALE_FLOOR);
    expect(position).toBeLessThan(0);
    expect(positionAt(-500)).toBe(BAND_SCALE_FLOOR);
  });

  it("leaves no band past the last Edge, nor where the model gives no number", () => {
    expect(positionAt(100)).toBeNull();
    expect(positionAt(250)).toBeNull();
    expect(positionAt(Number.NaN)).toBeNull();
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
    // The last Edge is the one place inclusivity decides whether there is a
    // band at all, so it is the one place the surface can disagree with the
    // label. Left-inclusive closes the scale at 100, right-inclusive keeps it.
    expect(positionAt(100)).toBeNull();
    expect(flat(100, rightInclusive).z[0][0]).not.toBeNull();
    expect(flat(100, rightInclusive).hoverText[0][0]).toBe("Extreme");
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
