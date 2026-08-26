import { describe, expect, it } from "vitest";

import { ModelId } from "../catalog/modelIds";
import {
  PhysicalQuantityId,
  getPhysicalQuantityMeta,
  type PrimaryQuantityId,
} from "../catalog/quantities";
import { comfortModelConfigs, comfortModelOrder } from "../state/analysis/modelConfigs";
import {
  declaredPrimaryQuantityIdsForModel,
  declaredControlIdsForModel,
  explicitGoldenPrimaryOverrides,
  getGoldenInputOverrides,
  getGoldenModelInputOverrides,
  standardPrimaryFixture,
} from "./goldenFixtures";
import {
  requiredControlIdsByModel,
  requiredPrimaryQuantitiesByModel,
} from "./requiredModelControls";
import {
  declaredSiRangeForInputField,
  primaryQuantityIdsForInputField,
} from "../services/comfort/controls/fieldInputBehaviors";

function rangeForDeclaredPrimary(
  modelId: (typeof comfortModelOrder)[number],
  quantityId: PrimaryQuantityId,
) {
  for (const spec of comfortModelConfigs[modelId].inputFields) {
    if (primaryQuantityIdsForInputField(spec).includes(quantityId)) {
      return declaredSiRangeForInputField(spec, quantityId);
    }
  }
  throw new Error(`${modelId} does not declare ${quantityId}.`);
}

function isInRange(value: number, range: { minSi: number; maxSi: number }) {
  return value >= range.minSi && value <= range.maxSi;
}

describe("golden fixtures — registry derivation", () => {
  it("covers every registered model with independently authored required controls", () => {
    expect(Object.keys(requiredControlIdsByModel).sort()).toEqual(
      [...comfortModelOrder].sort(),
    );
    expect(Object.keys(requiredPrimaryQuantitiesByModel).sort()).toEqual(
      [...comfortModelOrder].sort(),
    );
  });

  it("fills Compare golden keys from the independently required primaries", () => {
    for (const modelId of comfortModelOrder) {
      const overrides = getGoldenInputOverrides(modelId);
      expect(Object.keys(overrides).sort()).toEqual(
        [...requiredPrimaryQuantitiesByModel[modelId]].sort(),
      );

      for (const quantityId of requiredPrimaryQuantitiesByModel[modelId]) {
        const value = overrides[quantityId];
        expect(value).toEqual(expect.any(Number));
        const catalogDefault = getPhysicalQuantityMeta(quantityId).defaultSi;
        if (value !== standardPrimaryFixture[quantityId]) {
          expect(value).not.toBe(catalogDefault);
        }
      }
    }
  });

  it("uses an explicit golden only when the standard fixture is outside the declared range", () => {
    for (const modelId of comfortModelOrder) {
      const explicit = explicitGoldenPrimaryOverrides[modelId] ?? {};
      const declared = new Set(declaredPrimaryQuantityIdsForModel(modelId));

      for (const quantityId of Object.keys(explicit) as PrimaryQuantityId[]) {
        expect(declared.has(quantityId)).toBe(true);
        const range = rangeForDeclaredPrimary(modelId, quantityId);
        expect(isInRange(standardPrimaryFixture[quantityId], range)).toBe(false);
        expect(isInRange(explicit[quantityId] as number, range)).toBe(true);
      }

      for (const quantityId of declared) {
        const range = rangeForDeclaredPrimary(modelId, quantityId);
        if (!isInRange(standardPrimaryFixture[quantityId], range)) {
          expect(explicit[quantityId]).toEqual(expect.any(Number));
        } else {
          expect(explicit[quantityId]).toBeUndefined();
        }
      }
    }
  });

  it("keeps Wind Chill air temperature as an explicit in-range golden", () => {
    expect(
      getGoldenInputOverrides(ModelId.WindChill)[
        PhysicalQuantityId.DryBulbTemperature
      ],
    ).toBe(-10);
    expect(
      getGoldenInputOverrides(ModelId.HeatIndex)[
        PhysicalQuantityId.DryBulbTemperature
      ],
    ).toBe(standardPrimaryFixture[PhysicalQuantityId.DryBulbTemperature]);
  });

  it("keeps assembled controls in lockstep with inputFields, without treating that as the declaration pin", () => {
    for (const modelId of comfortModelOrder) {
      const config = comfortModelConfigs[modelId];
      expect(config.controls.map(({ id }) => id)).toEqual(
        declaredControlIdsForModel(modelId),
      );
      expect(config.controls.map(({ id }) => id)).toEqual([
        ...requiredControlIdsByModel[modelId],
      ]);
    }
  });

  it("derives model-scoped golden inputs from the assembled catalog for that model", () => {
    const phsInputs = getGoldenModelInputOverrides(ModelId.Phs2023);
    expect(Object.keys(phsInputs).length).toBeGreaterThan(0);
    expect(getGoldenModelInputOverrides(ModelId.HeatIndex)).toEqual({});
  });
});
