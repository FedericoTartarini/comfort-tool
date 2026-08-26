import { describe, expect, it } from "vitest";

import { ModelId } from "../../models/modelIds";
import { requiredControlIdsByModel } from "../../testSupport/requiredModelControls";
import { adaptiveAshraeModelConfig } from "./adaptiveAshrae";
import { adaptiveEnModelConfig } from "./adaptiveEn";

describe("Adaptive standard declarations", () => {
  it("pins required Analysis controls independently of inputFields", () => {
    expect(adaptiveAshraeModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.AdaptiveAshrae],
    ]);
    expect(adaptiveEnModelConfig.controls.map(({ id }) => id)).toEqual([
      ...requiredControlIdsByModel[ModelId.AdaptiveEn],
    ]);
  });
});
