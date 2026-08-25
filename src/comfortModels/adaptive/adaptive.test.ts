import { describe, expect, it } from "vitest";

import { ComfortModel } from "../../models/comfortModels";
import { requiredControlIdsByModel } from "../../testSupport/requiredModelControls";
import { adaptiveAshraeModelConfig } from "./adaptiveAshrae";
import { adaptiveEnModelConfig } from "./adaptiveEn";

describe("Adaptive standard declarations", () => {
  it("pins required Analysis controls independently of inputFields", () => {
    expect(adaptiveAshraeModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ComfortModel.AdaptiveAshrae],
    ]);
    expect(adaptiveEnModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ComfortModel.AdaptiveEn],
    ]);
  });
});
