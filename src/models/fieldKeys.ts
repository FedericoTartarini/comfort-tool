export const FieldKey = {
  DryBulbTemperature: "tdb",
  MeanRadiantTemperature: "tr",
  RelativeAirSpeed: "vr",
  WindSpeed: "v",
  RelativeHumidity: "rh",
  HumidityRatio: "hr",
  MetabolicRate: "met",
  ClothingInsulation: "clo",
  ExternalWork: "wme",
  PrevailingMeanOutdoorTemperature: "trm",
  OperativeTemperature: "to",
} as const;

export type FieldKey = (typeof FieldKey)[keyof typeof FieldKey];

/** Fields persisted in canonical SI input state and share snapshots, in wire order. */
export const canonicalInputFieldOrder = [
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.RelativeAirSpeed,
  FieldKey.WindSpeed,
  FieldKey.RelativeHumidity,
  FieldKey.MetabolicRate,
  FieldKey.ClothingInsulation,
  FieldKey.ExternalWork,
  FieldKey.PrevailingMeanOutdoorTemperature,
] as const;

export type CanonicalInputFieldKey = (typeof canonicalInputFieldOrder)[number];
export type CanonicalInputState = Record<CanonicalInputFieldKey, number>;

export const DerivedInputId = {
  DewPoint: "humidity.dewPoint",
  HumidityRatio: "humidity.humidityRatio",
  WetBulb: "humidity.wetBulb",
  VaporPressure: "humidity.vaporPressure",
} as const;

export type DerivedInputId = (typeof DerivedInputId)[keyof typeof DerivedInputId];
export type DerivedInputState = Record<DerivedInputId, number>;
