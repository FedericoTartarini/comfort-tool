import { FieldKey, type FieldKey as FieldKeyType } from "./fieldKeys";

export const InputId = {
  Input1: "input1",
  Input2: "input2",
  Input3: "input3",
} as const;

export type InputId = (typeof InputId)[keyof typeof InputId];

export const inputOrder: InputId[] = [InputId.Input1, InputId.Input2, InputId.Input3];

type InputDefaults = Record<Exclude<FieldKeyType, "hr" | "to">, number>;

export const inputDefaultsById: Record<InputId, InputDefaults> = {
  [InputId.Input1]: {
    [FieldKey.DryBulbTemperature]: 26,
    [FieldKey.MeanRadiantTemperature]: 25,
    [FieldKey.RelativeAirSpeed]: 0.1,
    [FieldKey.WindSpeed]: 0.1,
    [FieldKey.RelativeHumidity]: 50,
    [FieldKey.MetabolicRate]: 1.0,
    [FieldKey.ClothingInsulation]: 0.51,
    [FieldKey.ExternalWork]: 0,
    [FieldKey.PrevailingMeanOutdoorTemperature]: 25,
  },
  [InputId.Input2]: {
    [FieldKey.DryBulbTemperature]: 25,
    [FieldKey.MeanRadiantTemperature]: 25,
    [FieldKey.RelativeAirSpeed]: 0.1,
    [FieldKey.WindSpeed]: 0.1,
    [FieldKey.RelativeHumidity]: 50,
    [FieldKey.MetabolicRate]: 1.1,
    [FieldKey.ClothingInsulation]: 0.61,
    [FieldKey.ExternalWork]: 0,
    [FieldKey.PrevailingMeanOutdoorTemperature]: 25,
  },
  [InputId.Input3]: {
    [FieldKey.DryBulbTemperature]: 23,
    [FieldKey.MeanRadiantTemperature]: 23,
    [FieldKey.RelativeAirSpeed]: 0.1,
    [FieldKey.WindSpeed]: 0.1,
    [FieldKey.RelativeHumidity]: 50,
    [FieldKey.MetabolicRate]: 1.2,
    [FieldKey.ClothingInsulation]: 0.71,
    [FieldKey.ExternalWork]: 0,
    [FieldKey.PrevailingMeanOutdoorTemperature]: 23,
  },
};
