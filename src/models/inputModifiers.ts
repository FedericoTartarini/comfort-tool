import type { FieldKey as FieldKeyType } from "./fieldKeys";

export const ModifierId = {
  MeasuredAirSpeed: "measuredAirSpeed",
  MorningClothingEstimate: "morningClothingEstimate",
  SolarGain: "solarGain",
} as const;

export type ModifierId = (typeof ModifierId)[keyof typeof ModifierId];

export const modifierOrder: readonly ModifierId[] = [
  ModifierId.MeasuredAirSpeed,
  ModifierId.MorningClothingEstimate,
  ModifierId.SolarGain,
];

export const ModifierFieldKey = {
  MeasuredAirSpeed: "measuredAirSpeed",
  MorningOutdoorTemperature: "morningOutdoorTemperature",
  SolarAltitude: "solarAltitude",
  SolarHorizontalAngle: "solarHorizontalAngle",
  DirectSolarRadiation: "directSolarRadiation",
  SolarTransmittance: "solarTransmittance",
  SkyVaultViewFraction: "skyVaultViewFraction",
  BodyExposureFraction: "bodyExposureFraction",
} as const;

export type ModifierFieldKey = (
  typeof ModifierFieldKey
)[keyof typeof ModifierFieldKey];

export interface ModifierFieldMeta {
  key: ModifierFieldKey;
  label: string;
  step: number;
  decimals: number;
  minValue?: number;
  maxValue?: number;
}

export const modifierFieldMetaByKey: Record<ModifierFieldKey, ModifierFieldMeta> = {
  [ModifierFieldKey.MeasuredAirSpeed]: {
    key: ModifierFieldKey.MeasuredAirSpeed,
    label: "Measured air speed",
    step: 0.01,
    decimals: 2,
    minValue: 0,
    maxValue: 2,
  },
  [ModifierFieldKey.MorningOutdoorTemperature]: {
    key: ModifierFieldKey.MorningOutdoorTemperature,
    label: "Outdoor air temperature at 6 a.m.",
    step: 0.5,
    decimals: 1,
  },
  [ModifierFieldKey.SolarAltitude]: {
    key: ModifierFieldKey.SolarAltitude,
    label: "Solar altitude",
    step: 1,
    decimals: 0,
    minValue: 0,
    maxValue: 90,
  },
  [ModifierFieldKey.SolarHorizontalAngle]: {
    key: ModifierFieldKey.SolarHorizontalAngle,
    label: "Solar horizontal angle (SHARP)",
    step: 1,
    decimals: 0,
    minValue: 0,
    maxValue: 180,
  },
  [ModifierFieldKey.DirectSolarRadiation]: {
    key: ModifierFieldKey.DirectSolarRadiation,
    label: "Direct-beam solar radiation",
    step: 10,
    decimals: 0,
    minValue: 200,
    maxValue: 1000,
  },
  [ModifierFieldKey.SolarTransmittance]: {
    key: ModifierFieldKey.SolarTransmittance,
    label: "Total solar transmittance",
    step: 0.05,
    decimals: 2,
    minValue: 0,
    maxValue: 1,
  },
  [ModifierFieldKey.SkyVaultViewFraction]: {
    key: ModifierFieldKey.SkyVaultViewFraction,
    label: "Sky-vault view fraction",
    step: 0.05,
    decimals: 2,
    minValue: 0,
    maxValue: 1,
  },
  [ModifierFieldKey.BodyExposureFraction]: {
    key: ModifierFieldKey.BodyExposureFraction,
    label: "Body surface exposed to sun",
    step: 0.05,
    decimals: 2,
    minValue: 0,
    maxValue: 1,
  },
};

export type CanonicalInputValues = Record<FieldKeyType, number>;
export type ModifierInputValues = Partial<Record<ModifierFieldKey, number | null>>;
export type CompleteModifierInputValues = Partial<Record<ModifierFieldKey, number>>;

export interface InputModifier {
  id: ModifierId;
  label: string;
  description: string;
  extraInputs: readonly ModifierFieldKey[];
  affectedFields: readonly FieldKeyType[];
  apply: (
    inputs: Readonly<CanonicalInputValues>,
    extraInputs: Readonly<CompleteModifierInputValues>,
  ) => Partial<CanonicalInputValues>;
}
