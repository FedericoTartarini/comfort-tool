/**
 * Field Keys and Input Identifiers
 * 
 * This file defines the keys used to identify individual input parameters 
 * (e.g., tdb, tr, rh) and derived input quantities across the application.
 * These keys ensure type-safe access to input state and consistent data mapping 
 * between the UI and calculation engines.
 */

// This object is a set of unique string values used to identify each input parameter.
export const FieldKey = {
  DryBulbTemperature: "tdb",
  MeanRadiantTemperature: "tr",
  RelativeAirSpeed: "vr",
  WindSpeed: "v",
  RelativeHumidity: "rh",
  MetabolicRate: "met",
  ClothingInsulation: "clo",
  ExternalWork: "wme",
  PrevailingMeanOutdoorTemperature: "trm",
  OperativeTemperature: "to",
} as const;

// This type is a union of all the keys in the FieldKey object, used for type safety.
export type FieldKey = (typeof FieldKey)[keyof typeof FieldKey];

// This object is a set of unique string values used to identify each derived input parameter.
export const DerivedInputId = {
  MeasuredAirSpeed: "airSpeed.measured",
  DewPoint: "humidity.dewPoint",
  HumidityRatio: "humidity.humidityRatio",
  WetBulb: "humidity.wetBulb",
  VaporPressure: "humidity.vaporPressure",
} as const;

// This type is a union of all the keys in the DerivedInputId object, used for type safety
export type DerivedInputId = (typeof DerivedInputId)[keyof typeof DerivedInputId];
