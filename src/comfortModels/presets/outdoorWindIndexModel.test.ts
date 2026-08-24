import { describe, expect, it } from "vitest";

import { CalculationSource } from "../../models/calculationMetadata";
import { ComfortModel } from "../../models/comfortModels";
import { PhysicalQuantityId } from "../../models/physicalQuantities";
import { ModelOutputKey } from "../../models/modelCapabilities";
import { ThermalZone } from "../../models/thermalZone";
import { buildOutdoorWindIndexModelConfig } from "./outdoorWindIndexModel";

const testZones = [
  new ThermalZone({ label: "Low", max: 10, color: "#e2e8f0" }),
  new ThermalZone({ label: "High", min: 10, color: "#dc2626" }),
];

interface TestResult {
  value: number;
  source: CalculationSource;
}

describe("outdoorWindIndexModel preset", () => {
  it("builds a dynamic-only outdoor wind index model with tdb and v axes", () => {
    const config = buildOutdoorWindIndexModelConfig<TestResult>({
      comfortModel: ComfortModel.WindChill,
      label: "Test Wind Index",
      description: "Test description.",
      outputKey: ModelOutputKey.WindChill,
      zones: testZones,
      tdbLimits: { min: -45, max: 0 },
      windLimits: { min: 1, max: 20 },
      dynamicChartInstanceId: "wind-chill-dynamic-field",
      dynamicTitle: "Test Dynamic Chart",
      calculate: ({ tdb, v }) => ({
        value: tdb + v,
        source: CalculationSource.JsThermalComfort,
      }),
      getOutputValue: (result) => result.value,
      getResultSubtext: () => "ok",
    });

    expect(config.id).toBe(ComfortModel.WindChill);
    expect(config.outputCharts.defaultInstanceId).toBe("wind-chill-dynamic-field");
    expect(config.outputCharts.entries).toHaveLength(1);
    expect(config.outputCharts.entries[0]?.instanceId).toBe("wind-chill-dynamic-field");
    expect(config.dynamicAxisFields).toEqual([
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.WindSpeed,
    ]);
    expect(config.defaultDynamicAxes).toEqual({
      xAxis: PhysicalQuantityId.DryBulbTemperature,
      yAxis: PhysicalQuantityId.WindSpeed,
    });
    expect(config.controls.map(({ id }) => id)).toEqual([
      "temperature",
      "windSpeed",
    ]);
  });
});
