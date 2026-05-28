import type { OptionKey as OptionKeyType } from "./inputModes";
import type { InputId as InputIdType } from "./inputSlots";

export const InputControlId = {
  Temperature: "temperature",
  RadiantTemperature: "radiantTemperature",
  AirSpeed: "airSpeed",
  WindSpeed: "windSpeed",
  Humidity: "humidity",
  MetabolicRate: "metabolicRate",
  ClothingInsulation: "clothingInsulation",
  PrevailingMeanOutdoorTemperature: "prevailingMeanOutdoorTemperature",
} as const;

export type InputControlId = (typeof InputControlId)[keyof typeof InputControlId];

type InputControlEditorKind = "number" | "preset";

export type PresetInputOption = {
  id: string;
  label: string;
  value: number;
};

type AdvancedOptionItem = {
  label: string;
  description: string;
  optionKey: OptionKeyType;
  value: string;
  active: boolean;
};

export type AdvancedOptionSection = {
  title?: string;
  items: AdvancedOptionItem[];
};

export type AdvancedOptionMenu = {
  title: string;
  sections: AdvancedOptionSection[];
} | null;

export type InputControlViewModel = {
  id: InputControlId;
  label: string;
  displayUnits: string;
  rangeText: string;
  minValue?: number;
  maxValue?: number;
  hidden: boolean;
  disabled: boolean;
  editorKind: InputControlEditorKind;
  step: number;
  menu: AdvancedOptionMenu;
  presetOptions: PresetInputOption[];
  presetDecimals: number;
  showClothingBuilder: boolean;
  displayValuesByInput: Partial<Record<InputIdType, string>>;
  numericValuesByInput: Partial<Record<InputIdType, number>>;
};
