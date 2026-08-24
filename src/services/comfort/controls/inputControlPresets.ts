import type { PresetInputOption } from "../../../models/inputControls";
import {
  clothingTypicalEnsembles,
  metabolicActivityOptions,
} from "../referenceValues";

export const InputPresetKey = {
  MetabolicRate: "metabolicRate",
  ClothingInsulation: "clothingInsulation",
  AdaptiveAshraeAirSpeed: "adaptiveAshraeAirSpeed",
  AdaptiveEnAirSpeed: "adaptiveEnAirSpeed",
} as const;

export type InputPresetKey =
  (typeof InputPresetKey)[keyof typeof InputPresetKey];

export function metabolicRatePresetOptions(): readonly PresetInputOption[] {
  return metabolicActivityOptions.map((activity) => ({
    id: activity.id,
    label: activity.label,
    value: activity.met,
  }));
}

export function clothingInsulationPresetOptions(): readonly PresetInputOption[] {
  return clothingTypicalEnsembles.map((ensemble) => ({
    id: ensemble.id,
    label: ensemble.label,
    value: ensemble.clo,
  }));
}

export function adaptiveAshraeAirSpeedPresetOptions(): readonly PresetInputOption[] {
  return [
    { id: "0.3", value: 0.3, label: "0.3 m/s (59 fpm)" },
    { id: "0.6", value: 0.6, label: "0.6 m/s (118 fpm)" },
    { id: "0.9", value: 0.9, label: "0.9 m/s (177 fpm)" },
    { id: "1.2", value: 1.2, label: "1.2 m/s (236 fpm)" },
  ];
}

export function adaptiveEnAirSpeedPresetOptions(): readonly PresetInputOption[] {
  return [
    { id: "0.1", value: 0.1, label: "lower than 0.6 m/s (118 fpm)" },
    { id: "0.6", value: 0.6, label: "0.6 m/s (118 fpm)" },
    { id: "0.9", value: 0.9, label: "0.9 m/s (177 fpm)" },
    { id: "1.2", value: 1.2, label: "1.2 m/s (236 fpm)" },
  ];
}

export function getInputPresetOptions(
  key: InputPresetKey,
): readonly PresetInputOption[] {
  switch (key) {
    case InputPresetKey.MetabolicRate:
      return metabolicRatePresetOptions();
    case InputPresetKey.ClothingInsulation:
      return clothingInsulationPresetOptions();
    case InputPresetKey.AdaptiveAshraeAirSpeed:
      return adaptiveAshraeAirSpeedPresetOptions();
    case InputPresetKey.AdaptiveEnAirSpeed:
      return adaptiveEnAirSpeedPresetOptions();
    default: {
      const unknownKey: never = key;
      throw new Error(`Unknown input preset key: ${unknownKey}`);
    }
  }
}
