import { ComfortModel, type ComfortModel as ComfortModelType } from "../models/comfortModels";
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
  [ComfortModel.PmvAshrae]: pmvRequiredControlIds,
  [ComfortModel.PmvIso]: pmvRequiredControlIds,
  [ComfortModel.Utci]: [
    InputControlId.Temperature,
    InputControlId.RadiantTemperature,
    InputControlId.WindSpeed,
    InputControlId.Humidity,
  ],
  [ComfortModel.AdaptiveAshrae]: adaptiveRequiredControlIds,
  [ComfortModel.AdaptiveEn]: adaptiveRequiredControlIds,
  [ComfortModel.HeatIndex]: tdbRhRequiredControlIds,
  [ComfortModel.Humidex]: tdbRhRequiredControlIds,
  [ComfortModel.WindChill]: [
    InputControlId.Temperature,
    InputControlId.WindSpeed,
  ],
  [ComfortModel.Phs2023]: [
    InputControlId.Temperature,
    InputControlId.RadiantTemperature,
    InputControlId.AirSpeed,
    InputControlId.Humidity,
    InputControlId.MetabolicRate,
    InputControlId.ClothingInsulation,
  ],
} as const satisfies Record<ComfortModelType, readonly InputControlIdType[]>;

/**
 * Independently authored required primary quantities. Do not generate these
 * from `inputFields`. Golden-key coverage must use this list.
 */
export const requiredPrimaryQuantitiesByModel = {
  [ComfortModel.PmvAshrae]: pmvRequiredPrimaryQuantities,
  [ComfortModel.PmvIso]: pmvRequiredPrimaryQuantities,
  [ComfortModel.Utci]: [
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.MeanRadiantTemperature,
    PhysicalQuantityId.WindSpeed,
    PhysicalQuantityId.RelativeHumidity,
  ],
  [ComfortModel.AdaptiveAshrae]: adaptiveRequiredPrimaryQuantities,
  [ComfortModel.AdaptiveEn]: adaptiveRequiredPrimaryQuantities,
  [ComfortModel.HeatIndex]: tdbRhRequiredPrimaryQuantities,
  [ComfortModel.Humidex]: tdbRhRequiredPrimaryQuantities,
  [ComfortModel.WindChill]: [
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.WindSpeed,
  ],
  [ComfortModel.Phs2023]: [
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.MeanRadiantTemperature,
    PhysicalQuantityId.WindSpeed,
    PhysicalQuantityId.RelativeHumidity,
    PhysicalQuantityId.MetabolicRate,
    PhysicalQuantityId.ClothingInsulation,
  ],
} as const satisfies Record<ComfortModelType, readonly PrimaryQuantityId[]>;
