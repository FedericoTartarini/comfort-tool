import { clo_dynamic, solar_gain } from "jsthermalcomfort";

import { PhysicalQuantityId, isPhysicalQuantityId, isValueInQuantityRange, type PhysicalQuantityId as PhysicalQuantityIdType, type QuantityState } from "../../catalog/quantities";
import {
  ModifierId,
  defineInputModifier,
  inputModifierCatalogue,
  rangeSiForModifierInput,
  type InputModifier,
  type ModifierId as ModifierIdType,
  type ModifierInputValues,
} from "../../catalog/inputModifiers";
import type { JsThermalComfortStandard } from "../../catalog/modelIds";
import { deriveRelativeAirSpeedFromMeasured } from "./derivations/airSpeed";
import { predictClothingInsulation } from "./clothingTools";

const SOLAR_SHORT_WAVE_ABSORPTIVITY = 0.7;
const SOLAR_POSTURE = "sitting";
// Pin the installed runtime default; its generated parameter documentation is inconsistent.
const SOLAR_FLOOR_REFLECTANCE = 0.6;

export const measuredAirSpeedModifier = defineInputModifier({
  ...inputModifierCatalogue[ModifierId.MeasuredAirSpeed],
  affectedFields: [PhysicalQuantityId.RelativeAirSpeed],
  apply: (baseInputs, modifierInputs) => ({ [PhysicalQuantityId.RelativeAirSpeed]: deriveRelativeAirSpeedFromMeasured(
      modifierInputs[PhysicalQuantityId.MeasuredAirSpeed], baseInputs[PhysicalQuantityId.MetabolicRate]!, ) }),
});

export const morningClothingEstimateModifier = defineInputModifier({
  ...inputModifierCatalogue[ModifierId.MorningClothingEstimate],
  affectedFields: [PhysicalQuantityId.ClothingInsulation],
  apply: (_baseInputs, modifierInputs) => ({ [PhysicalQuantityId.ClothingInsulation]: predictClothingInsulation(
      modifierInputs[PhysicalQuantityId.MorningOutdoorTemperature], ) }),
});

export function createDynamicClothingModifier(
  standard: JsThermalComfortStandard,
) {
  return defineInputModifier({
    ...inputModifierCatalogue[ModifierId.DynamicClothing],
    affectedFields: [PhysicalQuantityId.ClothingInsulation],
    apply: (baseInputs) => ({ [PhysicalQuantityId.ClothingInsulation]: clo_dynamic(
        baseInputs[PhysicalQuantityId.ClothingInsulation]!, baseInputs[PhysicalQuantityId.MetabolicRate]!, standard, ) }),
  });
}

export const solarGainModifier = defineInputModifier({
  ...inputModifierCatalogue[ModifierId.SolarGain],
  affectedFields: [PhysicalQuantityId.MeanRadiantTemperature],
  apply: (baseInputs, modifierInputs) => {
    const { delta_mrt: deltaMrt } = solar_gain(
      modifierInputs[PhysicalQuantityId.SolarAltitude],
      modifierInputs[PhysicalQuantityId.SolarHorizontalAngle],
      modifierInputs[PhysicalQuantityId.DirectSolarRadiation],
      modifierInputs[PhysicalQuantityId.SolarTransmittance],
      modifierInputs[PhysicalQuantityId.SkyVaultViewFraction],
      modifierInputs[PhysicalQuantityId.BodyExposureFraction],
      SOLAR_SHORT_WAVE_ABSORPTIVITY,
      SOLAR_POSTURE,
      SOLAR_FLOOR_REFLECTANCE,
    );
    return { [PhysicalQuantityId.MeanRadiantTemperature]: (baseInputs[PhysicalQuantityId.MeanRadiantTemperature] ?? 0) + deltaMrt };
  },
});

export function isModifierFieldValueValid(
  key: PhysicalQuantityIdType,
  value: unknown,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const range = rangeSiForModifierInput(key);
  return range !== undefined && isValueInQuantityRange(value, range);
}

export function getCompleteModifierInputs(
  modifier: Pick<InputModifier, "modifierInputs">,
  values: Readonly<ModifierInputValues>,
): Record<PhysicalQuantityIdType, number> | null {
  const completeValues: Partial<Record<PhysicalQuantityIdType, number>> = {};
  for (const key of modifier.modifierInputs) {
    const value = values[key];
    if (!isModifierFieldValueValid(key, value)) return null;
    completeValues[key] = value;
  }
  return completeValues as Record<PhysicalQuantityIdType, number>;
}

export function isModifierConfigurationComplete(
  modifier: Pick<InputModifier, "modifierInputs">,
  values: Readonly<ModifierInputValues>,
): boolean {
  return getCompleteModifierInputs(modifier, values) !== null;
}

export function applyInputModifierChain(
  baseInputs: Readonly<QuantityState>,
  modifiers: readonly InputModifier[],
  activeModifiers: Readonly<Partial<Record<ModifierIdType, boolean>>>,
  modifierInputs: Readonly<Partial<Record<ModifierIdType, ModifierInputValues>>>,
): QuantityState {
  let effectiveInputs: QuantityState = { ...baseInputs };

  for (const modifier of modifiers) {
    if (!activeModifiers[modifier.id]) continue;
    const completeInputs = getCompleteModifierInputs(
      modifier,
      modifierInputs[modifier.id] ?? {},
    );
    if (!completeInputs) {
      throw new Error(`Enabled modifier ${modifier.id} has incomplete inputs.`);
    }

    const patch = modifier.apply(
      { ...effectiveInputs },
      completeInputs as Parameters<InputModifier["apply"]>[1],
    );
    for (const [rawField, value] of Object.entries(patch)) {
      if (
        !isPhysicalQuantityId(rawField)
        || !modifier.affectedFields.includes(rawField)
        || !Number.isFinite(value)
      ) {
        throw new Error(`Modifier ${modifier.id} returned an invalid input patch.`);
      }
      effectiveInputs[rawField] = value;
    }
  }

  return effectiveInputs;
}
