import { PhysicalQuantityId, type PrimaryInputState } from "./quantities";
export const InputId = {
  Input1: "input1",
  Input2: "input2",
  Input3: "input3",
} as const;

export type InputId = (typeof InputId)[keyof typeof InputId];

export const inputOrder: InputId[] = [InputId.Input1, InputId.Input2, InputId.Input3];

export const inputDefaultsById: Record<InputId, PrimaryInputState> = {
  [InputId.Input1]: {
    [PhysicalQuantityId.DryBulbTemperature]: 26,
    [PhysicalQuantityId.MeanRadiantTemperature]: 25,
    [PhysicalQuantityId.RelativeAirSpeed]: 0.1,
    [PhysicalQuantityId.WindSpeed]: 0.1,
    [PhysicalQuantityId.RelativeHumidity]: 50,
    [PhysicalQuantityId.MetabolicRate]: 1.0,
    [PhysicalQuantityId.ClothingInsulation]: 0.51,
    [PhysicalQuantityId.ExternalWork]: 0,
    [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 25,
  },
  [InputId.Input2]: {
    [PhysicalQuantityId.DryBulbTemperature]: 25,
    [PhysicalQuantityId.MeanRadiantTemperature]: 25,
    [PhysicalQuantityId.RelativeAirSpeed]: 0.1,
    [PhysicalQuantityId.WindSpeed]: 0.1,
    [PhysicalQuantityId.RelativeHumidity]: 50,
    [PhysicalQuantityId.MetabolicRate]: 1.1,
    [PhysicalQuantityId.ClothingInsulation]: 0.61,
    [PhysicalQuantityId.ExternalWork]: 0,
    [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 25,
  },
  [InputId.Input3]: {
    [PhysicalQuantityId.DryBulbTemperature]: 23,
    [PhysicalQuantityId.MeanRadiantTemperature]: 23,
    [PhysicalQuantityId.RelativeAirSpeed]: 0.1,
    [PhysicalQuantityId.WindSpeed]: 0.1,
    [PhysicalQuantityId.RelativeHumidity]: 50,
    [PhysicalQuantityId.MetabolicRate]: 1.2,
    [PhysicalQuantityId.ClothingInsulation]: 0.71,
    [PhysicalQuantityId.ExternalWork]: 0,
    [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 23,
  },
};
