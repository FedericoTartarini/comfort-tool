import { describe, expect, it } from "vitest";

import { ComfortModel } from "../models/comfortModels";
import { InputId } from "../models/inputSlots";
import { PhysicalQuantityId } from "../models/physicalQuantities";
import { createComfortToolState } from "../state/comfortTool/createComfortToolState.svelte";
import { comfortModelOrder } from "../state/comfortTool/modelConfigs";
import {
  assertCompareContract,
} from "./assertCompareContract";
import {
  getGoldenInputOverrides,
} from "./goldenFixtures";
import { requiredPrimaryQuantitiesByModel } from "./requiredModelControls";

describe("assertCompareContract", () => {
  it("covers every registered Analysis model", () => {
    expect(comfortModelOrder.length).toBeGreaterThan(0);
    for (const modelId of comfortModelOrder) {
      expect(Object.keys(getGoldenInputOverrides(modelId)).sort()).toEqual(
        [...requiredPrimaryQuantitiesByModel[modelId]].sort(),
      );
    }
  });

  for (const modelId of comfortModelOrder) {
    it(`holds the Compare contract for ${modelId}`, async () => {
      await assertCompareContract(modelId);
    }, 20_000);
  }

  it("does not skip a third input that produced no result", async () => {
    const controller = createComfortToolState();
    await assertCompareContract(ComfortModel.PmvAshrae, controller);
    expect(controller.selectors.getVisibleInputIds()).toEqual([
      InputId.Input1,
      InputId.Input2,
      InputId.Input3,
    ]);
    expect(
      controller.state.ui.calculationCacheByModel[ComfortModel.PmvAshrae]
        .resultsByInput[InputId.Input3],
    ).not.toBeNull();
    expect(
      controller.state.quantitiesByInput[InputId.Input3][
        PhysicalQuantityId.DryBulbTemperature
      ],
    ).not.toBe(
      controller.state.quantitiesByInput[InputId.Input1][
        PhysicalQuantityId.DryBulbTemperature
      ],
    );
  });
});
