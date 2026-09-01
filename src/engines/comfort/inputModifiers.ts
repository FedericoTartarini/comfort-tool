import { clo_dynamic, solar_gain } from "jsthermalcomfort";

import { PhysicalQuantityId, getPhysicalQuantityMeta, type PhysicalQuantityId as PhysicalQuantityIdType, type PrimaryInputState } from "../../catalog/quantities";
import {
  ModifierId,
  defineInputModifier,
  inputModifierCatalogue,
  type InputModifier,
  type ModifierId as ModifierIdType,
  type ModifierInputValues,
} from "../../catalog/inputModifiers";
import type { JsThermalComfortStandard } from "../../catalog/modelIds";
import { deriveRelativeAirSpeedFromMeasured } from "./derivations/airSpeed";
import { predictClothingInsulation } from "./clothingTools";
import { isPrimaryQuantityId } from "./quantityStateRouting";

const SOLAR_SHORT_WAVE_ABSORPTIVITY = 0.7;
const SOLAR_POSTURE = "sitting";
// Pin the installed runtime default; its generated parameter documentation is inconsistent.
const SOLAR_FLOOR_REFLECTANCE = 0.6;

export const measuredAirSpeedModifier = defineInputModifier({
  ...inputModifierCatalogue[ModifierId.MeasuredAirSpeed],
  extraInputs: [PhysicalQuantityId.MeasuredAirSpeed],
  affectedFields: [PhysicalQuantityId.RelativeAirSpeed],
  apply: (inputs, extraInputs) => ({ [PhysicalQuantityId.RelativeAirSpeed]: deriveRelativeAirSpeedFromMeasured(
      extraInputs[PhysicalQuantityId.MeasuredAirSpeed], inputs[PhysicalQuantityId.MetabolicRate], ) }),
});

export const morningClothingEstimateModifier = defineInputModifier({
  ...inputModifierCatalogue[ModifierId.MorningClothingEstimate],
  extraInputs: [PhysicalQuantityId.MorningOutdoorTemperature],
  affectedFields: [PhysicalQuantityId.ClothingInsulation],
  apply: (_inputs, extraInputs) => ({ [PhysicalQuantityId.ClothingInsulation]: predictClothingInsulation(
      extraInputs[PhysicalQuantityId.MorningOutdoorTemperature], ) }),
});

export function createDynamicClothingModifier(
  standard: JsThermalComfortStandard,
) {
  return defineInputModifier({
    ...inputModifierCatalogue[ModifierId.DynamicClothing],
    extraInputs: [],
    affectedFields: [PhysicalQuantityId.ClothingInsulation],
    apply: (inputs) => ({ [PhysicalQuantityId.ClothingInsulation]: clo_dynamic(
        inputs[PhysicalQuantityId.ClothingInsulation], inputs[PhysicalQuantityId.MetabolicRate], standard, ) }),
  });
}

export const solarGainModifier = defineInputModifier({
  ...inputModifierCatalogue[ModifierId.SolarGain],
  extraInputs: [
    PhysicalQuantityId.SolarAltitude,
    PhysicalQuantityId.SolarHorizontalAngle,
    PhysicalQuantityId.DirectSolarRadiation,
    PhysicalQuantityId.SolarTransmittance,
    PhysicalQuantityId.SkyVaultViewFraction,
    PhysicalQuantityId.BodyExposureFraction,
  ],
  affectedFields: [PhysicalQuantityId.MeanRadiantTemperature],
  apply: (inputs, extraInputs) => {
    const { delta_mrt: deltaMrt } = solar_gain(
      extraInputs[PhysicalQuantityId.SolarAltitude],
      extraInputs[PhysicalQuantityId.SolarHorizontalAngle],
      extraInputs[PhysicalQuantityId.DirectSolarRadiation],
      extraInputs[PhysicalQuantityId.SolarTransmittance],
      extraInputs[PhysicalQuantityId.SkyVaultViewFraction],
      extraInputs[PhysicalQuantityId.BodyExposureFraction],
      SOLAR_SHORT_WAVE_ABSORPTIVITY,
      SOLAR_POSTURE,
      SOLAR_FLOOR_REFLECTANCE,
    );
    return { [PhysicalQuantityId.MeanRadiantTemperature]: inputs[PhysicalQuantityId.MeanRadiantTemperature] + deltaMrt };
  },
});

export function isModifierFieldValueValid(
  key: PhysicalQuantityIdType,
  value: unknown,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const meta = getPhysicalQuantityMeta(key);
  return value >= meta.minSi && value <= meta.maxSi;
}

export function getCompleteModifierInputs(
  modifier: Pick<InputModifier, "extraInputs">,
  values: Readonly<ModifierInputValues>,
): Record<PhysicalQuantityIdType, number> | null {
  const completeValues: Partial<Record<PhysicalQuantityIdType, number>> = {};
  for (const key of modifier.extraInputs) {
    const value = values[key];
    if (!isModifierFieldValueValid(key, value)) return null;
    completeValues[key] = value;
  }
  return completeValues as Record<PhysicalQuantityIdType, number>;
}

export function isModifierConfigurationComplete(
  modifier: Pick<InputModifier, "extraInputs">,
  values: Readonly<ModifierInputValues>,
): boolean {
  return getCompleteModifierInputs(modifier, values) !== null;
}

export function applyInputModifierChain(
  baseInputs: Readonly<PrimaryInputState>,
  modifiers: readonly InputModifier[],
  activeModifiers: Readonly<Partial<Record<ModifierIdType, boolean>>>,
  modifierInputs: Readonly<Partial<Record<ModifierIdType, ModifierInputValues>>>,
): PrimaryInputState {
  let effectiveInputs: PrimaryInputState = { ...baseInputs };

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
        !isPrimaryQuantityId(rawField)
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
