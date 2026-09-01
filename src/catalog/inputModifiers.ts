import {
  PhysicalQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type QuantityRangeSi,
  type QuantityState,
} from "./quantities";

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
  AffectedFields extends readonly PhysicalQuantityIdType[],
> = Partial<Pick<QuantityState, AffectedFields[number]>>;

export interface InputModifier<
  ExtraInputs extends readonly PhysicalQuantityIdType[] = readonly PhysicalQuantityIdType[],
  AffectedFields extends readonly PhysicalQuantityIdType[] = readonly PhysicalQuantityIdType[],
> {
  id: ModifierId;
  label: string;
  description: string;
  extraInputs: ExtraInputs;
  affectedFields: AffectedFields;
  apply: (
    inputs: Readonly<QuantityState>,
    extraInputs: Readonly<ModifierInputValueMap<ExtraInputs>>,
  ) => ModifierInputPatch<AffectedFields>;
}

export function defineInputModifier<
  const ExtraInputs extends readonly PhysicalQuantityIdType[],
  const AffectedFields extends readonly PhysicalQuantityIdType[],
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
    extraInputs: [PhysicalQuantityId.MeasuredAirSpeed],
  },
  [ModifierId.MorningClothingEstimate]: {
    id: ModifierId.MorningClothingEstimate,
    label: "Morning clothing estimate",
    description: "Estimate clothing insulation from outdoor temperature at 6 a.m.",
    extraInputs: [PhysicalQuantityId.MorningOutdoorTemperature],
  },
  [ModifierId.DynamicClothing]: {
    id: ModifierId.DynamicClothing,
    label: "Dynamic clothing",
    description: "Adjust clothing insulation for the current metabolic rate.",
    extraInputs: [],
  },
  [ModifierId.SolarGain]: { id: ModifierId.SolarGain, label: "Solar gain on occupant", description: "Increase effective mean radiant temperature for direct solar exposure.", extraInputs: [
      PhysicalQuantityId.SolarAltitude, PhysicalQuantityId.SolarHorizontalAngle, PhysicalQuantityId.DirectSolarRadiation, PhysicalQuantityId.SolarTransmittance, PhysicalQuantityId.SkyVaultViewFraction, PhysicalQuantityId.BodyExposureFraction, ] },
};

export const modifierQuantityIds: readonly PhysicalQuantityIdType[] =
  modifierOrder.flatMap((id) => [...inputModifierCatalogue[id].extraInputs]);

export const modifierExtraInputRangeSi: Partial<
  Record<PhysicalQuantityIdType, QuantityRangeSi>
> = {
  [PhysicalQuantityId.MeasuredAirSpeed]: { min: 0, max: 2 },
  [PhysicalQuantityId.MorningOutdoorTemperature]: { min: -50, max: 50 },
  [PhysicalQuantityId.SolarAltitude]: { min: 0, max: 90 },
  [PhysicalQuantityId.SolarHorizontalAngle]: { min: 0, max: 180 },
  [PhysicalQuantityId.DirectSolarRadiation]: { min: 200, max: 1000 },
  [PhysicalQuantityId.SolarTransmittance]: { min: 0, max: 1 },
  [PhysicalQuantityId.SkyVaultViewFraction]: { min: 0, max: 1 },
  [PhysicalQuantityId.BodyExposureFraction]: { min: 0, max: 1 },
};
