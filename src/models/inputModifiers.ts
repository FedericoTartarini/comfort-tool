import {
  PhysicalQuantityId,
  type PrimaryInputState,
  type PrimaryQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "./physicalQuantities";
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

export type ModifierInputValues = Partial<Record<PhysicalQuantityIdType, number>>;

export type ModifierInputValueMap<
  ExtraInputs extends readonly PhysicalQuantityIdType[],
> = {
  [Key in ExtraInputs[number]]: number;
};

export type ModifierInputPatch<
  AffectedFields extends readonly PrimaryQuantityId[],
> = Partial<Pick<PrimaryInputState, AffectedFields[number]>>;

export interface InputModifier<
  ExtraInputs extends readonly PhysicalQuantityIdType[] = readonly PhysicalQuantityIdType[],
  AffectedFields extends readonly PrimaryQuantityId[] = readonly PrimaryQuantityId[],
> {
  id: ModifierId;
  label: string;
  description: string;
  extraInputs: ExtraInputs;
  affectedFields: AffectedFields;
  apply: (
    inputs: Readonly<PrimaryInputState>,
    extraInputs: Readonly<ModifierInputValueMap<ExtraInputs>>,
  ) => ModifierInputPatch<AffectedFields>;
}

export function defineInputModifier<
  const ExtraInputs extends readonly PhysicalQuantityIdType[],
  const AffectedFields extends readonly PrimaryQuantityId[],
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
    extraInputs: [PhysicalQuantityId.ModifierMeasuredAirSpeed],
  },
  [ModifierId.MorningClothingEstimate]: {
    id: ModifierId.MorningClothingEstimate,
    label: "Morning clothing estimate",
    description: "Estimate clothing insulation from outdoor temperature at 6 a.m.",
    extraInputs: [PhysicalQuantityId.ModifierMorningOutdoorTemperature],
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
      PhysicalQuantityId.ModifierSolarAltitude,
      PhysicalQuantityId.ModifierSolarHorizontalAngle,
      PhysicalQuantityId.ModifierDirectSolarRadiation,
      PhysicalQuantityId.ModifierSolarTransmittance,
      PhysicalQuantityId.ModifierSkyVaultViewFraction,
      PhysicalQuantityId.ModifierBodyExposureFraction,
    ],
  },
};
