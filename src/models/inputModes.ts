export const TemperatureMode = {
  Air: "air",
  Operative: "operative",
} as const;

export type TemperatureMode = (typeof TemperatureMode)[keyof typeof TemperatureMode];

export const AirSpeedControlMode = {
  NoLocalControl: "noLocalControl",
  WithLocalControl: "withLocalControl",
} as const;

export type AirSpeedControlMode = (typeof AirSpeedControlMode)[keyof typeof AirSpeedControlMode];

export const HumidityInputMode = {
  RelativeHumidity: "relativeHumidity",
  HumidityRatio: "humidityRatio",
  DewPoint: "dewPoint",
  WetBulb: "wetBulb",
  VaporPressure: "vaporPressure",
} as const;

export type HumidityInputMode = (typeof HumidityInputMode)[keyof typeof HumidityInputMode];

export const OptionKey = {
  TemperatureMode: "temperature.mode",
  AirSpeedControlMode: "airSpeed.controlMode",
  HumidityInputMode: "humidity.inputMode",
} as const;

export type OptionKey = (typeof OptionKey)[keyof typeof OptionKey];

export type ModelOptionsRecord = Partial<Record<OptionKey, string>>;

type PmvCommonModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode;
  [OptionKey.HumidityInputMode]: HumidityInputMode;
};

export type PmvAshraeModelOptions = PmvCommonModelOptions & {
  [OptionKey.AirSpeedControlMode]: AirSpeedControlMode;
};

export type PmvIsoModelOptions = PmvCommonModelOptions;

export const defaultPmvAshraeOptions: PmvAshraeModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode.Air,
  [OptionKey.AirSpeedControlMode]: AirSpeedControlMode.WithLocalControl,
  [OptionKey.HumidityInputMode]: HumidityInputMode.RelativeHumidity,
};

export const defaultPmvIsoOptions: PmvIsoModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode.Air,
  [OptionKey.HumidityInputMode]: HumidityInputMode.RelativeHumidity,
};

export type AdaptiveModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode;
};

export const defaultAdaptiveOptions: AdaptiveModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode.Operative,
};

export type UtciModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode;
};

export const defaultUtciOptions: UtciModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode.Air,
};
