import { solar_gain } from "jsthermalcomfort";

import {
  canonicalInputFieldOrder,
  FieldKey,
  type CanonicalInputFieldKey,
  type CanonicalInputState,
} from "../../models/fieldKeys";
import {
  ModifierFieldKey,
  ModifierId,
  modifierFieldMetaByKey,
  type CompleteModifierInputValues,
  type InputModifier,
  type ModifierFieldKey as ModifierFieldKeyType,
  type ModifierId as ModifierIdType,
  type ModifierInputValues,
} from "../../models/inputModifiers";
import { deriveRelativeAirSpeedFromMeasured } from "./derivations/airSpeed";
import { predictClothingInsulation } from "./clothingTools";

const SOLAR_SHORT_WAVE_ABSORPTIVITY = 0.7;
const SOLAR_POSTURE = "sitting";
// Pin the installed runtime default; its generated parameter documentation is inconsistent.
const SOLAR_FLOOR_REFLECTANCE = 0.6;

function requireModifierValue(
  values: Readonly<CompleteModifierInputValues>,
  key: ModifierFieldKeyType,
): number {
  const value = values[key];
  if (value === undefined) {
    throw new Error(`Missing required modifier input: ${key}.`);
  }
  return value;
}

const measuredAirSpeedModifier: InputModifier = {
  id: ModifierId.MeasuredAirSpeed,
  label: "Measured air speed",
  description: "Derive relative air speed from measured air speed and activity.",
  extraInputs: [ModifierFieldKey.MeasuredAirSpeed],
  affectedFields: [FieldKey.RelativeAirSpeed],
  apply: (inputs, extraInputs) => ({
    [FieldKey.RelativeAirSpeed]: deriveRelativeAirSpeedFromMeasured(
      requireModifierValue(extraInputs, ModifierFieldKey.MeasuredAirSpeed),
      inputs[FieldKey.MetabolicRate],
    ),
  }),
};

const morningClothingEstimateModifier: InputModifier = {
  id: ModifierId.MorningClothingEstimate,
  label: "Morning clothing estimate",
  description: "Estimate clothing insulation from outdoor temperature at 6 a.m.",
  extraInputs: [ModifierFieldKey.MorningOutdoorTemperature],
  affectedFields: [FieldKey.ClothingInsulation],
  apply: (_inputs, extraInputs) => ({
    [FieldKey.ClothingInsulation]: predictClothingInsulation(
      requireModifierValue(extraInputs, ModifierFieldKey.MorningOutdoorTemperature),
    ),
  }),
};

const solarGainModifier: InputModifier = {
  id: ModifierId.SolarGain,
  label: "Solar gain on occupant",
  description: "Increase effective mean radiant temperature for direct solar exposure.",
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
      requireModifierValue(extraInputs, ModifierFieldKey.SolarAltitude),
      requireModifierValue(extraInputs, ModifierFieldKey.SolarHorizontalAngle),
      requireModifierValue(extraInputs, ModifierFieldKey.DirectSolarRadiation),
      requireModifierValue(extraInputs, ModifierFieldKey.SolarTransmittance),
      requireModifierValue(extraInputs, ModifierFieldKey.SkyVaultViewFraction),
      requireModifierValue(extraInputs, ModifierFieldKey.BodyExposureFraction),
      SOLAR_SHORT_WAVE_ABSORPTIVITY,
      SOLAR_POSTURE,
      SOLAR_FLOOR_REFLECTANCE,
    );
    return {
      [FieldKey.MeanRadiantTemperature]: inputs[FieldKey.MeanRadiantTemperature] + deltaMrt,
    };
  },
};

export const inputModifierById: Record<ModifierIdType, InputModifier> = {
  [ModifierId.MeasuredAirSpeed]: measuredAirSpeedModifier,
  [ModifierId.MorningClothingEstimate]: morningClothingEstimateModifier,
  [ModifierId.SolarGain]: solarGainModifier,
};

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
  modifier: InputModifier,
  values: Readonly<ModifierInputValues>,
): CompleteModifierInputValues | null {
  const completeValues: CompleteModifierInputValues = {};
  for (const key of modifier.extraInputs) {
    const value = values[key];
    if (!isModifierFieldValueValid(key, value)) return null;
    completeValues[key] = value;
  }
  return completeValues;
}

export function isModifierConfigurationComplete(
  modifierId: ModifierIdType,
  values: Readonly<ModifierInputValues>,
): boolean {
  return getCompleteModifierInputs(inputModifierById[modifierId], values) !== null;
}

export function applyModifierDefinitions(
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

export function applyInputModifierChain(
  baseInputs: Readonly<CanonicalInputState>,
  modifierIds: readonly ModifierIdType[],
  activeModifiers: Readonly<Record<ModifierIdType, boolean>>,
  modifierInputs: Readonly<Record<ModifierIdType, ModifierInputValues>>,
): CanonicalInputState {
  return applyModifierDefinitions(
    baseInputs,
    modifierIds.map((modifierId) => inputModifierById[modifierId]),
    activeModifiers,
    modifierInputs,
  );
}
