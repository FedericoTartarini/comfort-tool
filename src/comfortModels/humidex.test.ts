/**
 * Unit tests for the Humidex comfort model calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateHumidex, humidexModelConfig } from "./humidex";
import { ModelId } from "../models/comfortModels";
import { UnitSystem } from "../models/units";
import { PhysicalQuantityId } from "../models/physicalQuantities";
import { InputId } from "../models/inputSlots";

import { buildChartPlotly } from "../testSupport/modelChartTestHelpers";
import { type ChartBuildContext } from "../models/modelCapabilities";
import { ChartKind } from "../models/output/chartKinds";
import { FieldChartProfileKind } from "../models/output/fieldChartProfile";
import { requiredControlIdsByModel } from "../testSupport/requiredModelControls";

describe("humidex service", () => {
  it("rejects a non-finite result instead of assigning the first zone", () => {
    expect(() => calculateHumidex({ tdb: Number.MAX_VALUE, rh: 50 }))
      .toThrow(/Humidex.*non-finite/i);
  });

  it("calculates Humidex correctly and assigns appropriate discomfort level", () => {
    // 30°C, 70% RH -> Humidex should be ~41 (Intense)
    const result = calculateHumidex({
      tdb: 30,
      rh: 70,
    });

    expect(result.humidex).toBeGreaterThan(40);
    expect(result.humidex).toBeLessThan(43);
    expect(result.humidexDiscomfort).toBe("Intense");
  });

  it("identifies extreme stroke probable conditions", () => {
    // 40°C, 75% RH -> Humidex is highly elevated
    const result = calculateHumidex({
      tdb: 40,
      rh: 75,
    });

    expect(result.humidex).toBeGreaterThanOrEqual(54);
    expect(result.humidexDiscomfort).toBe("Stroke Probable");
  });

  it("returns mild/none discomfort in low temperatures", () => {
    const result = calculateHumidex({
      tdb: 15,
      rh: 30,
    });

    expect(result.humidexDiscomfort).toBe("Little/None");
  });

  it("builds static and dynamic chart results through the typed grid strategy", () => {
    const request = { tdb: 30, rh: 70 };
    const result = calculateHumidex(request);
    const chartSource = {
      inputs: { [InputId.Input1]: request },
    };
    const resultsByInput = {
      [InputId.Input1]: result,
      [InputId.Input2]: null,
      [InputId.Input3]: null,
    };
    const fixedContext = {
      unitSystem: UnitSystem.SI,
      baselineInputId: InputId.Input1,
      fieldChartConfig: {
        profileKind: FieldChartProfileKind.Explore,
        xField: PhysicalQuantityId.DryBulbTemperature,
        yField: PhysicalQuantityId.RelativeHumidity,
        zOutput: humidexModelConfig.exploreOutputs[0].key,
        bands: humidexModelConfig.exploreOutputs[0].defaultBands,
      },
    } satisfies ChartBuildContext;

    const fixedChart = buildChartPlotly(humidexModelConfig,
      "humidex-ranges",
      chartSource,
      resultsByInput,
      fixedContext,
    );
    const dynamicChart = buildChartPlotly(humidexModelConfig,
      "humidex-dynamic-field",
      chartSource,
      resultsByInput,
      fixedContext,
    );

    expect(fixedChart?.traces[0].type).toBe("contour");
    expect(fixedChart?.traces[0].z).toHaveLength(100);
    expect(fixedChart?.traces[0].z?.[0]).toHaveLength(100);
    expect(fixedChart?.traces[0].z?.flat().every(Number.isFinite)).toBe(true);
    expect(fixedChart?.layout.height).toBe(480);
    expect(dynamicChart?.traces[0].type).toBe("contour");
    expect(dynamicChart?.traces[0].z).toHaveLength(100);
    expect(dynamicChart?.traces[0].z?.flat().every(Number.isFinite)).toBe(true);
    expect(dynamicChart?.layout.height).toBe(480);
    expect(dynamicChart?.traces.some((trace) => trace.type === "scatter")).toBe(true);
  });

  it("applies edited Explore bands to fixed-view fills and input hover", () => {
    const request = { tdb: 30, rh: 70 };
    const result = calculateHumidex(request);
    const bands = [
      {
        min: -Infinity,
        max: result.humidex,
        label: "Lower",
        color: "#123456",
      },
      {
        min: result.humidex,
        max: Infinity,
        label: "Boundary and above",
        color: "#abcdef",
      },
    ];
    const chart = buildChartPlotly(humidexModelConfig,
      "humidex-ranges",
      { inputs: { [InputId.Input1]: request } },
      {
        [InputId.Input1]: result,
        [InputId.Input2]: null,
        [InputId.Input3]: null,
      },
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          profileKind: FieldChartProfileKind.Explore,
          xField: PhysicalQuantityId.DryBulbTemperature,
          yField: PhysicalQuantityId.RelativeHumidity,
          zOutput: humidexModelConfig.exploreOutputs[0].key,
          bands,
        },
      },
    );
    const fillTrace = chart?.traces.find(
      ({ name }) => name === "Humidex bands",
    );
    const inputTrace = chart?.traces.find(({ name }) => name === "Input 1");

    expect(fillTrace?.colorscale?.map(([, color]) => color))
      .toEqual(expect.arrayContaining(["#123456", "#abcdef"]));
    expect(inputTrace?.hovertemplate).toContain("Boundary and above");
    expect(String(chart?.layout.xaxis.title)).toContain("Relative humidity");
    expect(String(chart?.layout.yaxis.title)).toContain("Air temperature");
  });

  it("declares fixed-axis and dynamic field charts from defineModel", () => {
    expect(humidexModelConfig.id).toBe(ModelId.Humidex);
    expect(humidexModelConfig.outputCharts.defaultInstanceId).toBe("humidex-ranges");
    expect(humidexModelConfig.outputCharts.entries.map(({ instanceId, kind }) => ({
      instanceId,
      kind,
    }))).toEqual([
      { instanceId: "humidex-ranges", kind: ChartKind.DynamicField },
      { instanceId: "humidex-dynamic-field", kind: ChartKind.DynamicField },
    ]);
  });

  it("pins required Analysis controls independently of inputFields", () => {
    expect(humidexModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.Humidex],
    ]);
  });
});
