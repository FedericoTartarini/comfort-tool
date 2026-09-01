import { SiUnit } from "./units";

export const QuantityCategory = {
  Humidity: "humidity",
} as const;

export type QuantityCategory =
  (typeof QuantityCategory)[keyof typeof QuantityCategory];

export const PhysicalQuantityId = {
  DryBulbTemperature: "tdb",
  MeanRadiantTemperature: "tr",
  RelativeAirSpeed: "vr",
  WindSpeed: "v",
  RelativeHumidity: "rh",
  HumidityRatio: "hr",
  MetabolicRate: "met",
  ClothingInsulation: "clo",
  ExternalWork: "wme",
  PrevailingMeanOutdoorTemperature: "t_running_mean",
  OperativeTemperature: "t_o",
  DewPointTemperature: "t_dp",
  WetBulbTemperature: "t_wb",
  VaporPressure: "p_vap",
  MeasuredAirSpeed: "v_measured",
  MorningOutdoorTemperature: "tout",
  SolarAltitude: "sol_altitude",
  SolarHorizontalAngle: "sharp",
  DirectSolarRadiation: "sol_radiation_dir",
  SolarTransmittance: "sol_transmittance",
  SkyVaultViewFraction: "f_svv",
  BodyExposureFraction: "f_bes",
  BodyWeight: "weight",
  Height: "height",
  PredictedMeanVote: "pmv",
  PredictedPercentageOfDissatisfied: "ppd",
  StandardEffectiveTemperature: "set",
  CoolingEffect: "ce",
  HeatIndex: "hi",
  Humidex: "humidex",
  WindChillIndex: "wci",
  WindChillTemperature: "wct",
  UniversalThermalClimateIndex: "utci",
  LimitingExposureTime: "limiting_exposure_time",
  RectalTemperature: "t_re",
  SweatLoss: "sweat_loss_g",
} as const;

export type PhysicalQuantityId =
  (typeof PhysicalQuantityId)[keyof typeof PhysicalQuantityId];

export type QuantityState = Partial<Record<PhysicalQuantityId, number>>;

export interface QuantityRangeSi {
  min: number;
  max: number;
}

export function isValueInQuantityRange(
  value: number,
  range: QuantityRangeSi,
): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

export interface PhysicalQuantityMeta {
  label: string;
  siUnit: SiUnit;
  step?: number;
  category?: QuantityCategory;
}

export const physicalQuantityMetaById: Record<PhysicalQuantityId, PhysicalQuantityMeta> = {
  [PhysicalQuantityId.DryBulbTemperature]: {
    label: "Air temperature",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.MeanRadiantTemperature]: {
    label: "Radiant temperature",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.RelativeAirSpeed]: {
    label: "Air speed",
    siUnit: SiUnit.MeterPerSecond,
    step: 0.01,
  },
  [PhysicalQuantityId.WindSpeed]: {
    label: "Wind speed",
    siUnit: SiUnit.MeterPerSecond,
    step: 0.1,
  },
  [PhysicalQuantityId.RelativeHumidity]: {
    label: "Relative humidity",
    siUnit: SiUnit.Percent,
    step: 1,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.HumidityRatio]: {
    label: "Humidity ratio",
    siUnit: SiUnit.KilogramPerKilogram,
    step: 0.1,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.MetabolicRate]: {
    label: "Metabolic rate",
    siUnit: SiUnit.Met,
    step: 0.1,
  },
  [PhysicalQuantityId.ClothingInsulation]: {
    label: "Clothing insulation",
    siUnit: SiUnit.Clo,
    step: 0.1,
  },
  [PhysicalQuantityId.ExternalWork]: {
    label: "External work",
    siUnit: SiUnit.Met,
    step: 0.1,
  },
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: {
    label: "Prevailing mean outdoor temperature",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.OperativeTemperature]: {
    label: "Operative temperature",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.DewPointTemperature]: {
    label: "Dew point",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.WetBulbTemperature]: {
    label: "Wet bulb temperature",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.VaporPressure]: {
    label: "Vapor pressure",
    siUnit: SiUnit.Pascal,
    step: 0.01,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.MeasuredAirSpeed]: {
    label: "Measured air speed",
    siUnit: SiUnit.MeterPerSecond,
    step: 0.01,
  },
  [PhysicalQuantityId.MorningOutdoorTemperature]: {
    label: "Outdoor air temperature at 6 a.m.",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.SolarAltitude]: {
    label: "Solar altitude",
    siUnit: SiUnit.Degree,
    step: 1,
  },
  [PhysicalQuantityId.SolarHorizontalAngle]: {
    label: "Solar horizontal angle (SHARP)",
    siUnit: SiUnit.Degree,
    step: 1,
  },
  [PhysicalQuantityId.DirectSolarRadiation]: {
    label: "Direct-beam solar radiation",
    siUnit: SiUnit.WattPerSquareMeter,
    step: 10,
  },
  [PhysicalQuantityId.SolarTransmittance]: {
    label: "Total solar transmittance",
    siUnit: SiUnit.Dimensionless,
    step: 0.05,
  },
  [PhysicalQuantityId.SkyVaultViewFraction]: {
    label: "Sky-vault view fraction",
    siUnit: SiUnit.Dimensionless,
    step: 0.05,
  },
  [PhysicalQuantityId.BodyExposureFraction]: {
    label: "Body surface exposed to sun",
    siUnit: SiUnit.Dimensionless,
    step: 0.05,
  },
  [PhysicalQuantityId.BodyWeight]: {
    label: "Body weight",
    siUnit: SiUnit.Kilogram,
    step: 1,
  },
  [PhysicalQuantityId.Height]: {
    label: "Body height",
    siUnit: SiUnit.Meter,
    step: 0.01,
  },
  [PhysicalQuantityId.PredictedMeanVote]: {
    label: "PMV",
    siUnit: SiUnit.Dimensionless,
    step: 0.1,
  },
  [PhysicalQuantityId.PredictedPercentageOfDissatisfied]: {
    label: "PPD",
    siUnit: SiUnit.Percent,
    step: 1,
  },
  [PhysicalQuantityId.StandardEffectiveTemperature]: {
    label: "SET",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.CoolingEffect]: {
    label: "Cooling effect",
    siUnit: SiUnit.KelvinDelta,
    step: 0.1,
  },
  [PhysicalQuantityId.HeatIndex]: {
    label: "Heat index",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.Humidex]: {
    label: "Humidex",
    siUnit: SiUnit.Dimensionless,
    step: 1,
  },
  [PhysicalQuantityId.WindChillIndex]: {
    label: "Wind chill",
    siUnit: SiUnit.WattPerSquareMeter,
    step: 10,
  },
  [PhysicalQuantityId.WindChillTemperature]: {
    label: "Wind chill temperature",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.UniversalThermalClimateIndex]: {
    label: "UTCI",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.LimitingExposureTime]: {
    label: "Limiting exposure time",
    siUnit: SiUnit.Minute,
    step: 0.25,
  },
  [PhysicalQuantityId.RectalTemperature]: {
    label: "Rectal temperature",
    siUnit: SiUnit.DegreeCelsius,
    step: 0.5,
  },
  [PhysicalQuantityId.SweatLoss]: {
    label: "Water loss",
    siUnit: SiUnit.Gram,
    step: 0.1,
  },
};

export function isPhysicalQuantityId(value: string): value is PhysicalQuantityId {
  return Object.prototype.hasOwnProperty.call(physicalQuantityMetaById, value);
}

export function getPhysicalQuantityMeta(
  id: PhysicalQuantityId,
): PhysicalQuantityMeta & { step: number } {
  const meta = physicalQuantityMetaById[id];
  return {
    ...meta,
    step: meta.step ?? 0.1,
  };
}

export const derivedHumidityQuantityIds = [
  PhysicalQuantityId.DewPointTemperature,
  PhysicalQuantityId.HumidityRatio,
  PhysicalQuantityId.WetBulbTemperature,
  PhysicalQuantityId.VaporPressure,
] as const;

export type DerivedHumidityQuantityId = (typeof derivedHumidityQuantityIds)[number];

export function isDerivedHumidityQuantityId(
  value: string,
): value is DerivedHumidityQuantityId {
  return derivedHumidityQuantityIds.some((quantityId) => quantityId === value);
}

export const physicalQuantityWireIds = Object.values(PhysicalQuantityId);
