import type {
  CanonicalInputFieldKey,
  CanonicalInputState,
} from "./fieldKeys";

export const ModifierId = {
  MeasuredAirSpeed: "measuredAirSpeed",
  MorningClothingEstimate: "morningClothingEstimate",
  DynamicClothing: "dynamicClothing",
  SolarGain: "solarGain",
} as const;

export type ModifierId = (typeof ModifierId)[keyof typeof ModifierId];

export const modifierOrder: readonly ModifierId[] = [
  ModifierId.MeasuredAirSpeed,
  ModifierId.MorningClothingEstimate,
  ModifierId.DynamicClothing,
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

export type ModifierInputValues = Partial<Record<ModifierFieldKey, number | null>>;

export type ModifierInputValueMap<
  ExtraInputs extends readonly ModifierFieldKey[],
> = {
  [Key in ExtraInputs[number]]: number;
};

export type ModifierInputPatch<
  AffectedFields extends readonly CanonicalInputFieldKey[],
> = Partial<Pick<CanonicalInputState, AffectedFields[number]>>;

export interface InputModifier<
  ExtraInputs extends readonly ModifierFieldKey[] = readonly ModifierFieldKey[],
  AffectedFields extends readonly CanonicalInputFieldKey[] = readonly CanonicalInputFieldKey[],
> {
  id: ModifierId;
  label: string;
  description: string;
  extraInputs: ExtraInputs;
  affectedFields: AffectedFields;
  apply: (
    inputs: Readonly<CanonicalInputState>,
    extraInputs: Readonly<ModifierInputValueMap<ExtraInputs>>,
  ) => ModifierInputPatch<AffectedFields>;
}

export function defineInputModifier<
  const ExtraInputs extends readonly ModifierFieldKey[],
  const AffectedFields extends readonly CanonicalInputFieldKey[],
>(
  definition: InputModifier<ExtraInputs, AffectedFields>,
): InputModifier<ExtraInputs, AffectedFields> {
  return definition;
}

export type InputModifierCatalogueEntry = Pick<
  InputModifier,
  "id" | "label" | "description" | "extraInputs"
>;

/** Stable share/UI schema. Executable modifier definitions are model-owned. */
export const inputModifierCatalogue: Record<ModifierId, InputModifierCatalogueEntry> = {
  [ModifierId.MeasuredAirSpeed]: {
    id: ModifierId.MeasuredAirSpeed,
    label: "Measured air speed",
    description: "Derive relative air speed from measured air speed and activity.",
    extraInputs: [ModifierFieldKey.MeasuredAirSpeed],
  },
  [ModifierId.MorningClothingEstimate]: {
    id: ModifierId.MorningClothingEstimate,
    label: "Morning clothing estimate",
    description: "Estimate clothing insulation from outdoor temperature at 6 a.m.",
    extraInputs: [ModifierFieldKey.MorningOutdoorTemperature],
  },
  [ModifierId.DynamicClothing]: {
    id: ModifierId.DynamicClothing,
    label: "Dynamic clothing",
    description: "Adjust clothing insulation for the current metabolic rate.",
    extraInputs: [],
  },
  [ModifierId.SolarGain]: {
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
  },
};
