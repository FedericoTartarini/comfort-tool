/**
 * Unit tests for the standalone Wind Chill calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateWindChill, windChillModelConfig } from "./windChill";
import { UnitSystem } from "../models/units";
import {
  convertFieldValueFromSi,
  convertModelOutputFromSi,
} from "../services/units";
import { FieldKey } from "../models/fieldKeys";
import { ChartId } from "../models/chartOptions";
import { InputId } from "../models/inputSlots";
import {
  ChartMode,
  ModelOutputKey,
  type ChartBuildContext,
} from "../models/modelCapabilities";

describe("windChill service", () => {
  it("calculates Wind Chill Index and equivalent temperature correctly in SI", () => {
    // -10°C, 10 m/s wind
    const result = calculateWindChill({
      tdb: -10,
      v: 10,
    });
    
    expect(result.wci).toBeGreaterThan(1400); // 30 mins to frostbite or worse
    expect(result.wciTemp).toBeLessThan(-20);
    expect(result.wciZone).not.toBe("Safe");
  });

  it("calculates Wind Chill correctly in IP format mappings", () => {
    // 10°F (-12.2°C), 10 ft/s (3.048 m/s)
    const result = calculateWindChill({
      tdb: -12.22, // SI representation of 10°F
      v: 3.048,    // SI representation of 10 ft/s
    });
    
    const wciTempF = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.wciTemp, UnitSystem.IP);
    expect(wciTempF).toBeLessThan(5);
    expect(result.wciZone).toBe("Safe");
  });

  it("reverts Wind Chill Temp to Air Temp in mild conditions above 10°C", () => {
    const result = calculateWindChill({
      tdb: 12,
      v: 5,
    });
    
    expect(result.wciTemp).toBe(12);
  });

  it.each([UnitSystem.SI, UnitSystem.IP])(
    "restores Wind Chill hover detail in %s dynamic charts",
    (unitSystem) => {
      const request = { tdb: -10, v: 10 };
      const result = calculateWindChill(request);
      const chartSource = {
        inputs: { [InputId.Input1]: request },
      };
      const context = {
        unitSystem,
        dynamicAxes: windChillModelConfig.defaultDynamicAxes,
        baselineInputId: InputId.Input1,
        fieldChartConfig: {
          mode: ChartMode.Explore,
          xField: FieldKey.DryBulbTemperature,
          yField: FieldKey.WindSpeed,
          zOutput: windChillModelConfig.chartableOutputs[0].key,
          bands: windChillModelConfig.chartableOutputs[0].defaultBands,
        },
      } satisfies ChartBuildContext;

      const dynamicChart = windChillModelConfig.buildChartResult(
        ChartId.WindChillDynamic,
        chartSource,
        {
          [InputId.Input1]: result,
          [InputId.Input2]: null,
          [InputId.Input3]: null,
        },
        context,
      );

      const contourTrace = dynamicChart?.traces.find(({ name }) => (
        name === "Wind Chill Index bands hover"
      ));
      const inputTrace = dynamicChart?.traces.find((trace) => trace.type === "scatter");
      const gridHoverMetadata = contourTrace?.hoverMetadata as unknown[][][] | undefined;
      const firstGridResult = calculateWindChill({
        tdb: -45,
        v: 1,
      });

      expect(contourTrace?.z).toHaveLength(300);
      expect(contourTrace?.z?.[0]).toHaveLength(300);
      expect(contourTrace?.hoverongaps).toBe(false);
      expect(contourTrace?.hovertemplate).toContain("Frostbite Risk");
      expect(contourTrace?.hovertemplate).toContain("Wind Chill Index");
      expect(contourTrace?.hovertemplate).toContain("Wind Chill Temperature");
      expect(gridHoverMetadata?.[0]?.[0]).toEqual([
        convertModelOutputFromSi(
          ModelOutputKey.WindChill,
          firstGridResult.wci,
          unitSystem,
        ),
        convertFieldValueFromSi(
          FieldKey.DryBulbTemperature,
          firstGridResult.wciTemp,
          unitSystem,
        ),
      ]);
      expect(inputTrace?.hovertemplate).toContain("Frostbite Risk");
      expect(inputTrace?.hovertemplate).toContain("Wind Chill Index");
      expect(inputTrace?.hovertemplate).toContain("Wind Chill Temperature");
      expect(inputTrace?.hoverMetadata).toEqual([
        convertModelOutputFromSi(ModelOutputKey.WindChill, result.wci, unitSystem),
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.wciTemp, unitSystem),
      ]);
    },
  );
});
