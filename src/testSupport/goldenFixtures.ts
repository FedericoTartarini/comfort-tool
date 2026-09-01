import { ModelId, type ModelId as ModelIdType } from "../catalog/modelIds";
import {
  createModelCalculationContext,
  type ModelCalculationContext,
} from "../catalog/modelCalculation";
import {
  PhysicalQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PrimaryInputState,
  type PrimaryQuantityId,
} from "../catalog/quantities";
import { InputId } from "../catalog/inputSlots";
import { comfortModelConfigs } from "../state/modelRegistry";
import {
  createQuantitiesByInput,
  createDefaultModelInputsForModel,
} from "../state/pointSession/initialPointSessionState";
import {
  createAuxiliaryQuantitiesByInput,
} from "../engines/comfort/quantityStateRouting";
import type { PmvRequest } from "../declarations/pmv/calculation";
import type { UtciRequest } from "../declarations/utci/utci";
import {
  declaredSiRangeForInputField,
  inputFieldControlId,
  primaryQuantityIdsForInputField,
} from "../engines/comfort/controls/fieldInputBehaviors";

/**
 * Independent SI primary goldens used across regression tests.
 * Do not replace these with catalog `defaultSi` — that would hide a default bug.
 */
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

/**
 * Explicit SI values only when `standardPrimaryFixture` is outside a model's
 * declared control range. Do not invent these from min/max or catalog
 * `defaultSi`.
 */
export const explicitGoldenPrimaryOverrides: Partial<
  Record<ModelIdType, Partial<PrimaryInputState>>
> = {
  [ModelId.WindChill]: {
    [PhysicalQuantityId.DryBulbTemperature]: -10,
  },
};

/** Known-value PHS snapshot inputs. Not Compare goldens. */
export const phsBaselineInputOverrides: Partial<PrimaryInputState> = {
  [PhysicalQuantityId.DryBulbTemperature]: 35,
  [PhysicalQuantityId.MeanRadiantTemperature]: 35,
  [PhysicalQuantityId.WindSpeed]: 0.1,
  [PhysicalQuantityId.RelativeHumidity]: 71,
  [PhysicalQuantityId.MetabolicRate]: 2.6,
  [PhysicalQuantityId.ClothingInsulation]: 0.5,
};

/** Known-value PHS reference person. Not Compare goldens. */
export const phsBaselineModelInputs: Partial<Record<PhysicalQuantityIdType, number>> = {
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
): PrimaryQuantityId[] {
  const seen = new Set<PrimaryQuantityId>();
  const quantityIds: PrimaryQuantityId[] = [];
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
  quantityId: PrimaryQuantityId,
): { minSi: number; maxSi: number } {
  for (const spec of comfortModelConfigs[modelId].inputFields) {
    if (primaryQuantityIdsForInputField(spec).includes(quantityId)) {
      return declaredSiRangeForInputField(spec, quantityId);
    }
  }
  throw new Error(`${modelId} does not declare primary ${quantityId}.`);
}

/**
 * Registry-derived golden primary overrides: declared input fields, filled from
 * `standardPrimaryFixture` when that value is inside the declared range.
 */
export function getGoldenInputOverrides(
  modelId: ModelIdType,
): Partial<PrimaryInputState> {
  const overrides: Partial<PrimaryInputState> = {};
  const explicit = explicitGoldenPrimaryOverrides[modelId] ?? {};

  for (const quantityId of declaredPrimaryQuantityIdsForModel(modelId)) {
    const fixtureValue = standardPrimaryFixture[quantityId];
    const range = declaredRangeForModelPrimary(modelId, quantityId);
    if (isValueInDeclaredRange(fixtureValue, range)) {
      overrides[quantityId] = fixtureValue;
      continue;
    }

    const explicitValue = explicit[quantityId];
    if (explicitValue === undefined) {
      throw new Error(
        `Missing explicit golden SI for ${modelId} ${quantityId}: standard fixture ${fixtureValue} is outside declared range [${range.minSi}, ${range.maxSi}]. Do not invent a value from min/max or catalog defaultSi.`,
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

/** Registry-derived model-scoped SI (catalog defaults for that model's extend list). */
export function getGoldenModelInputOverrides(
  modelId: ModelIdType,
): Partial<Record<PhysicalQuantityIdType, number>> {
  return createDefaultModelInputsForModel(modelId);
}

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
): UtciRequest {
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
  options: Pick<PmvRequest, "occupantHasAirSpeedControl"> = {
    occupantHasAirSpeedControl: true,
  },
): PmvRequest {
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
  modelId: ModelIdType,
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
