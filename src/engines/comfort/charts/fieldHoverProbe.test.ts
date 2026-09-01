import { beforeEach, describe, expect, it } from "vitest";

import { ModelId } from "../../../catalog/modelIds";
import { InputId } from "../../../catalog/inputSlots";
import { SurfaceId } from "../../../catalog/surfaces";
import { UnitSystem } from "../../../catalog/units";
import { getComfortModelConfig } from "../../../state/modelRegistry";
import {
  buildFieldChartProfile,
  seedModelOutputSettings,
} from "../../../state/pointSession/fieldChartState";
import { createGoldenCalculationContext } from "../../../testSupport/goldenFixtures";
import { clearChartMemo } from "./kinds/memo";
import { ChartType } from "../../../catalog/chartTypes";

function buildModelChart(modelId: ModelId, instanceId: string, surface: SurfaceId) {
  const config = getComfortModelConfig(modelId);
  const context = createGoldenCalculationContext(modelId, {}, {});
  const { resultsByInput, chartSource } = config.calculate(context, [InputId.Input1]);
  const settings = seedModelOutputSettings(config);
  const profile = buildFieldChartProfile(config, settings, surface);
  return config.buildChart(
    instanceId,
    chartSource,
    resultsByInput,
    profile,
    {
      unitSystem: UnitSystem.SI,
      baselineInputId: InputId.Input1,
      chartSourceVersion: 1,
      modelInputs: context.modelInputs,
    },
  );
}

describe("field hover probe", () => {
  beforeEach(() => {
    clearChartMemo();
  });

  it("formats PMV psychrometric hits without Compare input labels", () => {
    const build = buildModelChart(
      ModelId.PmvAshrae,
      ChartType.Psychrometric,
      SurfaceId.Standard,
    );
    expect(build.readiness).toBe("ready");
    const hit = build.hoverProbe?.probeDisplay(22, 7.5);
    expect(hit).toBeDefined();
    expect(hit?.hovertemplate).toContain("Air temperature:");
    expect(hit?.hovertemplate).toContain("Humidity ratio:");
    expect(hit?.hovertemplate).toContain("Zone:");
    expect(hit?.hovertemplate).toContain("PMV:");
    expect(hit?.hovertemplate).toContain("PPD:");
    expect(hit?.hovertemplate).not.toContain("Input 1");
  });

  it("returns null for supersaturated psychrometric coordinates", () => {
    const build = buildModelChart(
      ModelId.PmvAshrae,
      ChartType.Psychrometric,
      SurfaceId.Standard,
    );
    expect(build.hoverProbe?.probeDisplay(10, 20)).toBeNull();
  });

  it("formats PMV dynamic hits without Compare input labels", () => {
    const build = buildModelChart(
      ModelId.PmvAshrae,
      ChartType.Dynamic,
      SurfaceId.Standard,
    );
    expect(build.readiness).toBe("ready");
    const hit = build.hoverProbe?.probeDisplay(28, 50);
    expect(hit).toBeDefined();
    expect(hit?.hovertemplate).toContain("Air temperature:");
    expect(hit?.hovertemplate).toContain("Relative humidity:");
    expect(hit?.hovertemplate).toContain("Zone:");
    expect(hit?.hovertemplate).toContain("PMV:");
    expect(hit?.hovertemplate).toContain("PPD:");
    expect(hit?.hovertemplate).not.toContain("Input 1");
    expect(hit?.customdata).toEqual([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    ]);
  });

  it("formats Heat Index dynamic hits from the shared grid probe", () => {
    const config = getComfortModelConfig(ModelId.HeatIndex);
    const build = buildModelChart(
      ModelId.HeatIndex,
      config.chartInstances.defaultInstanceId,
      SurfaceId.Explore,
    );
    expect(build.readiness).toBe("ready");
    const hit = build.hoverProbe?.probeDisplay(30, 50);
    expect(hit).toBeDefined();
    expect(hit?.hovertemplate).toContain("Air temperature:");
    expect(hit?.hovertemplate).toContain("Relative humidity:");
    expect(hit?.hovertemplate).toContain("Band:");
    expect(hit?.hovertemplate).not.toContain("Input 1");
    expect(hit?.customdata).toBeDefined();
  });

  it("does not attach a probe to UTCI 1-D stress or Heat Loss charts", () => {
    const utci = buildModelChart(ModelId.Utci, "utci", SurfaceId.Explore);
    expect(utci.readiness).toBe("ready");
    expect(utci.hoverProbe).toBeUndefined();

    const heatLoss = buildModelChart(
      ModelId.PmvAshrae,
      ChartType.HeatLoss,
      SurfaceId.Standard,
    );
    expect(heatLoss.readiness).toBe("ready");
    expect(heatLoss.hoverProbe).toBeUndefined();
  });
});
