import { describe, expect, it } from "vitest";


import { PhysicalQuantityId } from "../../catalog/quantities";
import { InputId } from "../../catalog/inputSlots";
import { UnitSystem } from "../../catalog/units";
import {
  buildUtciStressChart,
} from "./charts";
import { ModelOutputKey, type ChartBuildContext } from "../../catalog/modelCapabilities";
import { FieldChartProfileKind } from "../../catalog/output/fieldChartProfile";
import { buildChartPlotly } from "../../testSupport/modelChartTestHelpers";
import {
  calculateUtci,
  getUtciZoneMeta,
  utciModelConfig,
} from "./utci";
import { ModelId } from "../../catalog/modelIds";
import { requiredControlIdsByModel } from "../../testSupport/requiredModelControls";

describe("UTCI stress zones", () => {
  it.each([
    [-40, "Very Strong Cold Stress"],
    [-27, "Strong Cold Stress"],
    [-13, "Moderate Cold Stress"],
    [0, "Slight Cold Stress"],
    [9, "No Thermal Stress"],
    [26, "Moderate Heat Stress"],
    [32, "Strong Heat Stress"],
    [38, "Very Strong Heat Stress"],
    [46, "Extreme Heat Stress"],
  ] as const)("assigns the exact %s °C boundary to %s", (value, expectedLabel) => {
    expect(getUtciZoneMeta(value).label).toBe(expectedLabel);
  });

  it("derives the reported category from the calculated UTCI value", () => {
    const result = calculateUtci({
      tdb: 25,
      tr: 25,
      v: 1,
      rh: 50,
    });

    expect(result.stressCategory).toBe(getUtciZoneMeta(result.utci).category);
  });

  it("rejects non-finite values instead of assigning no thermal stress", () => {
    expect(() => getUtciZoneMeta(Number.NaN)).toThrow(/UTCI.*non-finite/i);
  });
});

describe("UTCI Explore chart", () => {
  it("applies edited bands and preserves gaps in the fixed stress strip", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };
    const result = calculateUtci(request);
    const bands = [
      {
        min: -Infinity,
        max: result.utci,
        label: "Below marker",
        color: "#123456",
      },
      {
        min: result.utci,
        max: result.utci + 1,
        label: "Marker band",
        color: "#abcdef",
      },
      {
        min: result.utci + 2,
        max: Infinity,
        label: "Above gap",
        color: "#fedcba",
      },
    ];
    const chart = buildUtciStressChart(
      { inputs: { [InputId.Input1]: request } },
      { [InputId.Input1]: result, [InputId.Input2]: null, [InputId.Input3]: null },
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          profileKind: FieldChartProfileKind.Explore,
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: ModelOutputKey.Utci,
          bands,
        },
      },
    );
    const fillTrace = chart.traces.find(({ name }) => name === "UTCI bands");
    const hoverTrace = chart.traces.find(
      ({ name }) => name === "UTCI bands hover",
    );
    const inputTrace = chart.traces.find(({ name }) => name === "Input 1");
    const gapIndex = fillTrace?.x.findIndex((value) => (
      value > result.utci + 1 && value < result.utci + 2
    )) ?? -1;

    expect(gapIndex).toBeGreaterThanOrEqual(0);
    expect(fillTrace?.z).toHaveLength(50);
    expect(fillTrace?.z?.[0]).toHaveLength(450);
    expect(hoverTrace?.hoverMetadata).toBeUndefined();
    expect(fillTrace?.z?.every((row) => Number.isNaN(row[gapIndex]))).toBe(true);
    expect(hoverTrace?.text?.every((row) => row[gapIndex] === "Unclassified"))
      .toBe(true);
    expect(fillTrace?.colorscale?.map(([, color]) => color))
      .toEqual(expect.arrayContaining(["#123456", "#abcdef", "#fedcba"]));
    expect(inputTrace?.hovertemplate).toContain("Marker band");
    expect(chart.annotations.map(({ text }) => text))
      .toEqual(expect.arrayContaining(["Below marker", "Marker band", "Above gap"]));
  });

  it("uses its declared raw output and working bands", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };
    const result = calculateUtci(request);
    const chart = buildChartPlotly(utciModelConfig,
      "utci-dynamic-field",
      { inputs: { [InputId.Input1]: request } },
      { [InputId.Input1]: result, [InputId.Input2]: null, [InputId.Input3]: null },
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          profileKind: FieldChartProfileKind.Explore,
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: ModelOutputKey.Utci,
          bands: utciModelConfig.exploreOutputs[0].defaultBands,
        },
      },
    )!;

    const tooltipTrace = chart.traces.find(({ name }) => name === "UTCI bands hover");
    expect(tooltipTrace?.type).toBe("contour");
    expect(tooltipTrace?.z).toHaveLength(100);
    expect(tooltipTrace?.z?.[0]).toHaveLength(100);
    expect(tooltipTrace?.hoverMetadata).toBeUndefined();
    expect(tooltipTrace?.hovertemplate).toContain("UTCI");
    expect(tooltipTrace?.hoverongaps).toBe(false);
    expect(chart.traces.every((trace) => !("hoveron" in trace))).toBe(true);
    expect(chart.traces.some((trace) => trace.type === "scatter")).toBe(true);
  });

  it("builds a coupled FieldChartConfig with finite resolved cells", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };
    const result = calculateUtci(request);
    const context = {
      unitSystem: UnitSystem.SI,
      baselineInputId: InputId.Input1,
      fieldChartConfig: {
        profileKind: FieldChartProfileKind.Explore,
        xField: PhysicalQuantityId.DryBulbTemperature,
        yField: PhysicalQuantityId.OperativeTemperature,
        zOutput: ModelOutputKey.Utci,
        bands: utciModelConfig.exploreOutputs[0].defaultBands,
      },
    } satisfies ChartBuildContext;
    const chart = buildChartPlotly(utciModelConfig,
      "utci-dynamic-field",
      { inputs: { [InputId.Input1]: request } },
      { [InputId.Input1]: result, [InputId.Input2]: null, [InputId.Input3]: null },
      context,
    )!;

    const contour = chart.traces.find((trace) => trace.type === "contour");
    expect(chart.layout.title).toContain("Dynamic Chart");
    expect(contour).toBeDefined();
    expect(contour?.z?.flat().some(Number.isFinite)).toBe(true);
  });

  it("pins required Analysis controls independently of inputFields", () => {
    expect(utciModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.Utci],
    ]);
  });

});
