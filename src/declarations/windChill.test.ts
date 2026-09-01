/**
 * Unit tests for the standalone Wind Chill calculation service.
 */
import { describe, expect, it } from "vitest";
import { wc } from "jsthermalcomfort";
import { PhysicalQuantityId } from "../catalog/quantities";
import { calculateWindChill, windChillModelConfig } from "./windChill";
import { ModelId } from "../catalog/modelIds";
import { UnitSystem } from "../catalog/units";
import {
  convertFieldValueFromSi,
} from "../engines/units";
import { InputId } from "../catalog/inputSlots";
import { buildChartPlotly } from "../testSupport/modelChartTestHelpers";
import { type ChartBuildContext } from "../catalog/modelCapabilities";
import { FieldChartProfileKind } from "../catalog/fieldChartProfile";
import { requiredControlIdsByModel } from "../testSupport/requiredModelControls";

describe("windChill service", () => {
  it("rejects a non-finite result instead of assigning the first zone", () => {
    expect(() => calculateWindChill({ tdb: Number.MAX_VALUE, v: 10 }))
      .toThrow(/Wind Chill.*non-finite/i);
  });

  it("calculates Wind Chill Index and equivalent temperature correctly in SI", () => {
    // -10°C, 10 m/s wind
    const result = calculateWindChill({
      tdb: -10,
      v: 10,
    });

    expect(result.wci).toBeGreaterThan(1400);
    expect(result.wct).toBeLessThan(-20);
  });

  it("calculates Wind Chill correctly in IP format mappings", () => {
    // 10°F (-12.2°C), 10 ft/s (3.048 m/s)
    const result = calculateWindChill({
      tdb: -12.22, // SI representation of 10°F
      v: 3.048,    // SI representation of 10 ft/s
    });

    const wctF = convertFieldValueFromSi(PhysicalQuantityId.WindChillTemperature, result.wct, UnitSystem.IP);
    expect(wctF).toBeLessThan(5);
  });

  it("calculates Wind Chill Temperature for inputs outside the historical applicability range", () => {
    const result = calculateWindChill({
      tdb: 12,
      v: 5,
    });

    expect(Number.isFinite(result.wct)).toBe(true);
    expect(result.wct).not.toBe(12);
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
        baselineInputId: InputId.Input1,
        fieldChartConfig: { profileKind: FieldChartProfileKind.Explore, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.WindSpeed, zOutput: windChillModelConfig.exploreOutputs[0].key, bands: windChillModelConfig.exploreOutputs[0].defaultBands },
      } satisfies ChartBuildContext;

      const dynamicChart = buildChartPlotly(windChillModelConfig,
        "dynamic",
        chartSource,
        {
          [InputId.Input1]: result,
          [InputId.Input2]: null,
          [InputId.Input3]: null,
        },
        context,
      );

      const fillTraces = dynamicChart?.traces.filter(({ name, fill }) => (
        typeof name === "string" && name.startsWith(`${wc.label} bands:`) && fill === "toself"
      ));
      const inputTrace = dynamicChart?.traces.find(({ name }) => name === "Input 1");
      const hover = inputTrace?.hovertemplate;

      expect(fillTraces?.length).toBe(0);
      expect(dynamicChart?.traces.find(({ type }) => type === "contour")).toBeUndefined();
      expect(hover).toContain(wc.label);
      expect(hover).toContain("wct");
      expect(hover).not.toContain("Frostbite");
      expect(inputTrace?.hoverinfo).toBe("all");
    },
  );

  it("declares a dynamic-only Explore model with air-temperature and wind axes", () => {
    expect(windChillModelConfig.id).toBe(ModelId.WindChill);
    expect(windChillModelConfig.chartInstances.defaultInstanceId).toBe(
      "dynamic",
    );
    expect(windChillModelConfig.chartInstances.entries).toHaveLength(1);
    expect(windChillModelConfig.chartInstances.entries[0]?.instanceId).toBe(
      "dynamic",
    );
    expect(windChillModelConfig.dynamicAxisFields).toEqual([
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.WindSpeed,
    ]);
    expect(windChillModelConfig.defaultDynamicAxes).toEqual({ xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.WindSpeed });
    expect(windChillModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.WindChill],
    ]);
  });
});
