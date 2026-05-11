/**
 * Input Fields Metadata
 * 
 * This file defines the descriptive metadata for all user-adjustable input fields 
 * (e.g., Temperature, Humidity, Clothing). It centralizes display labels, 
 * unit systems (SI/IP), decimal precision, and valid range constraints used 
 * by the UI and validation logic.
 */
import { FieldKey, type FieldKey as FieldKeyType } from "./fieldKeys";
// Defines the schema for the metadata associated with a single input field, (e.g. display name, units, and allowed value range).
export interface FieldMeta {
  key: FieldKeyType;
  label: string;
  units: {
    SI: string;
    IP: string;
  };
  displayUnits: {
    SI: string;
    IP: string;
  };
  step: number;
  decimals: number;
  defaultValue: number;
  minValue: number;
  maxValue: number;
}

// A central registry mapping each FieldKey to its corresponding FieldMeta definition. Used to define metadata for each input field.
export const fieldMetaByKey: Record<FieldKeyType, FieldMeta> = {
  [FieldKey.DryBulbTemperature]: {
    key: FieldKey.DryBulbTemperature,
    label: "Air temperature",
    units: { SI: "degC", IP: "degF" },
    displayUnits: { SI: "°C", IP: "°F" },
    step: 0.5,
    decimals: 1,
    defaultValue: 25,
    minValue: 10,
    maxValue: 40,
  },
  [FieldKey.MeanRadiantTemperature]: {
    key: FieldKey.MeanRadiantTemperature,
    label: "Radiant temperature",
    units: { SI: "degC", IP: "degF" },
    displayUnits: { SI: "°C", IP: "°F" },
    step: 0.5,
    decimals: 1,
    defaultValue: 25,
    minValue: 10,
    maxValue: 40,
  },
  [FieldKey.RelativeAirSpeed]: {
    key: FieldKey.RelativeAirSpeed,
    label: "Air speed",
    units: { SI: "m/s", IP: "ft/s" },
    displayUnits: { SI: "m/s", IP: "ft/s" },
    step: 0.01,
    decimals: 2,
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 2,
  },
  [FieldKey.WindSpeed]: {
    key: FieldKey.WindSpeed,
    label: "Wind speed",
    units: { SI: "m/s", IP: "ft/s" },
    displayUnits: { SI: "m/s", IP: "ft/s" },
    step: 0.1,
    decimals: 1,
    defaultValue: 1,
    minValue: 0,
    maxValue: 17,
  },
  [FieldKey.RelativeHumidity]: {
    key: FieldKey.RelativeHumidity,
    label: "Relative humidity",
    units: { SI: "%", IP: "%" },
    displayUnits: { SI: "%", IP: "%" },
    step: 1,
    decimals: 0,
    defaultValue: 50,
    minValue: 0,
    maxValue: 100,
  },
  [FieldKey.HumidityRatio]: {
    key: FieldKey.HumidityRatio,
    label: "Humidity ratio",
    units: { SI: "g/kg", IP: "gr/lb" },
    displayUnits: { SI: "g/kg", IP: "gr/lb" },
    step: 1,
    decimals: 0,
    defaultValue: 9,
    minValue: 0,
    maxValue: 25,
  },
  [FieldKey.MetabolicRate]: {
    key: FieldKey.MetabolicRate,
    label: "Metabolic rate",
    units: { SI: "met", IP: "met" },
    displayUnits: { SI: "met", IP: "met" },
    step: 0.1,
    decimals: 1,
    defaultValue: 1.2,
    minValue: 1,
    maxValue: 4,
  },
  [FieldKey.ClothingInsulation]: {
    key: FieldKey.ClothingInsulation,
    label: "Clothing insulation",
    units: { SI: "clo", IP: "clo" },
    displayUnits: { SI: "clo", IP: "clo" },
    step: 0.1,
    decimals: 1,
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1.5,
  },
  [FieldKey.ExternalWork]: {
    key: FieldKey.ExternalWork,
    label: "External work",
    units: { SI: "met", IP: "met" },
    displayUnits: { SI: "met", IP: "met" },
    step: 0.1,
    decimals: 1,
    defaultValue: 0,
    minValue: 0,
    maxValue: 2,
  },
  [FieldKey.PrevailingMeanOutdoorTemperature]: {
    key: FieldKey.PrevailingMeanOutdoorTemperature,
    label: "Mean outdoor temperature",
    units: { SI: "degC", IP: "degF" },
    displayUnits: { SI: "°C", IP: "°F" },
    step: 0.5,
    decimals: 1,
    defaultValue: 20,
    minValue: 10,
    maxValue: 33.5,
  },
  [FieldKey.OperativeTemperature]: {
    key: FieldKey.OperativeTemperature,
    label: "Operative temperature",
    units: { SI: "degC", IP: "degF" },
    displayUnits: { SI: "°C", IP: "°F" },
    step: 0.5,
    decimals: 1,
    defaultValue: 25,
    minValue: 10,
    maxValue: 40,
  },
};

// The order in which the input fields are displayed in the input panel.
export const allFieldOrder: FieldKeyType[] = [
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.RelativeAirSpeed,
  FieldKey.WindSpeed,
  FieldKey.RelativeHumidity,
  FieldKey.MetabolicRate,
  FieldKey.ClothingInsulation,
  FieldKey.ExternalWork,
  FieldKey.PrevailingMeanOutdoorTemperature,
];
