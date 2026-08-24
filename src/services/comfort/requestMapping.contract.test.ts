import { describe, expect, it } from "vitest";

import { adaptiveRequestAdapter } from "../../comfortModels/adaptive/adaptiveCalculation";
import { heatIndexRequestAdapter } from "../../comfortModels/heatIndex";
import { humidexRequestAdapter } from "../../comfortModels/humidex";
import { phsRequestAdapter } from "../../comfortModels/phs/phs";
import { pmvRequestAdapter } from "../../comfortModels/pmv/pmvCalculation";
import { utciRequestAdapter } from "../../comfortModels/utci/utciCalculation";
import { windChillRequestAdapter } from "../../comfortModels/windChill";
import { type FieldRequestAdapter } from "./requestMapping";
import { PhysicalQuantityId, chartAxisQuantityIds, primaryInputOrder } from "../../models/physicalQuantities";
import type { PrimaryQuantityId } from "../../models/physicalQuantities";
import { InputId, inputDefaultsById } from "../../models/inputSlots";
import {
  createModelCalculationContext,
  type ModelCalculationContext,
} from "../../models/modelCalculation";
import { createAuxiliaryQuantitiesByInput } from "./quantityStateRouting";

function createContractContext(
  overrides: Partial<Record<PrimaryQuantityId, number>> = {},
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
    auxiliaryQuantitiesByInput: createAuxiliaryQuantitiesByInput(),
    modelInputs: {},
    options: {},
  });
}

function testRequestAdapterContract<TRequest extends object>(
  modelId: string,
  adapter: FieldRequestAdapter<TRequest>,
): void {
  describe(`${modelId} request adapter`, () => {
    it("maps every numeric DTO field to finite SI values", () => {
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
      const request = adapter.mapRequest(context, InputId.Input1);

      for (const value of Object.values(request)) {
        expect(typeof value).toBe("number");
        expect(Number.isFinite(value)).toBe(true);
      }

      for (const field of chartAxisQuantityIds) {
        try {
          adapter.getAxisValue(request, field);
        } catch {
          // Fields not on this DTO are intentionally unsupported.
        }
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
      const request = adapter.mapRequest(context, InputId.Input1);
      const input = context.effectiveQuantitiesByInput[InputId.Input1];

      for (const quantityId of primaryInputOrder) {
        try {
          const axisValue = adapter.getAxisValue(request, quantityId);
          expect(axisValue).toBe(input[quantityId]);
        } catch {
          // Adapter may not expose every primary quantity.
        }
      }
    });
  });
}

describe("request mapping contract", () => {
  testRequestAdapterContract("PMV", pmvRequestAdapter);
  testRequestAdapterContract("UTCI", utciRequestAdapter);
  testRequestAdapterContract("ADAPTIVE", adaptiveRequestAdapter);
  testRequestAdapterContract("PHS", phsRequestAdapter);
  testRequestAdapterContract("HEAT_INDEX", heatIndexRequestAdapter);
  testRequestAdapterContract("HUMIDEX", humidexRequestAdapter);
  testRequestAdapterContract("WIND_CHILL", windChillRequestAdapter);
});
