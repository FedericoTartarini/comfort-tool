import { describe, expect, it } from "vitest";

import { adaptiveAshraeModelConfig } from "../../comfortModels/adaptiveAshrae";
import { pmvAshraeModelConfig } from "../../comfortModels/pmvAshrae";
import { utciModelConfig } from "../../comfortModels/utci";
import { FieldKey } from "../../models/fieldKeys";
import { ChartMode, ModelOutputKey } from "../../models/modelCapabilities";
import {
  buildFieldChartConfig,
  getDefaultChartMode,
  replaceExploreBands,
  seedModelChartSettings,
  selectChartMode,
  selectExploreOutput,
} from "./fieldChartState";

describe("field chart state helpers", () => {
  it("defaults Compliance-capable models to Compliance and Explore-only models to Explore", () => {
    expect(getDefaultChartMode(pmvAshraeModelConfig)).toBe(ChartMode.Compliance);
    expect(getDefaultChartMode(adaptiveAshraeModelConfig)).toBe(ChartMode.Compliance);
    expect(getDefaultChartMode(utciModelConfig)).toBe(ChartMode.Explore);
    expect(seedModelChartSettings(adaptiveAshraeModelConfig).explore).toBeNull();
    expect(seedModelChartSettings(utciModelConfig).explore?.zOutput)
      .toBe(ModelOutputKey.Utci);
  });

  it("seeds independent Explore bands and reseeds defaults when output changes", () => {
    const settings = seedModelChartSettings(pmvAshraeModelConfig);
    const declaration = pmvAshraeModelConfig.chartableOutputs[0];
    expect(settings.explore?.bands).toEqual(declaration.defaultBands);
    expect(settings.explore?.bands).not.toBe(declaration.defaultBands);
    expect(settings.explore?.bands[0]).not.toBe(declaration.defaultBands[0]);

    const ppd = selectExploreOutput(
      pmvAshraeModelConfig,
      settings.explore,
      ModelOutputKey.Ppd,
    );
    expect(ppd?.zOutput).toBe(ModelOutputKey.Ppd);
    expect(ppd?.bands).toEqual(pmvAshraeModelConfig.chartableOutputs[1].defaultBands);
    expect(selectExploreOutput(
      pmvAshraeModelConfig,
      settings.explore,
      ModelOutputKey.Utci,
    )).toBeNull();
  });

  it("keeps edited Explore bands isolated from the locked Compliance config", () => {
    const seeded = seedModelChartSettings(pmvAshraeModelConfig);
    const editedExplore = replaceExploreBands(
      pmvAshraeModelConfig,
      seeded.explore,
      [{ min: -Infinity, max: Infinity, label: "Edited", color: "#123456" }],
    );
    expect(editedExplore).not.toBeNull();

    const exploreSettings = {
      ...seeded,
      mode: ChartMode.Explore,
      explore: editedExplore,
    };
    const exploreConfig = buildFieldChartConfig(pmvAshraeModelConfig, exploreSettings);
    const complianceConfig = buildFieldChartConfig(pmvAshraeModelConfig, {
      ...exploreSettings,
      mode: ChartMode.Compliance,
    });

    expect(exploreConfig?.bands[0].label).toBe("Edited");
    expect(complianceConfig).toEqual(expect.objectContaining({
      mode: ChartMode.Compliance,
      zOutput: pmvAshraeModelConfig.complianceSpec?.output,
    }));
    expect(complianceConfig?.bands).toBe(pmvAshraeModelConfig.complianceSpec?.bands);
    expect(complianceConfig?.bands[0].label).not.toBe("Edited");
  });

  it("rejects unsupported modes, axes, outputs, and invalid band replacements", () => {
    const pmvSettings = seedModelChartSettings(pmvAshraeModelConfig);
    expect(selectChartMode(
      pmvAshraeModelConfig,
      pmvSettings,
      ChartMode.Explore,
    )?.mode).toBe(ChartMode.Explore);
    expect(selectChartMode(
      adaptiveAshraeModelConfig,
      seedModelChartSettings(adaptiveAshraeModelConfig),
      ChartMode.Explore,
    )).toBeNull();
    expect(selectChartMode(
      utciModelConfig,
      seedModelChartSettings(utciModelConfig),
      ChartMode.Compliance,
    )).toBeNull();

    expect(buildFieldChartConfig(pmvAshraeModelConfig, {
      ...pmvSettings,
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.DryBulbTemperature,
    })).toBeNull();
    expect(replaceExploreBands(pmvAshraeModelConfig, pmvSettings.explore, [
      { min: 0, max: 2, label: "One", color: "#000" },
      { min: 1, max: 3, label: "Two", color: "#fff" },
    ])).toBeNull();
  });
});
