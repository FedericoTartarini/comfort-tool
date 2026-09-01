import { InputControlId } from "./inputControls";
import {
  PhysicalQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "./quantities";

/** Catalog widget kinds. Model files select a quantity and optionally override. */
export const InputWidget = {
  Numeric: "numeric",
  OperativeTemperature: "operativeTemperature",
  RadiantTemperature: "radiantTemperature",
  SimpleHumidity: "simpleHumidity",
  AdvancedHumidity: "advancedHumidity",
  OccupantAirSpeed: "occupantAirSpeed",
  OutdoorWindSpeed: "outdoorWindSpeed",
  Preset: "preset",
} as const;

export type InputWidget = (typeof InputWidget)[keyof typeof InputWidget];

export const defaultFieldWidgetByQuantity: Partial<Record<PhysicalQuantityIdType, InputWidget>> = {
  [PhysicalQuantityId.DryBulbTemperature]: InputWidget.Numeric,
  [PhysicalQuantityId.MeanRadiantTemperature]: InputWidget.RadiantTemperature,
  [PhysicalQuantityId.RelativeAirSpeed]: InputWidget.OccupantAirSpeed,
  [PhysicalQuantityId.WindSpeed]: InputWidget.OutdoorWindSpeed,
  [PhysicalQuantityId.RelativeHumidity]: InputWidget.SimpleHumidity,
  [PhysicalQuantityId.MetabolicRate]: InputWidget.Preset,
  [PhysicalQuantityId.ClothingInsulation]: InputWidget.Preset,
  [PhysicalQuantityId.ExternalWork]: InputWidget.Numeric,
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: InputWidget.Numeric,
};

export const defaultControlIdByQuantity: Partial<
  Record<PhysicalQuantityIdType, (typeof InputControlId)[keyof typeof InputControlId]>
> = {
  [PhysicalQuantityId.DryBulbTemperature]: InputControlId.Temperature,
  [PhysicalQuantityId.MeanRadiantTemperature]: InputControlId.RadiantTemperature,
  [PhysicalQuantityId.RelativeAirSpeed]: InputControlId.AirSpeed,
  [PhysicalQuantityId.WindSpeed]: InputControlId.WindSpeed,
  [PhysicalQuantityId.RelativeHumidity]: InputControlId.Humidity,
  [PhysicalQuantityId.MetabolicRate]: InputControlId.MetabolicRate,
  [PhysicalQuantityId.ClothingInsulation]: InputControlId.ClothingInsulation,
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]:
    InputControlId.PrevailingMeanOutdoorTemperature,
};
