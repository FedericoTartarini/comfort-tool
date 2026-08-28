import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../catalog/quantities";

import { ModelId } from "../catalog/modelIds";
import { InputId } from "../catalog/inputSlots";
import { createPointSession } from "../state/pointSession/createPointSession.svelte";
import { comfortModelOrder } from "../state/modelRegistry";
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

  it("does not skip a third input that produced no result", async () => { const session = createPointSession();
    await assertCompareContract(ModelId.PmvAshrae, session);
    expect(session.visibleInputIds).toEqual([
      InputId.Input1, InputId.Input2, InputId.Input3, ]);
    expect(
      session.calculationCacheByModel[ModelId.PmvAshrae]
        .resultsByInput[InputId.Input3], ).not.toBeNull();
    expect(
      session.input.quantitiesByInput[InputId.Input3][
        PhysicalQuantityId.DryBulbTemperature
      ], ).not.toBe(
      session.input.quantitiesByInput[InputId.Input1][
        PhysicalQuantityId.DryBulbTemperature
      ], ); });
});
