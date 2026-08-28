import { SiUnit, type UnitSystem as UnitSystemType } from "./units";

/** Matches ModifierId wire values; kept here to avoid circular imports with inputModifiers. */
export const ModifierQuantityOwner = {
  MeasuredAirSpeed: "measuredAirSpeed",
  MorningClothingEstimate: "morningClothingEstimate",
  DynamicClothing: "dynamicClothing",
  SolarGain: "solarGain",
} as const;

export type ModifierQuantityOwner =
  (typeof ModifierQuantityOwner)[keyof typeof ModifierQuantityOwner];

/** Occupancy for write routing. Derived from lists, not stamped on catalog rows. */
export const QuantityState = {
  Primary: "primary",
  Slot: "slot",
  Extra: "extra",
} as const;

export type QuantityState = (typeof QuantityState)[keyof typeof QuantityState];

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
  PrevailingMeanOutdoorTemperature: "trm",
  OperativeTemperature: "to",
  DewPoint: "humidity.dewPoint",
  WetBulb: "humidity.wetBulb",
  VaporPressure: "humidity.vaporPressure",
  ModifierMeasuredAirSpeed: "modifier.measuredAirSpeed",
  ModifierMorningOutdoorTemperature: "modifier.morningOutdoorTemperature",
  ModifierSolarAltitude: "modifier.solarAltitude",
  ModifierSolarHorizontalAngle: "modifier.solarHorizontalAngle",
  ModifierDirectSolarRadiation: "modifier.directSolarRadiation",
  ModifierSolarTransmittance: "modifier.solarTransmittance",
  ModifierSkyVaultViewFraction: "modifier.skyVaultViewFraction",
  ModifierBodyExposureFraction: "modifier.bodyExposureFraction",
  BodyWeight: "bodyWeight",
  Height: "height",
  Pmv: "pmv",
  Ppd: "ppd",
  Set: "set",
  CoolingEffect: "coolingEffect",
  HeatIndex: "heatIndex",
  Humidex: "humidex",
  WindChill: "windChill",
  Utci: "utci",
  PhsLimitingExposureTime: "phsLimitingExposureTime",
  PhsRectalTemperature: "phsRectalTemperature",
  PhsWaterLoss: "phsWaterLoss",
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

export const extraQuantityIds = [
  PhysicalQuantityId.BodyWeight,
  PhysicalQuantityId.Height,
] as const;

export type ExtraQuantityId = (typeof extraQuantityIds)[number];

export interface QuantityDisplayMeta {
  units: { SI: SiUnit; IP: string };
  displayUnits: { SI: string; IP: string };
  step: number;
}

export interface PhysicalQuantityMeta { id: PhysicalQuantityId;
  label: string;
  display: QuantityDisplayMeta;
  defaultSi: number;
  minSi: number;
  maxSi: number;
  derivedFrom?: readonly PhysicalQuantityId[];
  modifierId?: ModifierQuantityOwner; }

const temperatureDisplay: QuantityDisplayMeta = {
  units: { SI: SiUnit.DegreeCelsius, IP: "degF" },
  displayUnits: { SI: "°C", IP: "°F" },
  step: 0.5,
};

const speedDisplay: QuantityDisplayMeta = {
  units: { SI: SiUnit.MeterPerSecond, IP: "ft/s" },
  displayUnits: { SI: "m/s", IP: "ft/s" },
  step: 0.01,
};

const windSpeedDisplay: QuantityDisplayMeta = {
  units: { SI: SiUnit.MeterPerSecond, IP: "ft/s" },
  displayUnits: { SI: "m/s", IP: "ft/s" },
  step: 0.1,
};

const humidityRatioDisplay: QuantityDisplayMeta = {
  units: { SI: SiUnit.KilogramPerKilogram, IP: "gr/lb" },
  displayUnits: { SI: "g/kg", IP: "gr/lb" },
  step: 0.1,
};

const vaporPressureDisplay: QuantityDisplayMeta = {
  units: { SI: SiUnit.Pascal, IP: "inHg" },
  displayUnits: { SI: "kPa", IP: "inHg" },
  step: 0.01,
};

const dimensionlessDisplay: QuantityDisplayMeta = {
  units: { SI: SiUnit.Dimensionless, IP: "1" },
  displayUnits: { SI: "", IP: "" },
  step: 0.05,
};

export const physicalQuantityMetaById: Record<PhysicalQuantityId, PhysicalQuantityMeta> = {
  [PhysicalQuantityId.DryBulbTemperature]: {
    id: PhysicalQuantityId.DryBulbTemperature,
    label: "Air temperature",
    display: temperatureDisplay,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
  },
  [PhysicalQuantityId.MeanRadiantTemperature]: {
    id: PhysicalQuantityId.MeanRadiantTemperature,
    label: "Radiant temperature",
    display: temperatureDisplay,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
  },
  [PhysicalQuantityId.RelativeAirSpeed]: {
    id: PhysicalQuantityId.RelativeAirSpeed,
    label: "Air speed",
    display: speedDisplay,
    defaultSi: 0.1,
    minSi: 0,
    maxSi: 2,
  },
  [PhysicalQuantityId.WindSpeed]: {
    id: PhysicalQuantityId.WindSpeed,
    label: "Wind speed",
    display: windSpeedDisplay,
    defaultSi: 1,
    minSi: 0,
    maxSi: 17,
  },
  [PhysicalQuantityId.RelativeHumidity]: {
    id: PhysicalQuantityId.RelativeHumidity,
    label: "Relative humidity",
    display: {
      units: { SI: SiUnit.Percent, IP: "%" },
      displayUnits: { SI: "%", IP: "%" },
      step: 1,
    },
    defaultSi: 50,
    minSi: 0,
    maxSi: 100,
  },
  [PhysicalQuantityId.HumidityRatio]: { id: PhysicalQuantityId.HumidityRatio, label: "Humidity ratio", display: humidityRatioDisplay, defaultSi: 0.009, minSi: 0, maxSi: 0.025, derivedFrom: [
      PhysicalQuantityId.RelativeHumidity, PhysicalQuantityId.DryBulbTemperature, ] },
  [PhysicalQuantityId.MetabolicRate]: {
    id: PhysicalQuantityId.MetabolicRate,
    label: "Metabolic rate",
    display: {
      units: { SI: SiUnit.Met, IP: "met" },
      displayUnits: { SI: "met", IP: "met" },
      step: 0.1,
    },
    defaultSi: 1.2,
    minSi: 1,
    maxSi: 4,
  },
  [PhysicalQuantityId.ClothingInsulation]: {
    id: PhysicalQuantityId.ClothingInsulation,
    label: "Clothing insulation",
    display: {
      units: { SI: SiUnit.Clo, IP: "clo" },
      displayUnits: { SI: "clo", IP: "clo" },
      step: 0.1,
    },
    defaultSi: 0.5,
    minSi: 0,
    maxSi: 1.5,
  },
  [PhysicalQuantityId.ExternalWork]: {
    id: PhysicalQuantityId.ExternalWork,
    label: "External work",
    display: {
      units: { SI: SiUnit.Met, IP: "met" },
      displayUnits: { SI: "met", IP: "met" },
      step: 0.1,
    },
    defaultSi: 0,
    minSi: 0,
    maxSi: 2,
  },
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: {
    id: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
    label: "Mean outdoor temperature",
    display: temperatureDisplay,
    defaultSi: 20,
    minSi: 10,
    maxSi: 33.5,
  },
  [PhysicalQuantityId.OperativeTemperature]: {
    id: PhysicalQuantityId.OperativeTemperature,
    label: "Operative temperature",
    display: temperatureDisplay,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
  },
  [PhysicalQuantityId.DewPoint]: { id: PhysicalQuantityId.DewPoint, label: "Dew point temperature", display: temperatureDisplay, defaultSi: 15, minSi: -50, maxSi: 50, derivedFrom: [
      PhysicalQuantityId.RelativeHumidity, PhysicalQuantityId.DryBulbTemperature, ] },
  [PhysicalQuantityId.WetBulb]: { id: PhysicalQuantityId.WetBulb, label: "Wet bulb temperature", display: temperatureDisplay, defaultSi: 18, minSi: -50, maxSi: 50, derivedFrom: [
      PhysicalQuantityId.RelativeHumidity, PhysicalQuantityId.DryBulbTemperature, ] },
  [PhysicalQuantityId.VaporPressure]: { id: PhysicalQuantityId.VaporPressure, label: "Vapor pressure", display: vaporPressureDisplay, defaultSi: 1500, minSi: 0, maxSi: 10000, derivedFrom: [
      PhysicalQuantityId.RelativeHumidity, PhysicalQuantityId.DryBulbTemperature, ] },
  [PhysicalQuantityId.ModifierMeasuredAirSpeed]: {
    id: PhysicalQuantityId.ModifierMeasuredAirSpeed,
    label: "Measured air speed",
    display: speedDisplay,
    defaultSi: 0.1,
    minSi: 0,
    maxSi: 2,
    modifierId: ModifierQuantityOwner.MeasuredAirSpeed,
  },
  [PhysicalQuantityId.ModifierMorningOutdoorTemperature]: {
    id: PhysicalQuantityId.ModifierMorningOutdoorTemperature,
    label: "Outdoor air temperature at 6 a.m.",
    display: temperatureDisplay,
    defaultSi: 20,
    minSi: -50,
    maxSi: 50,
    modifierId: ModifierQuantityOwner.MorningClothingEstimate,
  },
  [PhysicalQuantityId.ModifierSolarAltitude]: {
    id: PhysicalQuantityId.ModifierSolarAltitude,
    label: "Solar altitude",
    display: { units: { SI: SiUnit.Degree, IP: "deg" }, displayUnits: { SI: "°", IP: "°" }, step: 1 },
    defaultSi: 45,
    minSi: 0,
    maxSi: 90,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierSolarHorizontalAngle]: {
    id: PhysicalQuantityId.ModifierSolarHorizontalAngle,
    label: "Solar horizontal angle (SHARP)",
    display: { units: { SI: SiUnit.Degree, IP: "deg" }, displayUnits: { SI: "°", IP: "°" }, step: 1 },
    defaultSi: 0,
    minSi: 0,
    maxSi: 180,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierDirectSolarRadiation]: {
    id: PhysicalQuantityId.ModifierDirectSolarRadiation,
    label: "Direct-beam solar radiation",
    display: {
      units: { SI: SiUnit.WattPerSquareMeter, IP: "Btu/(h·ft2)" },
      displayUnits: { SI: "W/m²", IP: "Btu/(h·ft²)" },
      step: 10,
    },
    defaultSi: 500,
    minSi: 200,
    maxSi: 1000,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierSolarTransmittance]: {
    id: PhysicalQuantityId.ModifierSolarTransmittance,
    label: "Total solar transmittance",
    display: dimensionlessDisplay,
    defaultSi: 0.5,
    minSi: 0,
    maxSi: 1,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierSkyVaultViewFraction]: {
    id: PhysicalQuantityId.ModifierSkyVaultViewFraction,
    label: "Sky-vault view fraction",
    display: dimensionlessDisplay,
    defaultSi: 0.5,
    minSi: 0,
    maxSi: 1,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierBodyExposureFraction]: {
    id: PhysicalQuantityId.ModifierBodyExposureFraction,
    label: "Body surface exposed to sun",
    display: dimensionlessDisplay,
    defaultSi: 0.25,
    minSi: 0,
    maxSi: 1,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.BodyWeight]: {
    id: PhysicalQuantityId.BodyWeight,
    label: "Body weight",
    display: {
      units: { SI: SiUnit.Kilogram, IP: "lb" },
      displayUnits: { SI: "kg", IP: "lb" },
      step: 1,
    },
    defaultSi: 75,
    minSi: 30,
    maxSi: 200,
  },
  [PhysicalQuantityId.Height]: {
    id: PhysicalQuantityId.Height,
    label: "Body height",
    display: {
      units: { SI: SiUnit.Meter, IP: "ft" },
      displayUnits: { SI: "m", IP: "ft" },
      step: 0.01,
    },
    defaultSi: 1.8,
    minSi: 1.2,
    maxSi: 2.2,
  },
  [PhysicalQuantityId.Pmv]: {
    id: PhysicalQuantityId.Pmv,
    label: "PMV",
    display: { units: { SI: SiUnit.Dimensionless, IP: "1" }, displayUnits: { SI: "", IP: "" }, step: 0.1 },
    defaultSi: 0,
    minSi: -3,
    maxSi: 3,
  },
  [PhysicalQuantityId.Ppd]: {
    id: PhysicalQuantityId.Ppd,
    label: "PPD",
    display: {
      units: { SI: SiUnit.Percent, IP: "%" },
      displayUnits: { SI: "%", IP: "%" },
      step: 1,
    },
    defaultSi: 10,
    minSi: 0,
    maxSi: 100,
  },
  [PhysicalQuantityId.Set]: {
    id: PhysicalQuantityId.Set,
    label: "SET",
    display: temperatureDisplay,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
  },
  [PhysicalQuantityId.CoolingEffect]: {
    id: PhysicalQuantityId.CoolingEffect,
    label: "Cooling effect",
    display: {
      units: { SI: SiUnit.KelvinDelta, IP: "deltaF" },
      displayUnits: { SI: "°C", IP: "°F" },
      step: 0.1,
    },
    defaultSi: 0,
    minSi: 0,
    maxSi: 20,
  },
  [PhysicalQuantityId.HeatIndex]: {
    id: PhysicalQuantityId.HeatIndex,
    label: "Heat index",
    display: temperatureDisplay,
    defaultSi: 25,
    minSi: -40,
    maxSi: 120,
  },
  [PhysicalQuantityId.Humidex]: {
    id: PhysicalQuantityId.Humidex,
    label: "Humidex",
    display: { units: { SI: SiUnit.Dimensionless, IP: "1" }, displayUnits: { SI: "", IP: "" }, step: 1 },
    defaultSi: 25,
    minSi: -50,
    maxSi: 80,
  },
  [PhysicalQuantityId.WindChill]: {
    id: PhysicalQuantityId.WindChill,
    label: "Wind chill",
    display: {
      units: { SI: SiUnit.WattPerSquareMeter, IP: "Btu/(h·ft2)" },
      displayUnits: { SI: "W/m²", IP: "BTU/(h·ft²)" },
      step: 10,
    },
    defaultSi: 0,
    minSi: -2000,
    maxSi: 2000,
  },
  [PhysicalQuantityId.Utci]: {
    id: PhysicalQuantityId.Utci,
    label: "UTCI",
    display: temperatureDisplay,
    defaultSi: 20,
    minSi: -50,
    maxSi: 50,
  },
  [PhysicalQuantityId.PhsLimitingExposureTime]: {
    id: PhysicalQuantityId.PhsLimitingExposureTime,
    label: "Limiting exposure time",
    display: {
      units: { SI: SiUnit.Minute, IP: "min" },
      displayUnits: { SI: "h", IP: "h" },
      step: 0.25,
    },
    defaultSi: 480,
    minSi: 0,
    maxSi: 480,
  },
  [PhysicalQuantityId.PhsRectalTemperature]: {
    id: PhysicalQuantityId.PhsRectalTemperature,
    label: "Rectal temperature",
    display: temperatureDisplay,
    defaultSi: 37,
    minSi: 36,
    maxSi: 42,
  },
  [PhysicalQuantityId.PhsWaterLoss]: {
    id: PhysicalQuantityId.PhsWaterLoss,
    label: "Water loss",
    display: {
      units: { SI: SiUnit.Gram, IP: "lb" },
      displayUnits: { SI: "kg", IP: "lb" },
      step: 0.1,
    },
    defaultSi: 0,
    minSi: 0,
    maxSi: 10,
  },
};

export function isPhysicalQuantityId(value: string): value is PhysicalQuantityId {
  return Object.prototype.hasOwnProperty.call(physicalQuantityMetaById, value);
}

export function isExtraQuantityId(value: string): value is ExtraQuantityId {
  return extraQuantityIds.some((id) => id === value);
}

export function getPhysicalQuantityMeta(id: PhysicalQuantityId): PhysicalQuantityMeta {
  const meta = physicalQuantityMetaById[id];
  if (!meta) {
    throw new Error(`Unknown physical quantity: ${id}`);
  }
  return meta;
}

export const derivedSlotQuantityIds = [
  PhysicalQuantityId.DewPoint,
  PhysicalQuantityId.HumidityRatio,
  PhysicalQuantityId.WetBulb,
  PhysicalQuantityId.VaporPressure,
] as const;

export type DerivedSlotQuantityId = (typeof derivedSlotQuantityIds)[number];
export type DerivedSlotQuantityState = Record<DerivedSlotQuantityId, number>;

export const derivedQuantityIds = derivedSlotQuantityIds;

export type AuxiliaryInputState = Partial<Record<PhysicalQuantityId, number>>;

export const chartAxisQuantityIds = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.RelativeAirSpeed,
  PhysicalQuantityId.WindSpeed,
  PhysicalQuantityId.RelativeHumidity,
  PhysicalQuantityId.HumidityRatio,
  PhysicalQuantityId.MetabolicRate,
  PhysicalQuantityId.ClothingInsulation,
  PhysicalQuantityId.ExternalWork,
  PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
  PhysicalQuantityId.OperativeTemperature,
] as const;

export type ChartAxisQuantityId = (typeof chartAxisQuantityIds)[number];

export const slotQuantityIdsForModifier = (
  modifierId: ModifierQuantityOwner,
): PhysicalQuantityId[] =>
  Object.values(physicalQuantityMetaById)
    .filter((meta) => meta.modifierId === modifierId)
    .map((meta) => meta.id);

export function slotQuantityIds(): readonly PhysicalQuantityId[] {
  return [
    ...derivedQuantityIds,
    ...Object.values(physicalQuantityMetaById)
      .filter((meta) => meta.modifierId !== undefined)
      .map((meta) => meta.id),
  ];
}

export function resolveQuantityState(
  id: PhysicalQuantityId,
): QuantityState | undefined {
  if (primaryInputOrder.some((quantityId) => quantityId === id)) {
    return QuantityState.Primary;
  }
  if (extraQuantityIds.some((quantityId) => quantityId === id)) {
    return QuantityState.Extra;
  }
  if (slotQuantityIds().includes(id)) {
    return QuantityState.Slot;
  }
  return undefined;
}

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
  const { display } = getPhysicalQuantityMeta(id);
  return {
    displayUnits: display.displayUnits[unitSystem],
    step: display.step,
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
