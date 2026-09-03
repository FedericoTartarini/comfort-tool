import { describe, expect, it, beforeEach } from "vitest";

import { ModelId } from "../../../../catalog/modelIds";
import { InputId } from "../../../../catalog/inputSlots";
import { UnitSystem } from "../../../../catalog/units";
import { SurfaceId } from "../../../../catalog/surfaces";
import { ChartLegendKind } from "../chartBuildResult";
import { buildFieldChartProfile, seedModelOutputSettings } from "../../../../state/pointSession/fieldChartState";
import { getComfortModelConfig } from "../../../../state/modelRegistry";
import { clearChartMemo } from "./memo";
import { createGoldenCalculationContext, getGoldenInputOverrides } from "../../../../testSupport/goldenFixtures";

describe("chart legend attachment", () => {
  beforeEach(() => {
    clearChartMemo();
  });

  it("attaches band legends for ready PMV compliance charts", () => {
    const config = getComfortModelConfig(ModelId.PmvAshrae);
    const context = createGoldenCalculationContext(
      ModelId.PmvAshrae,
      getGoldenInputOverrides(ModelId.PmvAshrae),
      {},
    );
    const { valuesByInput, chartSource } = config.calculate(context, [InputId.Input1]);
    const settings = seedModelOutputSettings(config);
    const profile = buildFieldChartProfile(config, settings, SurfaceId.Standard);
    const buildResult = config.buildChart(
      config.chartInstances.defaultInstanceId,
      chartSource,
      valuesByInput,
      profile,
      {
        unitSystem: UnitSystem.SI,
        baselineInputId: InputId.Input1,
        chartSourceVersion: 1,
        modelInputs: context.effectiveQuantitiesByInput[InputId.Input1],
      },
    );

    expect(buildResult.readiness).toBe("ready");
    expect(buildResult.legend?.kind).toBe(ChartLegendKind.Bands);
    expect(buildResult.legend?.items.length).toBeGreaterThan(0);
  });
});
