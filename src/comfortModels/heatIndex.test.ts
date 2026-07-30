/**
 * Unit tests for the Heat Index calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateHeatIndex, heatIndexModelConfig } from "./heatIndex";
import { UnitSystem } from "../models/units";
import { convertModelOutputFromSi } from "../services/units";
import { FieldKey } from "../models/fieldKeys";
import { ChartId } from "../models/chartOptions";
import { InputId } from "../models/inputSlots";
import {
  ChartMode,
  ModelOutputKey,
  type ChartBuildContext,
} from "../models/modelCapabilities";

describe("heatIndex service", () => {
  it("calculates Heat Index correctly in SI format", () => {
    // 35°C, 70% RH -> HI should be ~50°C (Danger)
    const result = calculateHeatIndex({
      tdb: 35,
      rh: 70,
    });
    
    expect(result.hi).toBeGreaterThan(45);
    expect(result.category).toBe("Danger");
  });

  it("converts the SI Heat Index result for IP display", () => {
    // 35 °C is 95 °F; the apparent temperature is about 122 °F.
    const result = calculateHeatIndex({
      tdb: 35,
      rh: 70,
    });

    const hiF = convertModelOutputFromSi(
      ModelOutputKey.HeatIndex,
      result.hi,
      UnitSystem.IP,
    );
    expect(hiF).toBeGreaterThan(115);
    expect(hiF).toBeLessThan(125);
    expect(result.category).toBe("Danger");
  });

  it("identifies Extreme Danger threshold accurately", () => {
    // 40.56 °C is 105 °F; at 75% RH this is Extreme Danger.
    const result = calculateHeatIndex({
      tdb: 40.56,
      rh: 75,
    });
    
    expect(result.category).toBe("Extreme Danger");
  });

  it("builds static and dynamic chart results through the typed grid strategy", () => {
    const request = { tdb: 35, rh: 70 };
    const result = calculateHeatIndex(request);
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
      dynamicAxes: heatIndexModelConfig.defaultDynamicAxes,
      baselineInputId: InputId.Input1,
      fieldChartConfig: null,
    } satisfies ChartBuildContext;
    const exploreContext = {
      ...fixedContext,
      fieldChartConfig: {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: heatIndexModelConfig.chartableOutputs[0].key,
        bands: heatIndexModelConfig.chartableOutputs[0].defaultBands,
      },
    } satisfies ChartBuildContext;

    const fixedChart = heatIndexModelConfig.buildChartResult(
      ChartId.HeatIndexRanges,
      chartSource,
      resultsByInput,
      fixedContext,
    );
    const dynamicChart = heatIndexModelConfig.buildChartResult(
      ChartId.HeatIndexDynamic,
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

  it("trusts the state-owned dynamic-axis invariant without revalidating it", () => {
    const request = { tdb: 35, rh: 70 };
    const result = calculateHeatIndex(request);

    const chart = heatIndexModelConfig.buildChartResult(
      ChartId.HeatIndexDynamic,
      {
        chartRequest: { [InputId.Input1]: request },
      },
      {
        [InputId.Input1]: result,
        [InputId.Input2]: null,
        [InputId.Input3]: null,
      },
      {
        unitSystem: UnitSystem.SI,
        dynamicAxes: heatIndexModelConfig.defaultDynamicAxes,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          mode: ChartMode.Explore,
          xField: FieldKey.DryBulbTemperature,
          yField: FieldKey.DryBulbTemperature,
          zOutput: heatIndexModelConfig.chartableOutputs[0].key,
          bands: heatIndexModelConfig.chartableOutputs[0].defaultBands,
        },
      },
    );

    expect(chart).not.toBeNull();
    expect(chart?.layout.xaxis.title).toBe(chart?.layout.yaxis.title);
  });
});
