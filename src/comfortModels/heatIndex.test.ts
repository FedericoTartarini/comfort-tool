/**
 * Unit tests for the Heat Index calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateHeatIndex, heatIndexModelConfig } from "./heatIndex";
import { UnitSystem } from "../models/units";
import { convertFieldValueFromSi } from "../services/units";
import { FieldKey } from "../models/fieldKeys";
import { ChartId } from "../models/chartOptions";
import { InputId } from "../models/inputSlots";
import { ChartMode } from "../models/modelCapabilities";

describe("heatIndex service", () => {
  it("calculates Heat Index correctly in SI format", () => {
    // 35°C, 70% RH -> HI should be ~50°C (Danger)
    const result = calculateHeatIndex({
      tdb: 35,
      rh: 70,
      units: UnitSystem.SI,
    });
    
    expect(result.hi).toBeGreaterThan(45);
    expect(result.category).toBe("Danger");
  });

  it("calculates Heat Index correctly in IP format (Fahrenheit)", () => {
    // 95°F, 70% RH -> HI should be ~122°F (Danger)
    const result = calculateHeatIndex({
      tdb: 95,
      rh: 70,
      units: UnitSystem.IP,
    });
    
    const hiF = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.hi, UnitSystem.IP);
    expect(hiF).toBeGreaterThan(115);
    expect(hiF).toBeLessThan(125);
    expect(result.category).toBe("Danger");
  });

  it("identifies Extreme Danger threshold accurately", () => {
    // 105°F, 75% RH -> HI should be > 130°F (Extreme Danger)
    const result = calculateHeatIndex({
      tdb: 105,
      rh: 75,
      units: UnitSystem.IP,
    });
    
    expect(result.category).toBe("Extreme Danger");
  });

  it("builds static and dynamic chart results through the typed grid strategy", () => {
    const request = { tdb: 35, rh: 70, units: UnitSystem.SI };
    const result = calculateHeatIndex(request);
    const chartSource = {
      chartRequest: { [InputId.Input1]: request },
      baselineInputId: InputId.Input1,
    };
    const resultsByInput = { [InputId.Input1]: result } as any;

    const staticChart = heatIndexModelConfig.buildChartResult(
      ChartId.HeatIndexRanges,
      chartSource,
      resultsByInput,
      UnitSystem.SI,
    );
    const dynamicChart = heatIndexModelConfig.buildChartResult(
      ChartId.HeatIndexDynamic,
      chartSource,
      resultsByInput,
      UnitSystem.SI,
      {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: heatIndexModelConfig.chartableOutputs[0].key,
        bands: heatIndexModelConfig.chartableOutputs[0].defaultBands,
      },
    );

    expect(staticChart?.traces[0].type).toBe("contour");
    expect(staticChart?.traces[0].z).toHaveLength(300);
    expect(staticChart?.traces[0].z?.[0]).toHaveLength(300);
    expect(staticChart?.traces[0].z?.flat().every(Number.isFinite)).toBe(true);
    expect(staticChart?.layout.height).toBe(480);
    expect(dynamicChart?.traces[0].type).toBe("contour");
    expect(dynamicChart?.traces[0].z).toHaveLength(300);
    expect(dynamicChart?.traces[0].z?.flat().every(Number.isFinite)).toBe(true);
    expect(dynamicChart?.layout.height).toBe(480);
    expect(dynamicChart?.traces.some((trace) => trace.type === "scatter")).toBe(true);
  });

  it("fails directly when typed grid axes violate the state invariant", () => {
    const request = { tdb: 35, rh: 70, units: UnitSystem.SI };

    expect(() => heatIndexModelConfig.buildChartResult(
      ChartId.HeatIndexDynamic,
      {
        chartRequest: { [InputId.Input1]: request },
        baselineInputId: InputId.Input1,
      },
      { [InputId.Input1]: calculateHeatIndex(request) } as any,
      UnitSystem.SI,
      {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.DryBulbTemperature,
        zOutput: heatIndexModelConfig.chartableOutputs[0].key,
        bands: heatIndexModelConfig.chartableOutputs[0].defaultBands,
      },
    )).toThrow(/axes must be distinct/i);
  });
});
