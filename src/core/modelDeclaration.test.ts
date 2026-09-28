/**
 * What a declaration says about itself: the name its model info gives it,
 * unique across the registry; the standard edition it picks, checked against
 * that model info for every registered model; the table columns it lists;
 * the charts it offers; and the axis range a chart reads off it. What its
 * `run` does is the sibling `modelDeclarationRun.test.ts`'s.
 */
import { describe, expect, it } from "vitest";
import { PMV_THERMAL_SENSATION_VOTE_BINS_ISO, Standard } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { chartType } from "./chartType";
import {
  axisRangeFor,
  dynamicChartOf,
  psychrometricChartOf,
  requireAxisRange,
  type ChartDeclaration,
  type RegisteredModel,
  type ZonePolygon,
} from "./modelDeclaration";
import { quantities } from "./quantities";

const q = quantities;

describe("name", () => {
  it("is unique across the registry, so a share link can name a model without naming its standard", () => {
    const names = registeredModels.map((model) => model.info.name);
    expect(new Set(names).size, names.join(", ")).toBe(names.length);
  });
});

describe("standard", () => {
  it("is one of the editions the model's library function accepts, for every registered model", () => {
    for (const model of registeredModels) {
      if (model.standard === undefined) continue;
      expect(model.info.standards, model.info.label).toContain(model.standard);
    }
  });

  it("pins ISO 7730:2025 for PMV (ISO 7730)", () => {
    expect(pmvPpdIso.standard).toBe(Standard.iso_7730_2025);
  });
});

describe("table", () => {
  it("names no output its model info classifies, for every registered model", () => {
    // A category is never shown in a cell (`formatResultCell`); the Compliance
    // column reads it, so a table column for it would be a dash on every run.
    for (const model of registeredModels) {
      const classified = model.table.filter((column) => model.info.outputs[column.key]?.classifier);
      expect(classified.map((column) => column.label), model.info.label).toEqual([]);
    }
  });
});

/** Every model has a dynamic chart (ADR §4.4); only the chart state's throw at session start would otherwise say so. */
function expectADynamicChart(model: RegisteredModel): void {
  expect(dynamicChartOf(model), model.info.label).toBeDefined();
}

/**
 * v1 has one chart per chart type (ADR-0002 decision 31's note): the chart
 * lookups return the first entry of a type, and the chart picker keys its
 * entries by type.
 */
function expectEachChartTypeOnce(model: RegisteredModel): void {
  const types = model.charts.map((chart) => chart.type);
  expect(new Set(types).size, model.info.label).toBe(types.length);
}

/** The psychrometric zone is traced on `run`'s own PMV, so a model without one cannot declare the chart. */
function expectPmvUnderAPsychrometricChart(model: RegisteredModel): void {
  if (!psychrometricChartOf(model)) return;
  expect(model.info.outputs[q.pmv.key], model.info.label).toBeDefined();
}

describe("charts", () => {
  it("include a dynamic chart, for every registered model", () => {
    for (const model of registeredModels) {
      expectADynamicChart(model);
    }
  });

  it("name each chart type once, for every registered model", () => {
    for (const model of registeredModels) {
      expectEachChartTypeOnce(model);
    }
  });

  it("include a psychrometric chart only where the model info carries PMV, for every registered model", () => {
    for (const model of registeredModels) {
      expectPmvUnderAPsychrometricChart(model);
    }
  });

  it("that leave out the dynamic chart fail the check", () => {
    const psychrometric = psychrometricChartOf(pmvPpdIso);
    if (!psychrometric) throw new Error("PMV (ISO 7730) declares a psychrometric chart");
    const noDynamicChart: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture without a dynamic chart" },
      charts: [psychrometric],
    };
    expect(() => expectADynamicChart(noDynamicChart)).toThrow(noDynamicChart.info.label);
  });

  it("that name the dynamic chart twice fail the check", () => {
    const dynamic = dynamicChartOf(pmvPpdIso);
    if (!dynamic) throw new Error("PMV (ISO 7730) declares a dynamic chart");
    const twoDynamicCharts: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture with two dynamic charts" },
      charts: [...pmvPpdIso.charts, dynamic],
    };
    expect(() => expectEachChartTypeOnce(twoDynamicCharts)).toThrow(twoDynamicCharts.info.label);
  });

  it("that include a psychrometric chart on a model info without PMV fail the check", () => {
    const outputs = Object.fromEntries(Object.entries(pmvPpdIso.info.outputs).filter(([key]) => key !== q.pmv.key));
    const noPmv: RegisteredModel = {
      ...pmvPpdIso,
      info: { ...pmvPpdIso.info, label: "Fixture without PMV", outputs },
    };
    expect(() => expectPmvUnderAPsychrometricChart(noPmv)).toThrow(noPmv.info.label);
  });
});

describe("axisRangeFor", () => {
  it("returns the declared range when the model has one", () => {
    const declared = pmvPpdIso.axisRanges.find((range) => range.quantity === q.tdb);
    if (!declared) throw new Error("PMV (ISO 7730) declares a tdb range");
    // A declared range equal to the applicability bound could not tell the two sources apart.
    const bound = pmvPpdIso.info.inputs.tdb?.applicability;
    expect([declared.min, declared.max]).not.toEqual([bound?.min, bound?.max]);
    expect(axisRangeFor(pmvPpdIso, q.tdb)).toEqual({ min: declared.min, max: declared.max });
  });

  it("falls back to the applicability bound when none is declared, but both a min and a max exist", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.clo) };
    const bound = pmvPpdIso.info.inputs.clo?.applicability;
    expect(bound?.min).toBeDefined();
    expect(bound?.max).toBeDefined();
    expect(axisRangeFor(noDeclaredRange, q.clo)).toEqual({ min: bound?.min, max: bound?.max });
  });

  it("returns undefined when neither a declared range nor a complete applicability bound exists", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(axisRangeFor(noDeclaredRange, q.rh)).toBeUndefined();
  });
});

describe("requireAxisRange", () => {
  it("returns the same range as axisRangeFor when one exists", () => {
    expect(requireAxisRange(pmvPpdIso, q.tdb)).toEqual(axisRangeFor(pmvPpdIso, q.tdb));
  });

  it("throws naming the model and the quantity when no range can be found", () => {
    const noDeclaredRange = { ...pmvPpdIso, axisRanges: pmvPpdIso.axisRanges.filter((range) => range.quantity !== q.rh) };
    expect(() => requireAxisRange(noDeclaredRange, q.rh)).toThrow(
      `${pmvPpdIso.info.label} declares no axis range for ${q.rh.label}, so it cannot carry an axis`,
    );
  });
});

/**
 * Type-level proof of the dynamic chart's two shapes (ADR-0002 decision 37),
 * compiled by `npm run check` and never called: each `@ts-expect-error` fails
 * the build the day the compiler stops refusing that declaration. Exported
 * only because `noUnusedLocals` would otherwise flag it.
 */
export function dynamicShapesTypeProof(polygons: readonly ZonePolygon[]): ChartDeclaration[] {
  const axes = { x: q.v, y: q.operative_tmp };
  const bands = PMV_THERMAL_SENSATION_VOTE_BINS_ISO;
  return [
    { type: chartType.dynamic, axes, output: q.pmv, bands },
    { type: chartType.dynamic, axes, zones: () => polygons },
    // @ts-expect-error a scanned chart without the bands that cut its output
    { type: chartType.dynamic, axes, output: q.pmv },
    // @ts-expect-error a polygons chart with an output it does not scan
    { type: chartType.dynamic, axes, zones: () => polygons, output: q.pmv },
    // @ts-expect-error a polygons chart with bands it does not draw
    { type: chartType.dynamic, axes, zones: () => polygons, bands },
  ];
}
