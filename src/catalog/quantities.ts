import {
  IpUnit,
  SiUnit,
  unitLabel,
  type UnitSystem as UnitSystemType,
} from "./units";

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

export const primaryInputOrder = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.RelativeAirSpeed,
  PhysicalQuantityId.WindSpeed,
  PhysicalQuantityId.RelativeHumidity,
  PhysicalQuantityId.MetabolicRate,
  PhysicalQuantityId.ClothingInsulation,
  PhysicalQuantityId.ExternalWork,
  PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
] as const;

export type PrimaryQuantityId = (typeof primaryInputOrder)[number];
export type PrimaryInputState = Record<PrimaryQuantityId, number>;

export interface PhysicalQuantityMeta {
  id: PhysicalQuantityId;
  label: string;
  units: { SI: SiUnit; IP: IpUnit };
  defaultSi: number;
  minSi: number;
  maxSi: number;
  step: number;
  category?: QuantityCategory;
}

const temperatureUnits = {
  SI: SiUnit.DegreeCelsius,
  IP: IpUnit.DegreeFahrenheit,
} as const;

const speedUnits = {
  SI: SiUnit.MeterPerSecond,
  IP: IpUnit.FootPerSecond,
} as const;

const dimensionlessUnits = {
  SI: SiUnit.Dimensionless,
  IP: IpUnit.Dimensionless,
} as const;

const percentUnits = {
  SI: SiUnit.Percent,
  IP: IpUnit.Percent,
} as const;

const metUnits = {
  SI: SiUnit.Met,
  IP: IpUnit.Met,
} as const;

const degreeUnits = {
  SI: SiUnit.Degree,
  IP: IpUnit.Degree,
} as const;

const heatFluxUnits = {
  SI: SiUnit.WattPerSquareMeter,
  IP: IpUnit.BtuPerHourSquareFoot,
} as const;

export const physicalQuantityMetaById: Record<PhysicalQuantityId, PhysicalQuantityMeta> = {
  [PhysicalQuantityId.DryBulbTemperature]: {
    id: PhysicalQuantityId.DryBulbTemperature,
    label: "Air temperature",
    units: temperatureUnits,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
    step: 0.5,
  },
  [PhysicalQuantityId.MeanRadiantTemperature]: {
    id: PhysicalQuantityId.MeanRadiantTemperature,
    label: "Radiant temperature",
    units: temperatureUnits,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
    step: 0.5,
  },
  [PhysicalQuantityId.RelativeAirSpeed]: {
    id: PhysicalQuantityId.RelativeAirSpeed,
    label: "Air speed",
    units: speedUnits,
    defaultSi: 0.1,
    minSi: 0,
    maxSi: 2,
    step: 0.01,
  },
  [PhysicalQuantityId.WindSpeed]: {
    id: PhysicalQuantityId.WindSpeed,
    label: "Wind speed",
    units: speedUnits,
    defaultSi: 1,
    minSi: 0,
    maxSi: 17,
    step: 0.1,
  },
  [PhysicalQuantityId.RelativeHumidity]: {
    id: PhysicalQuantityId.RelativeHumidity,
    label: "Relative humidity",
    units: percentUnits,
    defaultSi: 50,
    minSi: 0,
    maxSi: 100,
    step: 1,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.HumidityRatio]: {
    id: PhysicalQuantityId.HumidityRatio,
    label: "Humidity ratio",
    units: { SI: SiUnit.KilogramPerKilogram, IP: IpUnit.GrainPerPound },
    defaultSi: 0.009,
    minSi: 0,
    maxSi: 0.025,
    step: 0.1,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.MetabolicRate]: {
    id: PhysicalQuantityId.MetabolicRate,
    label: "Metabolic rate",
    units: metUnits,
    defaultSi: 1.2,
    minSi: 1,
    maxSi: 4,
    step: 0.1,
  },
  [PhysicalQuantityId.ClothingInsulation]: {
    id: PhysicalQuantityId.ClothingInsulation,
    label: "Clothing insulation",
    units: { SI: SiUnit.Clo, IP: IpUnit.Clo },
    defaultSi: 0.5,
    minSi: 0,
    maxSi: 1.5,
    step: 0.1,
  },
  [PhysicalQuantityId.ExternalWork]: {
    id: PhysicalQuantityId.ExternalWork,
    label: "External work",
    units: metUnits,
    defaultSi: 0,
    minSi: 0,
    maxSi: 2,
    step: 0.1,
  },
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: {
    id: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
    label: "Mean outdoor temperature",
    units: temperatureUnits,
    defaultSi: 20,
    minSi: 10,
    maxSi: 33.5,
    step: 0.5,
  },
  [PhysicalQuantityId.OperativeTemperature]: {
    id: PhysicalQuantityId.OperativeTemperature,
    label: "Operative temperature",
    units: temperatureUnits,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
    step: 0.5,
  },
  [PhysicalQuantityId.DewPointTemperature]: {
    id: PhysicalQuantityId.DewPointTemperature,
    label: "Dew point temperature",
    units: temperatureUnits,
    defaultSi: 15,
    minSi: -50,
    maxSi: 50,
    step: 0.5,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.WetBulbTemperature]: {
    id: PhysicalQuantityId.WetBulbTemperature,
    label: "Wet bulb temperature",
    units: temperatureUnits,
    defaultSi: 18,
    minSi: -50,
    maxSi: 50,
    step: 0.5,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.VaporPressure]: {
    id: PhysicalQuantityId.VaporPressure,
    label: "Vapor pressure",
    units: { SI: SiUnit.Pascal, IP: IpUnit.InchOfMercury },
    defaultSi: 1500,
    minSi: 0,
    maxSi: 10000,
    step: 0.01,
    category: QuantityCategory.Humidity,
  },
  [PhysicalQuantityId.MeasuredAirSpeed]: {
    id: PhysicalQuantityId.MeasuredAirSpeed,
    label: "Measured air speed",
    units: speedUnits,
    defaultSi: 0.1,
    minSi: 0,
    maxSi: 2,
    step: 0.01,
  },
  [PhysicalQuantityId.MorningOutdoorTemperature]: {
    id: PhysicalQuantityId.MorningOutdoorTemperature,
    label: "Outdoor air temperature at 6 a.m.",
    units: temperatureUnits,
    defaultSi: 20,
    minSi: -50,
    maxSi: 50,
    step: 0.5,
  },
  [PhysicalQuantityId.SolarAltitude]: {
    id: PhysicalQuantityId.SolarAltitude,
    label: "Solar altitude",
    units: degreeUnits,
    defaultSi: 45,
    minSi: 0,
    maxSi: 90,
    step: 1,
  },
  [PhysicalQuantityId.SolarHorizontalAngle]: {
    id: PhysicalQuantityId.SolarHorizontalAngle,
    label: "Solar horizontal angle (SHARP)",
    units: degreeUnits,
    defaultSi: 0,
    minSi: 0,
    maxSi: 180,
    step: 1,
  },
  [PhysicalQuantityId.DirectSolarRadiation]: {
    id: PhysicalQuantityId.DirectSolarRadiation,
    label: "Direct-beam solar radiation",
    units: heatFluxUnits,
    defaultSi: 500,
    minSi: 200,
    maxSi: 1000,
    step: 10,
  },
  [PhysicalQuantityId.SolarTransmittance]: {
    id: PhysicalQuantityId.SolarTransmittance,
    label: "Total solar transmittance",
    units: dimensionlessUnits,
    defaultSi: 0.5,
    minSi: 0,
    maxSi: 1,
    step: 0.05,
  },
  [PhysicalQuantityId.SkyVaultViewFraction]: {
    id: PhysicalQuantityId.SkyVaultViewFraction,
    label: "Sky-vault view fraction",
    units: dimensionlessUnits,
    defaultSi: 0.5,
    minSi: 0,
    maxSi: 1,
    step: 0.05,
  },
  [PhysicalQuantityId.BodyExposureFraction]: {
    id: PhysicalQuantityId.BodyExposureFraction,
    label: "Body surface exposed to sun",
    units: dimensionlessUnits,
    defaultSi: 0.25,
    minSi: 0,
    maxSi: 1,
    step: 0.05,
  },
  [PhysicalQuantityId.BodyWeight]: {
    id: PhysicalQuantityId.BodyWeight,
    label: "Body weight",
    units: { SI: SiUnit.Kilogram, IP: IpUnit.Pound },
    defaultSi: 75,
    minSi: 30,
    maxSi: 200,
    step: 1,
  },
  [PhysicalQuantityId.Height]: {
    id: PhysicalQuantityId.Height,
    label: "Body height",
    units: { SI: SiUnit.Meter, IP: IpUnit.Foot },
    defaultSi: 1.8,
    minSi: 1.2,
    maxSi: 2.2,
    step: 0.01,
  },
  [PhysicalQuantityId.PredictedMeanVote]: {
    id: PhysicalQuantityId.PredictedMeanVote,
    label: "PMV",
    units: dimensionlessUnits,
    defaultSi: 0,
    minSi: -3,
    maxSi: 3,
    step: 0.1,
  },
  [PhysicalQuantityId.PredictedPercentageOfDissatisfied]: {
    id: PhysicalQuantityId.PredictedPercentageOfDissatisfied,
    label: "PPD",
    units: percentUnits,
    defaultSi: 10,
    minSi: 0,
    maxSi: 100,
    step: 1,
  },
  [PhysicalQuantityId.StandardEffectiveTemperature]: {
    id: PhysicalQuantityId.StandardEffectiveTemperature,
    label: "SET",
    units: temperatureUnits,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
    step: 0.5,
  },
  [PhysicalQuantityId.CoolingEffect]: {
    id: PhysicalQuantityId.CoolingEffect,
    label: "Cooling effect",
    units: { SI: SiUnit.KelvinDelta, IP: IpUnit.DeltaFahrenheit },
    defaultSi: 0,
    minSi: 0,
    maxSi: 20,
    step: 0.1,
  },
  [PhysicalQuantityId.HeatIndex]: {
    id: PhysicalQuantityId.HeatIndex,
    label: "Heat index",
    units: temperatureUnits,
    defaultSi: 25,
    minSi: -40,
    maxSi: 120,
    step: 0.5,
  },
  [PhysicalQuantityId.Humidex]: {
    id: PhysicalQuantityId.Humidex,
    label: "Humidex",
    units: dimensionlessUnits,
    defaultSi: 25,
    minSi: -50,
    maxSi: 80,
    step: 1,
  },
  [PhysicalQuantityId.WindChillIndex]: {
    id: PhysicalQuantityId.WindChillIndex,
    label: "Wind chill",
    units: heatFluxUnits,
    defaultSi: 0,
    minSi: -2000,
    maxSi: 2000,
    step: 10,
  },
  [PhysicalQuantityId.WindChillTemperature]: {
    id: PhysicalQuantityId.WindChillTemperature,
    label: "Wind chill temperature",
    units: temperatureUnits,
    defaultSi: 0,
    minSi: -50,
    maxSi: 10,
    step: 0.5,
  },
  [PhysicalQuantityId.UniversalThermalClimateIndex]: {
    id: PhysicalQuantityId.UniversalThermalClimateIndex,
    label: "UTCI",
    units: temperatureUnits,
    defaultSi: 20,
    minSi: -50,
    maxSi: 50,
    step: 0.5,
  },
  [PhysicalQuantityId.LimitingExposureTime]: {
    id: PhysicalQuantityId.LimitingExposureTime,
    label: "Limiting exposure time",
    units: { SI: SiUnit.Minute, IP: IpUnit.Hour },
    defaultSi: 480,
    minSi: 0,
    maxSi: 480,
    step: 0.25,
  },
  [PhysicalQuantityId.RectalTemperature]: {
    id: PhysicalQuantityId.RectalTemperature,
    label: "Rectal temperature",
    units: temperatureUnits,
    defaultSi: 37,
    minSi: 36,
    maxSi: 42,
    step: 0.5,
  },
  [PhysicalQuantityId.SweatLoss]: {
    id: PhysicalQuantityId.SweatLoss,
    label: "Water loss",
    units: { SI: SiUnit.Gram, IP: IpUnit.Pound },
    defaultSi: 0,
    minSi: 0,
    maxSi: 10,
    step: 0.1,
  },
};

export function isPhysicalQuantityId(value: string): value is PhysicalQuantityId {
  return Object.prototype.hasOwnProperty.call(physicalQuantityMetaById, value);
}

export function isPrimaryQuantityId(value: string): value is PrimaryQuantityId {
  return primaryInputOrder.some((quantityId) => quantityId === value);
}

export function getPhysicalQuantityMeta(id: PhysicalQuantityId): PhysicalQuantityMeta {
  const meta = physicalQuantityMetaById[id];
  if (!meta) {
    throw new Error(`Unknown physical quantity: ${id}`);
  }
  return meta;
}

export function humidityQuantityIds(): readonly PhysicalQuantityId[] {
  return Object.values(physicalQuantityMetaById)
    .filter((meta) => (
      meta.category === QuantityCategory.Humidity
      && meta.id !== PhysicalQuantityId.RelativeHumidity
    ))
    .map((meta) => meta.id);
}

export const derivedHumidityQuantityIds = [
  PhysicalQuantityId.DewPointTemperature,
  PhysicalQuantityId.HumidityRatio,
  PhysicalQuantityId.WetBulbTemperature,
  PhysicalQuantityId.VaporPressure,
] as const;

export type DerivedHumidityQuantityId = (typeof derivedHumidityQuantityIds)[number];

export type AuxiliaryInputState = Partial<Record<PhysicalQuantityId, number>>;

export function createDefaultPrimaryInputState(): PrimaryInputState {
  return primaryInputOrder.reduce((accumulator, id) => {
    accumulator[id] = getPhysicalQuantityMeta(id).defaultSi;
    return accumulator;
  }, {} as PrimaryInputState);
}

export function getQuantityDisplayMeta(
  id: PhysicalQuantityId,
  unitSystem: UnitSystemType,
): { displayUnits: string; step: number } {
  const meta = getPhysicalQuantityMeta(id);
  return {
    displayUnits: unitLabel(meta.units, unitSystem),
    step: meta.step,
  };
}

export function getQuantityPresentationMeta(
  id: PhysicalQuantityId,
  unitSystem: UnitSystemType,
): QuantityPresentationMeta {
  const meta = getPhysicalQuantityMeta(id);
  const display = getQuantityDisplayMeta(id, unitSystem);
  return {
    label: meta.label,
    displayUnits: display.displayUnits,
    step: display.step,
    minSi: meta.minSi,
    maxSi: meta.maxSi,
  };
}

export type QuantityPresentationMeta = {
  label: string;
  displayUnits: string;
  step: number;
  minSi: number;
  maxSi: number;
};

export function createDefaultExtraInputs(
  extraIds: readonly PhysicalQuantityId[],
): Partial<Record<PhysicalQuantityId, number>> {
  return extraIds.reduce((accumulator, id) => {
    accumulator[id] = getPhysicalQuantityMeta(id).defaultSi;
    return accumulator;
  }, {} as Partial<Record<PhysicalQuantityId, number>>);
}
