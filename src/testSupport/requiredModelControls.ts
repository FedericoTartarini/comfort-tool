import { ModelId, type ModelId as ModelIdType } from "../models/comfortModels";
import { InputControlId, type InputControlId as InputControlIdType } from "../models/inputControls";
import {
  PhysicalQuantityId,
  type PrimaryQuantityId,
} from "../models/physicalQuantities";

const pmvRequiredControlIds = [
  InputControlId.Temperature,
  InputControlId.RadiantTemperature,
  InputControlId.AirSpeed,
  InputControlId.Humidity,
  InputControlId.MetabolicRate,
  InputControlId.ClothingInsulation,
] as const;

const pmvRequiredPrimaryQuantities = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.RelativeAirSpeed,
  PhysicalQuantityId.RelativeHumidity,
  PhysicalQuantityId.MetabolicRate,
  PhysicalQuantityId.ClothingInsulation,
] as const;

const adaptiveRequiredControlIds = [
  InputControlId.Temperature,
  InputControlId.RadiantTemperature,
  InputControlId.PrevailingMeanOutdoorTemperature,
  InputControlId.AirSpeed,
] as const;

const adaptiveRequiredPrimaryQuantities = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
  PhysicalQuantityId.RelativeAirSpeed,
] as const;

const tdbRhRequiredControlIds = [
  InputControlId.Temperature,
  InputControlId.Humidity,
] as const;

const tdbRhRequiredPrimaryQuantities = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.RelativeHumidity,
] as const;

/**
 * Independently authored required Analysis controls. Do not generate these
 * from `inputFields` or assembled `controls`.
 */
export const requiredControlIdsByModel = {
  [ModelId.PmvAshrae]: pmvRequiredControlIds,
  [ModelId.PmvIso]: pmvRequiredControlIds,
  [ModelId.Utci]: [
    InputControlId.Temperature,
    InputControlId.RadiantTemperature,
    InputControlId.WindSpeed,
    InputControlId.Humidity,
  ],
  [ModelId.AdaptiveAshrae]: adaptiveRequiredControlIds,
  [ModelId.AdaptiveEn]: adaptiveRequiredControlIds,
  [ModelId.HeatIndex]: tdbRhRequiredControlIds,
  [ModelId.Humidex]: tdbRhRequiredControlIds,
  [ModelId.WindChill]: [
    InputControlId.Temperature,
    InputControlId.WindSpeed,
  ],
  [ModelId.Phs2023]: [
    InputControlId.Temperature,
    InputControlId.RadiantTemperature,
    InputControlId.AirSpeed,
    InputControlId.Humidity,
    InputControlId.MetabolicRate,
    InputControlId.ClothingInsulation,
  ],
} as const satisfies Record<ModelIdType, readonly InputControlIdType[]>;

/**
 * Independently authored required primary quantities. Do not generate these
 * from `inputFields`. Golden-key coverage must use this list.
 */
export const requiredPrimaryQuantitiesByModel = {
  [ModelId.PmvAshrae]: pmvRequiredPrimaryQuantities,
  [ModelId.PmvIso]: pmvRequiredPrimaryQuantities,
  [ModelId.Utci]: [
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.MeanRadiantTemperature,
    PhysicalQuantityId.WindSpeed,
    PhysicalQuantityId.RelativeHumidity,
  ],
  [ModelId.AdaptiveAshrae]: adaptiveRequiredPrimaryQuantities,
  [ModelId.AdaptiveEn]: adaptiveRequiredPrimaryQuantities,
  [ModelId.HeatIndex]: tdbRhRequiredPrimaryQuantities,
  [ModelId.Humidex]: tdbRhRequiredPrimaryQuantities,
  [ModelId.WindChill]: [
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.WindSpeed,
  ],
  [ModelId.Phs2023]: [
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.MeanRadiantTemperature,
    PhysicalQuantityId.WindSpeed,
    PhysicalQuantityId.RelativeHumidity,
    PhysicalQuantityId.MetabolicRate,
    PhysicalQuantityId.ClothingInsulation,
  ],
} as const satisfies Record<ModelIdType, readonly PrimaryQuantityId[]>;
