import { FieldKey, type FieldKey as FieldKeyType } from "./fieldKeys";

export interface FieldMeta<Key extends FieldKeyType = FieldKeyType> {
  key: Key;
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

export const fieldMetaByKey: {
  [Key in FieldKeyType]: FieldMeta<Key>;
} = {
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
