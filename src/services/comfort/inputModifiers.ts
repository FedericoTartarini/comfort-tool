import { clo_dynamic, solar_gain } from "jsthermalcomfort";

import {
  canonicalInputFieldOrder,
  FieldKey,
  type CanonicalInputFieldKey,
  type CanonicalInputState,
} from "../../models/fieldKeys";
import {
  ModifierFieldKey,
  ModifierId,
  defineInputModifier,
  inputModifierCatalogue,
  modifierFieldMetaByKey,
  type InputModifier,
  type ModifierFieldKey as ModifierFieldKeyType,
  type ModifierId as ModifierIdType,
  type ModifierInputValues,
} from "../../models/inputModifiers";
import type { JsThermalComfortStandard } from "../../models/comfortModels";
import { deriveRelativeAirSpeedFromMeasured } from "./derivations/airSpeed";
import { predictClothingInsulation } from "./clothingTools";

const SOLAR_SHORT_WAVE_ABSORPTIVITY = 0.7;
const SOLAR_POSTURE = "sitting";
// Pin the installed runtime default; its generated parameter documentation is inconsistent.
const SOLAR_FLOOR_REFLECTANCE = 0.6;

export const measuredAirSpeedModifier = defineInputModifier({
  ...inputModifierCatalogue[ModifierId.MeasuredAirSpeed],
  extraInputs: [ModifierFieldKey.MeasuredAirSpeed],
  affectedFields: [FieldKey.RelativeAirSpeed],
  apply: (inputs, extraInputs) => ({
    [FieldKey.RelativeAirSpeed]: deriveRelativeAirSpeedFromMeasured(
      extraInputs[ModifierFieldKey.MeasuredAirSpeed],
      inputs[FieldKey.MetabolicRate],
    ),
  }),
});

export const morningClothingEstimateModifier = defineInputModifier({
  ...inputModifierCatalogue[ModifierId.MorningClothingEstimate],
  extraInputs: [ModifierFieldKey.MorningOutdoorTemperature],
  affectedFields: [FieldKey.ClothingInsulation],
  apply: (_inputs, extraInputs) => ({
    [FieldKey.ClothingInsulation]: predictClothingInsulation(
      extraInputs[ModifierFieldKey.MorningOutdoorTemperature],
    ),
  }),
});

export function createDynamicClothingModifier(
  standard: JsThermalComfortStandard,
) {
  return defineInputModifier({
    ...inputModifierCatalogue[ModifierId.DynamicClothing],
    extraInputs: [],
    affectedFields: [FieldKey.ClothingInsulation],
    apply: (inputs) => ({
      [FieldKey.ClothingInsulation]: clo_dynamic(
        inputs[FieldKey.ClothingInsulation],
        inputs[FieldKey.MetabolicRate],
        standard,
      ),
    }),
  });
}

export const solarGainModifier = defineInputModifier({
  ...inputModifierCatalogue[ModifierId.SolarGain],
  extraInputs: [
    ModifierFieldKey.SolarAltitude,
    ModifierFieldKey.SolarHorizontalAngle,
    ModifierFieldKey.DirectSolarRadiation,
    ModifierFieldKey.SolarTransmittance,
    ModifierFieldKey.SkyVaultViewFraction,
    ModifierFieldKey.BodyExposureFraction,
  ],
  affectedFields: [FieldKey.MeanRadiantTemperature],
  apply: (inputs, extraInputs) => {
    const { delta_mrt: deltaMrt } = solar_gain(
      extraInputs[ModifierFieldKey.SolarAltitude],
      extraInputs[ModifierFieldKey.SolarHorizontalAngle],
      extraInputs[ModifierFieldKey.DirectSolarRadiation],
      extraInputs[ModifierFieldKey.SolarTransmittance],
      extraInputs[ModifierFieldKey.SkyVaultViewFraction],
      extraInputs[ModifierFieldKey.BodyExposureFraction],
      SOLAR_SHORT_WAVE_ABSORPTIVITY,
      SOLAR_POSTURE,
      SOLAR_FLOOR_REFLECTANCE,
    );
    return {
      [FieldKey.MeanRadiantTemperature]: inputs[FieldKey.MeanRadiantTemperature] + deltaMrt,
    };
  },
});

function isCanonicalInputFieldKey(value: string): value is CanonicalInputFieldKey {
  return canonicalInputFieldOrder.some((fieldKey) => fieldKey === value);
}

export function isModifierFieldValueValid(
  key: ModifierFieldKeyType,
  value: unknown,
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const meta = modifierFieldMetaByKey[key];
  return (meta.minValue === undefined || value >= meta.minValue)
    && (meta.maxValue === undefined || value <= meta.maxValue);
}

export function getCompleteModifierInputs(
  modifier: Pick<InputModifier, "extraInputs">,
  values: Readonly<ModifierInputValues>,
): Record<ModifierFieldKeyType, number> | null {
  const completeValues: Partial<Record<ModifierFieldKeyType, number>> = {};
  for (const key of modifier.extraInputs) {
    const value = values[key];
    if (!isModifierFieldValueValid(key, value)) return null;
    completeValues[key] = value;
  }
  return completeValues as Record<ModifierFieldKeyType, number>;
}

export function isModifierConfigurationComplete(
  modifier: Pick<InputModifier, "extraInputs">,
  values: Readonly<ModifierInputValues>,
): boolean {
  return getCompleteModifierInputs(modifier, values) !== null;
}

export function applyInputModifierChain(
  baseInputs: Readonly<CanonicalInputState>,
  modifiers: readonly InputModifier[],
  activeModifiers: Readonly<Partial<Record<ModifierIdType, boolean>>>,
  modifierInputs: Readonly<Partial<Record<ModifierIdType, ModifierInputValues>>>,
): CanonicalInputState {
  let effectiveInputs: CanonicalInputState = { ...baseInputs };

  for (const modifier of modifiers) {
    if (!activeModifiers[modifier.id]) continue;
    const completeInputs = getCompleteModifierInputs(
      modifier,
      modifierInputs[modifier.id] ?? {},
    );
    if (!completeInputs) {
      throw new Error(`Enabled modifier ${modifier.id} has incomplete inputs.`);
    }

    const patch = modifier.apply({ ...effectiveInputs }, completeInputs);
    for (const [rawField, value] of Object.entries(patch)) {
      if (
        !isCanonicalInputFieldKey(rawField)
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
