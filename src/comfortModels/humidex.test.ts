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
      chartRequest: { [InputId.Input1]: request },
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
      fieldChartConfig: null,
    } satisfies ChartBuildContext;
    const exploreContext = {
      ...fixedContext,
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
      exploreContext,
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
});
