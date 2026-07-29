import { describe, expect, it } from "vitest";

import { FieldKey } from "../../models/fieldKeys";
import { ModelOutputKey } from "../../models/modelCapabilities";
import { adaptiveAshraeModelConfig } from "../../comfortModels/adaptive";
import { pmvAshraeModelConfig } from "../../comfortModels/pmvAshrae";
import {
  buildExploreFieldChartConfig,
  replaceExploreBands,
  seedExploreChartState,
  selectExploreOutput,
} from "./exploreChartState";

describe("Explore chart state helpers", () => {
  it("seeds the first declared output as a deep working copy", () => {
    const state = seedExploreChartState(pmvAshraeModelConfig);
    const declaration = pmvAshraeModelConfig.chartableOutputs[0];

    expect(state?.zOutput).toBe(ModelOutputKey.Pmv);
    expect(state?.bands).toEqual(declaration.defaultBands);
    expect(state?.bands).not.toBe(declaration.defaultBands);
    expect(state?.bands[0]).not.toBe(declaration.defaultBands[0]);
  });

  it("switches output by reseeding that output's defaults", () => {
    const currentState = seedExploreChartState(pmvAshraeModelConfig);
    const state = selectExploreOutput(
      pmvAshraeModelConfig,
      currentState,
      ModelOutputKey.Ppd,
    );

    expect(state?.zOutput).toBe(ModelOutputKey.Ppd);
    expect(state?.bands).toEqual(pmvAshraeModelConfig.chartableOutputs[1].defaultBands);
    expect(state?.bands).not.toBe(pmvAshraeModelConfig.chartableOutputs[1].defaultBands);
    expect(selectExploreOutput(
      pmvAshraeModelConfig,
      currentState,
      ModelOutputKey.Utci,
    )).toBeNull();
  });

  it("preserves the working state when the selected output is re-selected", () => {
    const currentState = replaceExploreBands(
      pmvAshraeModelConfig,
      seedExploreChartState(pmvAshraeModelConfig),
      [{ min: -Infinity, max: Infinity, label: "Edited", color: "#123456" }],
    );
    const selectedState = selectExploreOutput(
      pmvAshraeModelConfig,
      currentState,
      ModelOutputKey.Pmv,
    );

    expect(selectedState).toBe(currentState);
    expect(selectedState?.bands).toBe(currentState?.bands);
  });

  it("sorts valid replacements and rejects invalid replacements", () => {
    const state = seedExploreChartState(pmvAshraeModelConfig);
    const replaced = replaceExploreBands(pmvAshraeModelConfig, state, [
      { min: 0, max: Infinity, label: " Warm ", color: " #f00 " },
      { min: -Infinity, max: 0, label: " Cool ", color: " #00f " },
    ]);

    expect(replaced?.bands.map(({ label }) => label)).toEqual(["Cool", "Warm"]);
    expect(replaceExploreBands(pmvAshraeModelConfig, state, [
      { min: 0, max: 2, label: "One", color: "#000" },
      { min: 1, max: 3, label: "Two", color: "#fff" },
    ])).toBeNull();
  });

  it("builds configs only for valid declared axes, outputs, and bands", () => {
    const state = seedExploreChartState(pmvAshraeModelConfig);
    const config = buildExploreFieldChartConfig(
      pmvAshraeModelConfig,
      state,
      FieldKey.DryBulbTemperature,
      FieldKey.RelativeHumidity,
    );

    expect(config).toEqual(expect.objectContaining({
      xField: FieldKey.DryBulbTemperature,
      yField: FieldKey.RelativeHumidity,
      zOutput: ModelOutputKey.Pmv,
    }));
    expect(buildExploreFieldChartConfig(
      pmvAshraeModelConfig,
      state,
      FieldKey.DryBulbTemperature,
      FieldKey.OperativeTemperature,
    )).toBeNull();
  });

  it("keeps compliance-only Adaptive models out of Explore state", () => {
    expect(seedExploreChartState(adaptiveAshraeModelConfig)).toBeNull();
  });
});
