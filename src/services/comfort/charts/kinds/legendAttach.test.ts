import { describe, expect, it, beforeEach } from "vitest";

import { ComfortModel } from "../../../../models/comfortModels";
import { InputId } from "../../../../models/inputSlots";
import { UnitSystem } from "../../../../models/units";
import { WorkspaceId } from "../../../../models/workspaces";
import { ChartLegendKind } from "../../../../models/output/chartBuildResult";
import { buildFieldChartProfile, seedModelOutputSettings } from "../../../../state/comfortTool/fieldChartState";
import { getComfortModelConfig } from "../../../../state/comfortTool/modelConfigs";
import { clearChartMemo } from "./memo";
import { createGoldenCalculationContext, pmvBaselineInputOverrides } from "../../../../testSupport/goldenFixtures";

describe("chart legend attachment", () => {
  beforeEach(() => {
    clearChartMemo();
  });

  it("attaches band legends for ready PMV compliance charts", () => {
    const config = getComfortModelConfig(ComfortModel.PmvAshrae);
    const context = createGoldenCalculationContext(
      ComfortModel.PmvAshrae,
      pmvBaselineInputOverrides,
      {},
    );
    const { resultsByInput, chartSource } = config.calculate(context, [InputId.Input1]);
    const settings = seedModelOutputSettings(config);
    const profile = buildFieldChartProfile(config, settings, WorkspaceId.Standard);
    const buildResult = config.buildChart(
      config.outputCharts.defaultInstanceId,
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

    expect(buildResult.readiness).toBe("ready");
    expect(buildResult.legend?.kind).toBe(ChartLegendKind.Bands);
    expect(buildResult.legend?.items.length).toBeGreaterThan(0);
  });
});
