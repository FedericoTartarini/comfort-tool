import {
  PhysicalQuantityId,
  type QuantityRangeSi,
} from "../../catalog/quantities";

export const phsEnvironmentQuantityIds = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.WindSpeed,
  PhysicalQuantityId.RelativeHumidity,
  PhysicalQuantityId.MetabolicRate,
  PhysicalQuantityId.ClothingInsulation,
] as const;

export type PhsEnvironmentQuantityId =
  (typeof phsEnvironmentQuantityIds)[number];

export const phsEnvironmentRangeSi: Record<
  PhsEnvironmentQuantityId,
  QuantityRangeSi
> = {
  [PhysicalQuantityId.DryBulbTemperature]: { min: 15, max: 50 },
  [PhysicalQuantityId.MeanRadiantTemperature]: { min: 0, max: 60 },
  [PhysicalQuantityId.WindSpeed]: { min: 0, max: 3 },
  [PhysicalQuantityId.RelativeHumidity]: { min: 0, max: 100 },
  [PhysicalQuantityId.MetabolicRate]: { min: 0.9, max: 3.9 },
  [PhysicalQuantityId.ClothingInsulation]: { min: 0.1, max: 1 },
};
