/**
 * Unit tests for the standalone Wind Chill calculation service.
 */
import { describe, expect, it } from "vitest";
import { calculateWindChill, windChillModelConfig } from "./windChill";
import { UnitSystem } from "../models/units";
import { convertFieldValueFromSi } from "../services/units";
import { FieldKey } from "../models/fieldKeys";
import { ChartId } from "../models/chartOptions";
import { InputId } from "../models/inputSlots";

describe("windChill service", () => {
  it("calculates Wind Chill Index and equivalent temperature correctly in SI", () => {
    // -10°C, 10 m/s wind
    const result = calculateWindChill({
      tdb: -10,
      v: 10,
      units: UnitSystem.SI,
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
      units: UnitSystem.SI,
    });
    
    const wciTempF = convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.wciTemp, UnitSystem.IP);
    expect(wciTempF).toBeLessThan(5);
    expect(result.wciZone).toBe("Safe");
  });

  it("reverts Wind Chill Temp to Air Temp in mild conditions above 10°C", () => {
    const result = calculateWindChill({
      tdb: 12,
      v: 5,
      units: UnitSystem.SI,
    });
    
    expect(result.wciTemp).toBe(12);
  });

  it("builds dynamic chart results through the shared chart wrapper", () => {
    const request = { tdb: -10, v: 10, units: UnitSystem.SI };
    const result = calculateWindChill(request);
    const chartSource = {
      chartRequest: { [InputId.Input1]: request },
      dynamicXAxis: FieldKey.DryBulbTemperature,
      dynamicYAxis: FieldKey.WindSpeed,
      baselineInputId: InputId.Input1,
    };

    const dynamicChart = windChillModelConfig.buildChartResult(
      ChartId.WindChillDynamic,
      chartSource,
      { [InputId.Input1]: result } as any,
      UnitSystem.SI,
    );

    expect(dynamicChart?.traces[0].type).toBe("contour");
    expect(dynamicChart?.traces[0].z).toHaveLength(300);
    expect(dynamicChart?.traces[0].z?.[0]).toHaveLength(300);
    expect(dynamicChart?.traces.some((trace) => trace.type === "scatter")).toBe(true);
  });
});
