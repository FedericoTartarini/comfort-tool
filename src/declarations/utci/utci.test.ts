import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";


import { InputId } from "../../catalog/inputSlots";
import { UnitSystem } from "../../catalog/units";
import { type ChartBuildContext } from "../../catalog/modelCapabilities";
import { ChartType } from "../../catalog/chartTypes";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";
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
    [-40, "extreme cold stress"],
    [-27, "very strong cold stress"],
    [-13, "strong cold stress"],
    [0, "moderate cold stress"],
    [9, "slight cold stress"],
    [26, "no thermal stress"],
    [32, "moderate heat stress"],
    [38, "strong heat stress"],
    [46, "very strong heat stress"],
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
    const chart = buildChartPlotly(
      utciModelConfig,
      ChartType.Utci,
      { inputs: { [InputId.Input1]: request } },
      { [InputId.Input1]: result, [InputId.Input2]: null, [InputId.Input3]: null },
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.RelativeHumidity, zOutput: PhysicalQuantityId.UniversalThermalClimateIndex, bands },
      },
    )!;
    const fillTrace = chart.traces.find(({ name }) => name === "UTCI bands");
    const inputTrace = chart.traces.find(({ name }) => name === "Input 1");
    const gapIndex = fillTrace?.x?.findIndex((value) => (
      value > result.utci + 1 && value < result.utci + 2
    )) ?? -1;

    expect(gapIndex).toBeGreaterThanOrEqual(0);
    expect(fillTrace?.z).toHaveLength(50);
    expect(fillTrace?.z?.[0]).toHaveLength(450);
    expect(fillTrace?.z?.every((row) => {
      const cell = row[gapIndex];
      return cell == null || Number.isNaN(cell);
    })).toBe(true);
    expect(chart.traces.find(({ name }) => name === "UTCI bands hover"))
      .toBeUndefined();
    expect(fillTrace?.colorscale?.map(([, color]) => color))
      .toEqual(expect.arrayContaining(["#123456", "#abcdef", "#fedcba"]));
    expect(inputTrace?.hoverinfo).toBe("all");
    expect(chart.annotations.map(({ text }) => text))
      .toEqual(expect.arrayContaining(["Below marker", "Marker band", "Above gap"]));
  });

  it("uses its declared raw output and working bands", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };
    const result = calculateUtci(request);
    const chart = buildChartPlotly(utciModelConfig,
      "dynamic",
      { inputs: { [InputId.Input1]: request } },
      { [InputId.Input1]: result, [InputId.Input2]: null, [InputId.Input3]: null },
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.RelativeHumidity, zOutput: PhysicalQuantityId.UniversalThermalClimateIndex, bands: utciModelConfig.exploreOutputs[0].defaultBands },
      },
    )!;

    const fillTraces = chart.traces.filter(({ name, fill }) => (
      typeof name === "string" && name.startsWith("UTCI bands:") && fill === "toself"
    ));
    expect(fillTraces.length).toBeGreaterThan(0);
    expect(chart.traces.find(({ type }) => type === "contour")).toBeUndefined();
    expect(chart.traces.find(({ name }) => name === "Input 1")?.hovertemplate).toContain("UTCI");
    expect(chart.traces.every((trace) => !("hoveron" in trace))).toBe(true);
    expect(chart.traces.some((trace) => trace.type === "scatter")).toBe(true);
  });

  it("builds a coupled FieldChartConfig with finite resolved cells", () => {
    const request = { tdb: 25, tr: 25, v: 1, rh: 50 };
    const result = calculateUtci(request);
    const context = {
      unitSystem: UnitSystem.SI,
      baselineInputId: InputId.Input1,
      fieldChartConfig: { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.OperativeTemperature, zOutput: PhysicalQuantityId.UniversalThermalClimateIndex, bands: utciModelConfig.exploreOutputs[0].defaultBands },
    } satisfies ChartBuildContext;
    const chart = buildChartPlotly(utciModelConfig,
      "dynamic",
      { inputs: { [InputId.Input1]: request } },
      { [InputId.Input1]: result, [InputId.Input2]: null, [InputId.Input3]: null },
      context,
    )!;

    const fillTraces = chart.traces.filter(({ name, fill }) => (
      fill === "toself" && typeof name === "string" && name.includes("bands:")
    ));
    expect(chart.layout.title).toContain("Dynamic");
    expect(fillTraces.length).toBeGreaterThan(0);
  });

  it("pins required Analysis controls independently of inputFields", () => {
    expect(utciModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.Utci],
    ]);
  });

});
