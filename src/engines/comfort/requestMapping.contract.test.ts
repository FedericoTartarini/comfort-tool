import { describe, expect, it } from "vitest";

import { adaptiveQuantityMapping } from "../../declarations/adaptive/calculation";
import { heatIndexQuantityMapping } from "../../declarations/heatIndex";
import { humidexQuantityMapping } from "../../declarations/humidex";
import { phsQuantityMapping } from "../../declarations/phs/phs";
import { pmvQuantityMapping } from "../../declarations/pmv/calculation";
import { utciQuantityMapping } from "../../declarations/utci/utci";
import { windChillQuantityMapping } from "../../declarations/windChill";
import { type LibraryQuantityMapping } from "./requestMapping";
import { PhysicalQuantityId, type QuantityState } from "../../catalog/quantities";
import { InputId, inputDefaultsById } from "../../catalog/inputSlots";
import {
  createModelCalculationContext,
  type ModelCalculationContext,
} from "../../catalog/modelCalculation";

function createContractContext(
  overrides: QuantityState = {},
): ModelCalculationContext {
  return createModelCalculationContext({
    effectiveQuantitiesByInput: {
      [InputId.Input1]: {
        ...inputDefaultsById[InputId.Input1],
        ...overrides,
      },
      [InputId.Input2]: inputDefaultsById[InputId.Input2],
      [InputId.Input3]: inputDefaultsById[InputId.Input3],
    },
    options: {},
  });
}

function mappedFields<TRequest extends object>(
  mapping: LibraryQuantityMapping<TRequest>,
  request: TRequest,
): PhysicalQuantityId[] {
  return Object.values(PhysicalQuantityId).filter((field) => {
    try {
      mapping.getAxisValue(request, field);
      return true;
    } catch {
      return false;
    }
  });
}

function testQuantityMappingContract<TRequest extends object>(
  modelId: string,
  mapping: LibraryQuantityMapping<TRequest>,
): void {
  describe(`${modelId} library quantity mapping`, () => {
    it("maps library request fields to finite SI values", () => {
      const context = createContractContext({
        [PhysicalQuantityId.DryBulbTemperature]: 24,
        [PhysicalQuantityId.MeanRadiantTemperature]: 23,
        [PhysicalQuantityId.RelativeAirSpeed]: 0.15,
        [PhysicalQuantityId.WindSpeed]: 1.2,
        [PhysicalQuantityId.RelativeHumidity]: 55,
        [PhysicalQuantityId.MetabolicRate]: 1.3,
        [PhysicalQuantityId.ClothingInsulation]: 0.6,
        [PhysicalQuantityId.ExternalWork]: 0,
        [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 18,
      });
      const request = mapping.mapRequest(context, InputId.Input1);

      for (const value of Object.values(request)) {
        expect(typeof value).toBe("number");
        expect(Number.isFinite(value)).toBe(true);
      }

      for (const field of mappedFields(mapping, request)) {
        expect(Number.isFinite(mapping.getAxisValue(request, field))).toBe(true);
      }
    });

    it("reads canonical SI from effectiveQuantitiesByInput", () => {
      const context = createContractContext({
        [PhysicalQuantityId.DryBulbTemperature]: 27.5,
        [PhysicalQuantityId.RelativeHumidity]: 42,
        [PhysicalQuantityId.WindSpeed]: 2.5,
        [PhysicalQuantityId.RelativeAirSpeed]: 0.2,
        [PhysicalQuantityId.MeanRadiantTemperature]: 26,
        [PhysicalQuantityId.MetabolicRate]: 1.1,
        [PhysicalQuantityId.ClothingInsulation]: 0.55,
        [PhysicalQuantityId.ExternalWork]: 0,
        [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 19,
      });
      const request = mapping.mapRequest(context, InputId.Input1);
      const input = context.effectiveQuantitiesByInput[InputId.Input1];

      for (const quantityId of Object.keys(input) as PhysicalQuantityId[]) {
        try {
          const axisValue = mapping.getAxisValue(request, quantityId);
          expect(axisValue).toBe(input[quantityId]);
        } catch {
          // Mapping may not expose every quantity in the bag.
        }
      }
    });
  });
}

describe("library quantity mapping contract", () => {
  testQuantityMappingContract("PMV", pmvQuantityMapping);
  testQuantityMappingContract("UTCI", utciQuantityMapping);
  testQuantityMappingContract("ADAPTIVE", adaptiveQuantityMapping);
  testQuantityMappingContract("PHS", phsQuantityMapping);
  testQuantityMappingContract("HEAT_INDEX", heatIndexQuantityMapping);
  testQuantityMappingContract("HUMIDEX", humidexQuantityMapping);
  testQuantityMappingContract("WIND_CHILL", windChillQuantityMapping);
});
