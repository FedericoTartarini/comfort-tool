import { describe, expect, it } from "vitest";

import { adaptiveAshraeModelConfig } from "../../declarations/adaptive/ashrae";
import { pmvAshraeModelConfig } from "../../declarations/pmv/ashrae";
import { utciModelConfig } from "../../declarations/utci/utci";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { SurfaceId } from "../../catalog/surfaces";
import {
  buildFieldChartProfile,
  replaceExploreBands,
  seedModelOutputSettings,
  selectExploreOutput,
} from "./fieldChartState";

describe("field chart state helpers", () => {
  it("seeds Explore output settings for Explore-capable models and omits them otherwise", () => {
    expect(seedModelOutputSettings(adaptiveAshraeModelConfig).exploreOutput).toBeNull();
    expect(seedModelOutputSettings(utciModelConfig).exploreOutput)
      .toBe(PhysicalQuantityId.Utci);
  });

  it("seeds independent Explore bands and reseeds defaults when output changes", () => {
    const settings = seedModelOutputSettings(pmvAshraeModelConfig);
    const declaration = pmvAshraeModelConfig.exploreOutputs[0];
    expect(settings.exploreBands).toEqual(declaration.defaultBands);
    expect(settings.exploreBands).not.toBe(declaration.defaultBands);
    expect(settings.exploreBands?.[0]).not.toBe(declaration.defaultBands[0]);

    const ppd = selectExploreOutput(
      pmvAshraeModelConfig,
      settings,
      PhysicalQuantityId.Ppd,
    );
    expect(ppd?.exploreOutput).toBe(PhysicalQuantityId.Ppd);
    expect(ppd?.exploreBands).toEqual(pmvAshraeModelConfig.exploreOutputs[1].defaultBands);
    expect(selectExploreOutput(
      pmvAshraeModelConfig,
      settings,
      PhysicalQuantityId.Utci,
    )).toBeNull();
  });

  it("keeps edited Explore bands isolated from the locked Compliance profile", () => {
    const seeded = seedModelOutputSettings(pmvAshraeModelConfig);
    const editedExplore = replaceExploreBands(
      pmvAshraeModelConfig,
      seeded,
      [{ min: -Infinity, max: Infinity, label: "Edited", color: "#123456" }],
    );
    expect(editedExplore).not.toBeNull();

    const exploreSettings = {
      ...seeded,
      exploreOutput: editedExplore!.exploreOutput,
      exploreBands: editedExplore!.exploreBands,
    };
    const exploreProfile = buildFieldChartProfile(
      pmvAshraeModelConfig,
      exploreSettings,
      SurfaceId.Explore,
    );
    const complianceProfile = buildFieldChartProfile(
      pmvAshraeModelConfig,
      exploreSettings,
      SurfaceId.Standard,
    );

    expect(exploreProfile.bands[0].label).toBe("Edited");
    expect(complianceProfile.zOutput).toBe(pmvAshraeModelConfig.complianceProfile?.output);
    expect(complianceProfile.bands).toBe(pmvAshraeModelConfig.complianceProfile?.bands);
    expect(complianceProfile.bands[0].label).not.toBe("Edited");
  });

  it("rejects invalid band replacements", () => {
    const pmvSettings = seedModelOutputSettings(pmvAshraeModelConfig);
    expect(replaceExploreBands(pmvAshraeModelConfig, pmvSettings, [
      { min: 0, max: 2, label: "One", color: "#000" },
      { min: 1, max: 3, label: "Two", color: "#fff" },
    ])).toBeNull();
  });

  it("reports missing Compliance and Explore declarations instead of fabricating profiles", () => {
    const complianceSettings = seedModelOutputSettings(pmvAshraeModelConfig);
    expect(() => buildFieldChartProfile(
      { ...pmvAshraeModelConfig, complianceProfile: undefined },
      complianceSettings,
      SurfaceId.Standard,
    )).toThrow(/missing its compliance profile/i);

    expect(() => buildFieldChartProfile(pmvAshraeModelConfig, {
      ...complianceSettings,
      exploreOutput: PhysicalQuantityId.Utci,
      exploreBands: [],
    }, SurfaceId.Explore)).toThrow(/missing its Explore output settings/i);
  });
});
