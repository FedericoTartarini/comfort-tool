/**
 * Calculation Modes and Option Identifiers
 * 
 * This file defines the shared option identifiers and enumerations for different 
 * calculation modes and the various methods for specifying input parameters 
 * (e.g., Temperature Mode, Air Speed Input Mode).
 * 
 * These constants are used to manage the state of the UI controls 
 * and toggle between various calculation methodologies (e.g. Air Temperature/Operative Temperature).
 */

// Defines the different modes for temperature input.
export const TemperatureMode = {
  Air: "air",
  Operative: "operative",
} as const;

// Defines the temperature mode type.
export type TemperatureMode = (typeof TemperatureMode)[keyof typeof TemperatureMode];

// Defines the different modes for air speed input.
export const AirSpeedInputMode = {
  Relative: "relative",
  Measured: "measured",
} as const;

// Defines the air speed input mode type.
export type AirSpeedInputMode = (typeof AirSpeedInputMode)[keyof typeof AirSpeedInputMode];

// Defines the different modes for air speed control.
export const AirSpeedControlMode = {
  NoLocalControl: "noLocalControl",
  WithLocalControl: "withLocalControl",
} as const;

// Defines the air speed control mode type.
export type AirSpeedControlMode = (typeof AirSpeedControlMode)[keyof typeof AirSpeedControlMode];

// Defines the different modes for humidity input.
export const HumidityInputMode = {
  RelativeHumidity: "relativeHumidity",
  HumidityRatio: "humidityRatio",
  DewPoint: "dewPoint",
  WetBulb: "wetBulb",
  VaporPressure: "vaporPressure",
} as const;

// Defines the humidity input mode type.
export type HumidityInputMode = (typeof HumidityInputMode)[keyof typeof HumidityInputMode];

// Defines the option keys for the model, used to identify the different input parameters and their corresponding modes.
export const OptionKey = {
  TemperatureMode: "temperature.mode",
  AirSpeedControlMode: "airSpeed.controlMode",
  AirSpeedInputMode: "airSpeed.inputMode",
  HumidityInputMode: "humidity.inputMode",
} as const;

// Defines the option key type.
export type OptionKey = (typeof OptionKey)[keyof typeof OptionKey];

// Defines the option record type.
export type ModelOptionsRecord = Partial<Record<OptionKey, string>>;

// Defines the PMV model options type, used to store the PMV model input method options.
export type PmvModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode;
  [OptionKey.AirSpeedControlMode]: AirSpeedControlMode;
  [OptionKey.AirSpeedInputMode]: AirSpeedInputMode;
  [OptionKey.HumidityInputMode]: HumidityInputMode;
};

// Defines the default PMV model input method options.
export const defaultPmvOptions: PmvModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode.Air,
  [OptionKey.AirSpeedControlMode]: AirSpeedControlMode.WithLocalControl,
  [OptionKey.AirSpeedInputMode]: AirSpeedInputMode.Relative,
  [OptionKey.HumidityInputMode]: HumidityInputMode.RelativeHumidity,
};

// The adaptive standard modes (i.e. ASHRAE 55 and EN 16798-1). 
export const AdaptiveStandardMode = {
  Ashrae: "ashrae",
  En: "en",
} as const;

// The adaptive standard mode type. 
export type AdaptiveStandardMode = (typeof AdaptiveStandardMode)[keyof typeof AdaptiveStandardMode];

// The adaptive model options type. 
export type AdaptiveModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode;
};

// The default adaptive model options. 
export const defaultAdaptiveOptions: AdaptiveModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode.Operative,
};

// The UTCI model options type.
export type UtciModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode;
};

// The default UTCI model options.
export const defaultUtciOptions: UtciModelOptions = {
  [OptionKey.TemperatureMode]: TemperatureMode.Air,
};
