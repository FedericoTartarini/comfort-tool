/**
 * Unit tests for the Humidex comfort model calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateHumidex, humidexModelConfig } from "./humidex";
import { UnitSystem } from "../models/units";
import { ChartId } from "../models/chartOptions";
import { FieldKey } from "../models/fieldKeys";
import { InputId } from "../models/inputSlots";
import { ChartMode } from "../models/modelCapabilities";

describe("humidex service", () => {
  it("calculates Humidex correctly and assigns appropriate discomfort level", () => {
    // 30°C, 70% RH -> Humidex should be ~41 (Intense)
    const result = calculateHumidex({
      tdb: 30,
      rh: 70,
      units: UnitSystem.SI,
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
      units: UnitSystem.SI,
    });
    
    expect(result.humidex).toBeGreaterThanOrEqual(54);
    expect(result.humidexDiscomfort).toBe("Stroke Probable");
  });

  it("returns mild/none discomfort in low temperatures", () => {
    const result = calculateHumidex({
      tdb: 15,
      rh: 30,
      units: UnitSystem.SI,
    });
    
    expect(result.humidexDiscomfort).toBe("Little/None");
  });

  it("builds static and dynamic chart results through the shared chart wrapper", () => {
    const request = { tdb: 30, rh: 70, units: UnitSystem.SI };
    const result = calculateHumidex(request);
    const chartSource = {
      chartRequest: { [InputId.Input1]: request },
      baselineInputId: InputId.Input1,
    };
    const resultsByInput = { [InputId.Input1]: result } as any;

    const staticChart = humidexModelConfig.buildChartResult(
      ChartId.Humidex,
      chartSource,
      resultsByInput,
      UnitSystem.SI,
    );
    const dynamicChart = humidexModelConfig.buildChartResult(
      ChartId.HumidexDynamic,
      chartSource,
      resultsByInput,
      UnitSystem.SI,
      {
        mode: ChartMode.Explore,
        xField: FieldKey.DryBulbTemperature,
        yField: FieldKey.RelativeHumidity,
        zOutput: humidexModelConfig.chartableOutputs[0].key,
        bands: humidexModelConfig.chartableOutputs[0].defaultBands,
      },
    );

    expect(staticChart?.traces[0].type).toBe("contour");
    expect(staticChart?.traces[0].z).toHaveLength(300);
    expect(staticChart?.traces[0].z?.[0]).toHaveLength(300);
    expect(dynamicChart?.traces[0].type).toBe("contour");
    expect(dynamicChart?.traces[0].z).toHaveLength(300);
    expect(dynamicChart?.traces.some((trace) => trace.type === "scatter")).toBe(true);
  });
});
