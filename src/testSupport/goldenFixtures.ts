import { ComfortModel, type ComfortModel as ComfortModelType } from "../models/comfortModels";
import {
  createModelCalculationContext,
  type ModelCalculationContext,
} from "../models/modelCalculation";
import {
  PhysicalQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PrimaryInputState,
} from "../models/physicalQuantities";
import { InputId } from "../models/inputSlots";
import { comfortModelConfigs } from "../state/comfortTool/modelConfigs";
import { createQuantitiesByInput } from "../state/comfortTool/initialComfortToolState";
import {
  createAuxiliaryQuantitiesByInput,
  createDefaultModelInputsForModel,
} from "../services/comfort/quantityStateRouting";
import type { PmvRequestDto } from "../comfortModels/pmv/pmvCalculation";
import type { UtciRequestDto } from "../comfortModels/utci/utciCalculation";

/** Standard SI primary inputs used across golden regression tests. */
export const standardPrimaryFixture = {
  [PhysicalQuantityId.DryBulbTemperature]: 26,
  [PhysicalQuantityId.MeanRadiantTemperature]: 25,
  [PhysicalQuantityId.RelativeAirSpeed]: 0.1,
  [PhysicalQuantityId.WindSpeed]: 1,
  [PhysicalQuantityId.RelativeHumidity]: 50,
  [PhysicalQuantityId.MetabolicRate]: 1.2,
  [PhysicalQuantityId.ClothingInsulation]: 0.5,
  [PhysicalQuantityId.ExternalWork]: 0,
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 20,
} satisfies PrimaryInputState;

export const expectedControlCounts: Record<ComfortModelType, number> = {
  [ComfortModel.PmvAshrae]: 6,
  [ComfortModel.PmvIso]: 6,
  [ComfortModel.Utci]: 4,
  [ComfortModel.AdaptiveAshrae]: 4,
  [ComfortModel.AdaptiveEn]: 4,
  [ComfortModel.HeatIndex]: 2,
  [ComfortModel.Humidex]: 2,
  [ComfortModel.WindChill]: 2,
  [ComfortModel.Phs2023]: 6,
};

function mergePrimaryFixture(
  overrides: Partial<PrimaryInputState> = {},
): PrimaryInputState {
  return {
    ...standardPrimaryFixture,
    ...overrides,
  };
}

export function pickUtciRequest(
  overrides: Partial<PrimaryInputState> = {},
): UtciRequestDto {
  const base = mergePrimaryFixture(overrides);
  return {
    tdb: base[PhysicalQuantityId.DryBulbTemperature],
    tr: base[PhysicalQuantityId.MeanRadiantTemperature],
    v: base[PhysicalQuantityId.WindSpeed],
    rh: base[PhysicalQuantityId.RelativeHumidity],
  };
}

export function pickPmvRequest(
  overrides: Partial<PrimaryInputState> = {},
  options: Pick<PmvRequestDto, "occupantHasAirSpeedControl"> = {
    occupantHasAirSpeedControl: true,
  },
): PmvRequestDto {
  const base = mergePrimaryFixture(overrides);
  return {
    tdb: base[PhysicalQuantityId.DryBulbTemperature],
    tr: base[PhysicalQuantityId.MeanRadiantTemperature],
    vr: base[PhysicalQuantityId.RelativeAirSpeed],
    rh: base[PhysicalQuantityId.RelativeHumidity],
    met: base[PhysicalQuantityId.MetabolicRate],
    clo: base[PhysicalQuantityId.ClothingInsulation],
    wme: base[PhysicalQuantityId.ExternalWork],
    ...options,
  };
}

export function createGoldenCalculationContext(
  modelId: ComfortModelType,
  inputOverrides: Partial<PrimaryInputState> = {},
  modelInputOverrides: Partial<Record<PhysicalQuantityIdType, number>> = {},
): ModelCalculationContext {
  const config = comfortModelConfigs[modelId];
  const quantitiesByInput = createQuantitiesByInput();
  quantitiesByInput[InputId.Input1] = {
    ...quantitiesByInput[InputId.Input1],
    ...inputOverrides,
  };
  const options = config.parseOptions(config.defaultOptions);
  if (!options) {
    throw new Error(`Invariant violation: invalid default options for ${modelId}.`);
  }

  return createModelCalculationContext({
    effectiveQuantitiesByInput: quantitiesByInput,
    auxiliaryQuantitiesByInput: createAuxiliaryQuantitiesByInput(),
    modelInputs: {
      ...createDefaultModelInputsForModel(modelId),
      ...modelInputOverrides,
    },
    options,
  });
}

export const pmvBaselineInputOverrides: Partial<PrimaryInputState> = {
  [PhysicalQuantityId.DryBulbTemperature]:
    standardPrimaryFixture[PhysicalQuantityId.DryBulbTemperature],
  [PhysicalQuantityId.MeanRadiantTemperature]:
    standardPrimaryFixture[PhysicalQuantityId.MeanRadiantTemperature],
  [PhysicalQuantityId.RelativeAirSpeed]:
    standardPrimaryFixture[PhysicalQuantityId.RelativeAirSpeed],
  [PhysicalQuantityId.RelativeHumidity]:
    standardPrimaryFixture[PhysicalQuantityId.RelativeHumidity],
  [PhysicalQuantityId.MetabolicRate]:
    standardPrimaryFixture[PhysicalQuantityId.MetabolicRate],
  [PhysicalQuantityId.ClothingInsulation]:
    standardPrimaryFixture[PhysicalQuantityId.ClothingInsulation],
  [PhysicalQuantityId.ExternalWork]:
    standardPrimaryFixture[PhysicalQuantityId.ExternalWork],
};

export const utciBaselineInputOverrides: Partial<PrimaryInputState> = {
  [PhysicalQuantityId.DryBulbTemperature]:
    standardPrimaryFixture[PhysicalQuantityId.DryBulbTemperature],
  [PhysicalQuantityId.MeanRadiantTemperature]:
    standardPrimaryFixture[PhysicalQuantityId.MeanRadiantTemperature],
  [PhysicalQuantityId.WindSpeed]:
    standardPrimaryFixture[PhysicalQuantityId.WindSpeed],
  [PhysicalQuantityId.RelativeHumidity]:
    standardPrimaryFixture[PhysicalQuantityId.RelativeHumidity],
};

export const phsBaselineInputOverrides: Partial<PrimaryInputState> = {
  [PhysicalQuantityId.DryBulbTemperature]: 35,
  [PhysicalQuantityId.MeanRadiantTemperature]: 35,
  [PhysicalQuantityId.WindSpeed]: 0.1,
  [PhysicalQuantityId.RelativeHumidity]: 71,
  [PhysicalQuantityId.MetabolicRate]: 2.6,
  [PhysicalQuantityId.ClothingInsulation]: 0.5,
};

export const phsBaselineModelInputs: Partial<Record<PhysicalQuantityIdType, number>> = {
  [PhysicalQuantityId.PhsBodyWeight]: 75,
  [PhysicalQuantityId.PhsHeight]: 1.8,
};

export const adaptiveBaselineInputOverrides: Partial<PrimaryInputState> = {
  [PhysicalQuantityId.DryBulbTemperature]:
    standardPrimaryFixture[PhysicalQuantityId.DryBulbTemperature],
  [PhysicalQuantityId.MeanRadiantTemperature]:
    standardPrimaryFixture[PhysicalQuantityId.MeanRadiantTemperature],
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]:
    standardPrimaryFixture[PhysicalQuantityId.PrevailingMeanOutdoorTemperature],
};
