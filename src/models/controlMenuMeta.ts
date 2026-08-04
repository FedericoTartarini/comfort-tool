import {
  AirSpeedControlMode,
  HumidityInputMode,
  TemperatureMode,
  type AirSpeedControlMode as AirSpeedControlModeType,
  type HumidityInputMode as HumidityInputModeType,
  type TemperatureMode as TemperatureModeType,
} from "./inputModes";

export type MenuItemDefinition<Value extends string> = {
  label: string;
  description: string;
  value: Value;
};

export const temperatureMenuItems: MenuItemDefinition<TemperatureModeType>[] = [
  {
    label: "Air temperature",
    description: "Use dry-bulb air temperature and keep radiant temperature separate.",
    value: TemperatureMode.Air,
  },
  {
    label: "Operative temp",
    description: "Treat operative temperature as the single temperature input.",
    value: TemperatureMode.Operative,
  },
];

export const airSpeedControlMenuItems: MenuItemDefinition<AirSpeedControlModeType>[] = [
  {
    label: "No local control",
    description: "Assume occupants do not have local control over elevated air speed.",
    value: AirSpeedControlMode.NoLocalControl,
  },
  {
    label: "With local control",
    description: "Assume occupants can locally control elevated air speed.",
    value: AirSpeedControlMode.WithLocalControl,
  },
];

export const humidityMenuItems: MenuItemDefinition<HumidityInputModeType>[] = [
  {
    label: "Relative humidity",
    description: "Input relative humidity as a percentage.",
    value: HumidityInputMode.RelativeHumidity,
  },
  {
    label: "Humidity ratio",
    description: "Hold absolute moisture content constant.",
    value: HumidityInputMode.HumidityRatio,
  },
  {
    label: "Dew point",
    description: "Keep dew point fixed and derive relative humidity from dry-bulb temperature.",
    value: HumidityInputMode.DewPoint,
  },
  {
    label: "Wet bulb",
    description: "Input wet-bulb temperature instead of relative humidity.",
    value: HumidityInputMode.WetBulb,
  },
  {
    label: "Vapor pressure",
    description: "Input vapor pressure directly.",
    value: HumidityInputMode.VaporPressure,
  },
];
