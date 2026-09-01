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
  InputIds extends readonly PhysicalQuantityIdType[],
> = {
  [Key in InputIds[number]]: number;
};

export type ModifierInputRangeMap<
  InputIds extends readonly PhysicalQuantityIdType[],
> = number extends InputIds["length"]
  ? Partial<Record<PhysicalQuantityIdType, QuantityRangeSi>>
  : { [Key in InputIds[number]]: QuantityRangeSi };

export type ModifierInputPatch<
  AffectedFields extends readonly PhysicalQuantityIdType[],
> = Partial<Pick<QuantityState, AffectedFields[number]>>;

export interface InputModifier<
  InputIds extends readonly PhysicalQuantityIdType[] = readonly PhysicalQuantityIdType[],
  AffectedFields extends readonly PhysicalQuantityIdType[] = readonly PhysicalQuantityIdType[],
> {
  id: ModifierId;
  label: string;
  description: string;
  modifierInputs: InputIds;
  modifierInputRangeSi: ModifierInputRangeMap<InputIds>;
  affectedFields: AffectedFields;
  apply: (
    baseInputs: Readonly<QuantityState>,
    modifierInputs: Readonly<ModifierInputValueMap<InputIds>>,
  ) => ModifierInputPatch<AffectedFields>;
}

export function defineInputModifier<
  const InputIds extends readonly PhysicalQuantityIdType[],
  const AffectedFields extends readonly PhysicalQuantityIdType[],
>(
  definition: InputModifier<InputIds, AffectedFields>,
): InputModifier<InputIds, AffectedFields> {
  for (const quantityId of definition.modifierInputs) {
    const range = (
      definition.modifierInputRangeSi as Partial<
        Record<PhysicalQuantityIdType, QuantityRangeSi>
      >
    )[quantityId];
    if (
      range === undefined
      || !Number.isFinite(range.min)
      || !Number.isFinite(range.max)
      || range.min > range.max
    ) {
      throw new Error(
        `Modifier ${definition.id} is missing SI range for ${quantityId}.`,
      );
    }
  }
  return definition;
}

export interface InputModifierCatalogueEntry {
  readonly id: ModifierId;
  readonly label: string;
  readonly description: string;
  readonly modifierInputs: readonly PhysicalQuantityIdType[];
  readonly modifierInputRangeSi: Partial<
    Record<PhysicalQuantityIdType, QuantityRangeSi>
  >;
}

/** Stable share/UI schema. Executable modifier definitions are model-owned. */
export const inputModifierCatalogue = {
  [ModifierId.MeasuredAirSpeed]: {
    id: ModifierId.MeasuredAirSpeed,
    label: "Measured air speed",
    description: "Derive relative air speed from measured air speed and activity.",
    modifierInputs: [PhysicalQuantityId.MeasuredAirSpeed] as const,
    modifierInputRangeSi: {
      [PhysicalQuantityId.MeasuredAirSpeed]: { min: 0, max: 2 },
    },
  },
  [ModifierId.MorningClothingEstimate]: {
    id: ModifierId.MorningClothingEstimate,
    label: "Morning clothing estimate",
    description: "Estimate clothing insulation from outdoor temperature at 6 a.m.",
    modifierInputs: [PhysicalQuantityId.MorningOutdoorTemperature] as const,
    modifierInputRangeSi: {
      [PhysicalQuantityId.MorningOutdoorTemperature]: { min: -50, max: 50 },
    },
  },
  [ModifierId.DynamicClothing]: {
    id: ModifierId.DynamicClothing,
    label: "Dynamic clothing",
    description: "Adjust clothing insulation for the current metabolic rate.",
    modifierInputs: [] as const,
    modifierInputRangeSi: {},
  },
  [ModifierId.SolarGain]: {
    id: ModifierId.SolarGain,
    label: "Solar gain on occupant",
    description: "Increase effective mean radiant temperature for direct solar exposure.",
    modifierInputs: [
      PhysicalQuantityId.SolarAltitude,
      PhysicalQuantityId.SolarHorizontalAngle,
      PhysicalQuantityId.DirectSolarRadiation,
      PhysicalQuantityId.SolarTransmittance,
      PhysicalQuantityId.SkyVaultViewFraction,
      PhysicalQuantityId.BodyExposureFraction,
    ] as const,
    modifierInputRangeSi: {
      [PhysicalQuantityId.SolarAltitude]: { min: 0, max: 90 },
      [PhysicalQuantityId.SolarHorizontalAngle]: { min: 0, max: 180 },
      [PhysicalQuantityId.DirectSolarRadiation]: { min: 200, max: 1000 },
      [PhysicalQuantityId.SolarTransmittance]: { min: 0, max: 1 },
      [PhysicalQuantityId.SkyVaultViewFraction]: { min: 0, max: 1 },
      [PhysicalQuantityId.BodyExposureFraction]: { min: 0, max: 1 },
    },
  },
} satisfies Record<ModifierId, InputModifierCatalogueEntry>;

export const modifierQuantityIds: readonly PhysicalQuantityIdType[] =
  modifierOrder.flatMap((id) => [...inputModifierCatalogue[id].modifierInputs]);

export function rangeSiForModifierInput(
  quantityId: PhysicalQuantityIdType,
): QuantityRangeSi | undefined {
  for (const modifierId of modifierOrder) {
    const entry = inputModifierCatalogue[modifierId];
    if ((entry.modifierInputs as readonly PhysicalQuantityIdType[]).includes(quantityId)) {
      return (
        entry.modifierInputRangeSi as Partial<
          Record<PhysicalQuantityIdType, QuantityRangeSi>
        >
      )[quantityId];
    }
  }
  return undefined;
}
