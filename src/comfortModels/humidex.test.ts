/**
 * Unit tests for the Humidex comfort model calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateHumidex, humidexModelConfig } from "./humidex";
import { UnitSystem } from "../models/units";
import { ChartId } from "../models/chartOptions";
import { FieldKey } from "../models/fieldKeys";
import { InputId } from "../models/inputSlots";
import { ChartMode, type ChartBuildContext } from "../models/modelCapabilities";

describe("humidex service", () => {
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
      dynamicAxes: humidexModelConfig.defaultDynamicAxes,
      baselineInputId: InputId.Input1,
      fieldChartConfig: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: humidexModelConfig.chartableOutputs[0].key,
        bands: humidexModelConfig.chartableOutputs[0].defaultBands,
      },
    } satisfies ChartBuildContext;

    const fixedChart = humidexModelConfig.buildChartResult(
      ChartId.Humidex,
      chartSource,
      resultsByInput,
      fixedContext,
    );
    const dynamicChart = humidexModelConfig.buildChartResult(
      ChartId.HumidexDynamic,
      chartSource,
      resultsByInput,
      fixedContext,
    );

    expect(fixedChart?.traces[0].type).toBe("contour");
    expect(fixedChart?.traces[0].z).toHaveLength(300);
    expect(fixedChart?.traces[0].z?.[0]).toHaveLength(300);
    expect(fixedChart?.traces[0].z?.flat().every(Number.isFinite)).toBe(true);
    expect(fixedChart?.layout.height).toBe(480);
    expect(dynamicChart?.traces[0].type).toBe("contour");
    expect(dynamicChart?.traces[0].z).toHaveLength(300);
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
    const chart = humidexModelConfig.buildChartResult(
      ChartId.Humidex,
      { inputs: { [InputId.Input1]: request } },
      {
        [InputId.Input1]: result,
        [InputId.Input2]: null,
        [InputId.Input3]: null,
      },
      {
        unitSystem: UnitSystem.SI,
        dynamicAxes: humidexModelConfig.defaultDynamicAxes,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          mode: ChartMode.Explore,
          xField: FieldKey.DryBulbTemperature,
          yField: FieldKey.RelativeHumidity,
          zOutput: humidexModelConfig.chartableOutputs[0].key,
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
});
