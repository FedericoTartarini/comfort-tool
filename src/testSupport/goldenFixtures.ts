import { ModelId, type ModelId as ModelIdType } from "../catalog/modelIds";
import {
  createModelCalculationContext,
  type ModelCalculationContext,
} from "../catalog/modelCalculation";
import {
  PhysicalQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type QuantityState,
} from "../catalog/quantities";
import { InputId } from "../catalog/inputSlots";
import { defaultPhsPersonSettings } from "../catalog/phs";
import { comfortModelConfigs } from "../state/modelRegistry";
import {
  createQuantitiesByInput,
} from "../state/pointSession/initialPointSessionState";
import type { PmvRequest } from "../declarations/pmv/calculation";
import type { UtciRequest } from "../declarations/utci/utci";
import {
  declaredSiRangeForInputField,
  inputFieldControlId,
  primaryQuantityIdsForInputField,
} from "../engines/comfort/controls/fieldInputBehaviors";

/**
 * Independent SI Compare goldens used across regression tests.
 * Do not replace these with Compare-slot seeds from `inputDefaultsById`.
 */
export const standardPrimaryFixture: QuantityState = {
  [PhysicalQuantityId.DryBulbTemperature]: 26,
  [PhysicalQuantityId.MeanRadiantTemperature]: 25,
  [PhysicalQuantityId.RelativeAirSpeed]: 0.1,
  [PhysicalQuantityId.WindSpeed]: 1,
  [PhysicalQuantityId.RelativeHumidity]: 50,
  [PhysicalQuantityId.MetabolicRate]: 1.2,
  [PhysicalQuantityId.ClothingInsulation]: 0.5,
  [PhysicalQuantityId.ExternalWork]: 0,
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 20,
};

/**
 * Explicit SI values only when `standardPrimaryFixture` is outside a model's
 * declared control range. Do not invent these from min/max.
 */
export const explicitGoldenPrimaryOverrides: Partial<
  Record<ModelIdType, QuantityState>
> = {
  [ModelId.WindChill]: {
    [PhysicalQuantityId.DryBulbTemperature]: -10,
  },
};

/** Known-value PHS snapshot inputs. Not Compare goldens. */
export const phsBaselineInputOverrides: QuantityState = {
  [PhysicalQuantityId.DryBulbTemperature]: 35,
  [PhysicalQuantityId.MeanRadiantTemperature]: 35,
  [PhysicalQuantityId.WindSpeed]: 0.1,
  [PhysicalQuantityId.RelativeHumidity]: 71,
  [PhysicalQuantityId.MetabolicRate]: 2.6,
  [PhysicalQuantityId.ClothingInsulation]: 0.5,
};

/** Known-value PHS reference person. Not Compare goldens. */
export const phsBaselineModelInputs: QuantityState = {
  [PhysicalQuantityId.BodyWeight]: 75,
  [PhysicalQuantityId.Height]: 1.8,
};

function isValueInDeclaredRange(
  value: number,
  range: { minSi: number; maxSi: number },
): boolean {
  return value >= range.minSi && value <= range.maxSi;
}

export function declaredPrimaryQuantityIdsForModel(
  modelId: ModelIdType,
): PhysicalQuantityIdType[] {
  const seen = new Set<PhysicalQuantityIdType>();
  const quantityIds: PhysicalQuantityIdType[] = [];
  for (const spec of comfortModelConfigs[modelId].inputFields) {
    for (const quantityId of primaryQuantityIdsForInputField(spec)) {
      if (seen.has(quantityId)) continue;
      seen.add(quantityId);
      quantityIds.push(quantityId);
    }
  }
  return quantityIds;
}

export function declaredControlIdsForModel(
  modelId: ModelIdType,
): ReturnType<typeof inputFieldControlId>[] {
  return comfortModelConfigs[modelId].inputFields.map(inputFieldControlId);
}

function declaredRangeForModelPrimary(
  modelId: ModelIdType,
  quantityId: PhysicalQuantityIdType,
): { minSi: number; maxSi: number } {
  for (const spec of comfortModelConfigs[modelId].inputFields) {
    if (primaryQuantityIdsForInputField(spec).includes(quantityId)) {
      return declaredSiRangeForInputField(spec, quantityId);
    }
  }
  throw new Error(`${modelId} does not declare ${quantityId}.`);
}

/**
 * Registry-derived golden input overrides: declared input fields, filled from
 * `standardPrimaryFixture` when that value is inside the declared range.
 */
export function getGoldenInputOverrides(
  modelId: ModelIdType,
): QuantityState {
  const overrides: QuantityState = {};
  const explicit = explicitGoldenPrimaryOverrides[modelId] ?? {};

  for (const quantityId of declaredPrimaryQuantityIdsForModel(modelId)) {
    const fixtureValue = standardPrimaryFixture[quantityId];
    const range = declaredRangeForModelPrimary(modelId, quantityId);
    if (fixtureValue !== undefined && isValueInDeclaredRange(fixtureValue, range)) {
      overrides[quantityId] = fixtureValue;
      continue;
    }

    const explicitValue = explicit[quantityId];
    if (explicitValue === undefined) {
      throw new Error(
        `Missing explicit golden SI for ${modelId} ${quantityId}: standard fixture ${fixtureValue} is outside declared range [${range.minSi}, ${range.maxSi}]. Do not invent a value from min/max.`,
      );
    }
    if (!isValueInDeclaredRange(explicitValue, range)) {
      throw new Error(
        `Explicit golden SI for ${modelId} ${quantityId}=${explicitValue} is outside declared range [${range.minSi}, ${range.maxSi}].`,
      );
    }
    overrides[quantityId] = explicitValue;
  }

  return overrides;
}

/** PHS person SI used by known-value snapshots. Other models have none. */
export function getGoldenModelInputOverrides(
  modelId: ModelIdType,
): QuantityState {
  if (modelId !== ModelId.Phs2023) {
    return {};
  }
  return {
    [PhysicalQuantityId.BodyWeight]:
      defaultPhsPersonSettings[PhysicalQuantityId.BodyWeight],
    [PhysicalQuantityId.Height]:
      defaultPhsPersonSettings[PhysicalQuantityId.Height],
  };
}

function mergePrimaryFixture(
  overrides: QuantityState = {},
): QuantityState {
  return {
    ...standardPrimaryFixture,
    ...overrides,
  };
}

export function pickUtciRequest(
  overrides: QuantityState = {},
): UtciRequest {
  const base = mergePrimaryFixture(overrides);
  return {
    tdb: base[PhysicalQuantityId.DryBulbTemperature]!,
    tr: base[PhysicalQuantityId.MeanRadiantTemperature]!,
    v: base[PhysicalQuantityId.WindSpeed]!,
    rh: base[PhysicalQuantityId.RelativeHumidity]!,
  };
}

export function pickPmvRequest(
  overrides: QuantityState = {},
  options: Pick<PmvRequest, "occupantHasAirSpeedControl"> = {
    occupantHasAirSpeedControl: true,
  },
): PmvRequest {
  const base = mergePrimaryFixture(overrides);
  return {
    tdb: base[PhysicalQuantityId.DryBulbTemperature]!,
    tr: base[PhysicalQuantityId.MeanRadiantTemperature]!,
    vr: base[PhysicalQuantityId.RelativeAirSpeed]!,
    rh: base[PhysicalQuantityId.RelativeHumidity]!,
    met: base[PhysicalQuantityId.MetabolicRate]!,
    clo: base[PhysicalQuantityId.ClothingInsulation]!,
    wme: base[PhysicalQuantityId.ExternalWork]!,
    ...options,
  };
}

export function createGoldenCalculationContext(
  modelId: ModelIdType,
  inputOverrides: QuantityState = {},
  modelInputOverrides: QuantityState = {},
): ModelCalculationContext {
  const config = comfortModelConfigs[modelId];
  const quantitiesByInput = createQuantitiesByInput();
  quantitiesByInput[InputId.Input1] = {
    ...quantitiesByInput[InputId.Input1],
    ...getGoldenModelInputOverrides(modelId),
    ...inputOverrides,
    ...modelInputOverrides,
  };
  const options = config.parseOptions(config.defaultOptions);
  if (!options) {
    throw new Error(`Invariant violation: invalid default options for ${modelId}.`);
  }

  return createModelCalculationContext({
    effectiveQuantitiesByInput: quantitiesByInput,
    options,
  });
}
