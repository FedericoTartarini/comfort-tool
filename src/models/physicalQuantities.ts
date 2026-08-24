import { ComfortModel, type ComfortModel as ComfortModelType } from "./comfortModels";
import type { UnitSystem as UnitSystemType } from "./units";

/** Matches ModifierId wire values; kept here to avoid circular imports with inputModifiers. */
export const ModifierQuantityOwner = {
  MeasuredAirSpeed: "measuredAirSpeed",
  MorningClothingEstimate: "morningClothingEstimate",
  DynamicClothing: "dynamicClothing",
  SolarGain: "solarGain",
} as const;

export type ModifierQuantityOwner =
  (typeof ModifierQuantityOwner)[keyof typeof ModifierQuantityOwner];

export const PhysicalQuantityScope = {
  System: "system",
  Model: "model",
} as const;

export type PhysicalQuantityScope =
  (typeof PhysicalQuantityScope)[keyof typeof PhysicalQuantityScope];

export const QuantityState = {
  Primary: "primary",
  Slot: "slot",
  Model: "model",
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
  DerivedHumidityRatio: "humidity.humidityRatio",
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
  PhsBodyWeight: "phs.bodyWeight",
  PhsHeight: "phs.height",
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

export interface QuantityDisplayMeta {
  units: { SI: string; IP: string };
  displayUnits: { SI: string; IP: string };
  step: number;
  decimals: number | { SI: number; IP: number };
}

function resolveDisplayDecimals(
  decimals: QuantityDisplayMeta["decimals"],
  unitSystem: UnitSystemType,
): number {
  return typeof decimals === "number" ? decimals : decimals[unitSystem];
}

export interface PhysicalQuantityMeta {
  id: PhysicalQuantityId;
  scope: PhysicalQuantityScope;
  state?: QuantityState;
  label: string;
  display: QuantityDisplayMeta;
  defaultSi: number;
  minSi: number;
  maxSi: number;
  inPrimaryOrder?: boolean;
  derivedFrom?: readonly PhysicalQuantityId[];
  modifierId?: ModifierQuantityOwner;
  ownerModelId?: ComfortModelType;
  share?: boolean;
}

const temperatureDisplay: QuantityDisplayMeta = {
  units: { SI: "degC", IP: "degF" },
  displayUnits: { SI: "°C", IP: "°F" },
  step: 0.5,
  decimals: 1,
};

const speedDisplay: QuantityDisplayMeta = {
  units: { SI: "m/s", IP: "ft/s" },
  displayUnits: { SI: "m/s", IP: "ft/s" },
  step: 0.01,
  decimals: 2,
};

const windSpeedDisplay: QuantityDisplayMeta = {
  units: { SI: "m/s", IP: "ft/s" },
  displayUnits: { SI: "m/s", IP: "ft/s" },
  step: 0.1,
  decimals: 1,
};

export const physicalQuantityMetaById: Record<PhysicalQuantityId, PhysicalQuantityMeta> = {
  [PhysicalQuantityId.DryBulbTemperature]: {
    id: PhysicalQuantityId.DryBulbTemperature,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Primary,
    label: "Air temperature",
    display: temperatureDisplay,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
    inPrimaryOrder: true,
  },
  [PhysicalQuantityId.MeanRadiantTemperature]: {
    id: PhysicalQuantityId.MeanRadiantTemperature,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Primary,
    label: "Radiant temperature",
    display: temperatureDisplay,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
    inPrimaryOrder: true,
  },
  [PhysicalQuantityId.RelativeAirSpeed]: {
    id: PhysicalQuantityId.RelativeAirSpeed,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Primary,
    label: "Air speed",
    display: speedDisplay,
    defaultSi: 0.1,
    minSi: 0,
    maxSi: 2,
    inPrimaryOrder: true,
  },
  [PhysicalQuantityId.WindSpeed]: {
    id: PhysicalQuantityId.WindSpeed,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Primary,
    label: "Wind speed",
    display: windSpeedDisplay,
    defaultSi: 1,
    minSi: 0,
    maxSi: 17,
    inPrimaryOrder: true,
  },
  [PhysicalQuantityId.RelativeHumidity]: {
    id: PhysicalQuantityId.RelativeHumidity,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Primary,
    label: "Relative humidity",
    display: {
      units: { SI: "%", IP: "%" },
      displayUnits: { SI: "%", IP: "%" },
      step: 1,
      decimals: 0,
    },
    defaultSi: 50,
    minSi: 0,
    maxSi: 100,
    inPrimaryOrder: true,
  },
  [PhysicalQuantityId.HumidityRatio]: {
    id: PhysicalQuantityId.HumidityRatio,
    scope: PhysicalQuantityScope.System,
    label: "Humidity ratio",
    display: {
      units: { SI: "g/kg", IP: "gr/lb" },
      displayUnits: { SI: "g/kg", IP: "gr/lb" },
      step: 1,
      decimals: 0,
    },
    defaultSi: 9,
    minSi: 0,
    maxSi: 25,
  },
  [PhysicalQuantityId.MetabolicRate]: {
    id: PhysicalQuantityId.MetabolicRate,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Primary,
    label: "Metabolic rate",
    display: {
      units: { SI: "met", IP: "met" },
      displayUnits: { SI: "met", IP: "met" },
      step: 0.1,
      decimals: 1,
    },
    defaultSi: 1.2,
    minSi: 1,
    maxSi: 4,
    inPrimaryOrder: true,
  },
  [PhysicalQuantityId.ClothingInsulation]: {
    id: PhysicalQuantityId.ClothingInsulation,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Primary,
    label: "Clothing insulation",
    display: {
      units: { SI: "clo", IP: "clo" },
      displayUnits: { SI: "clo", IP: "clo" },
      step: 0.1,
      decimals: 1,
    },
    defaultSi: 0.5,
    minSi: 0,
    maxSi: 1.5,
    inPrimaryOrder: true,
  },
  [PhysicalQuantityId.ExternalWork]: {
    id: PhysicalQuantityId.ExternalWork,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Primary,
    label: "External work",
    display: {
      units: { SI: "met", IP: "met" },
      displayUnits: { SI: "met", IP: "met" },
      step: 0.1,
      decimals: 1,
    },
    defaultSi: 0,
    minSi: 0,
    maxSi: 2,
    inPrimaryOrder: true,
  },
  [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: {
    id: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Primary,
    label: "Mean outdoor temperature",
    display: temperatureDisplay,
    defaultSi: 20,
    minSi: 10,
    maxSi: 33.5,
    inPrimaryOrder: true,
  },
  [PhysicalQuantityId.OperativeTemperature]: {
    id: PhysicalQuantityId.OperativeTemperature,
    scope: PhysicalQuantityScope.System,
    label: "Operative temperature",
    display: temperatureDisplay,
    defaultSi: 25,
    minSi: 10,
    maxSi: 40,
  },
  [PhysicalQuantityId.DewPoint]: {
    id: PhysicalQuantityId.DewPoint,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Dew point temperature",
    display: temperatureDisplay,
    defaultSi: 15,
    minSi: -50,
    maxSi: 50,
    derivedFrom: [
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.DryBulbTemperature,
    ],
  },
  [PhysicalQuantityId.DerivedHumidityRatio]: {
    id: PhysicalQuantityId.DerivedHumidityRatio,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Humidity ratio",
    display: {
      units: { SI: "g/kg", IP: "gr/lb" },
      displayUnits: { SI: "g/kg", IP: "gr/lb" },
      step: 0.1,
      decimals: 1,
    },
    defaultSi: 9,
    minSi: 0,
    maxSi: 25,
    derivedFrom: [
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.DryBulbTemperature,
    ],
  },
  [PhysicalQuantityId.WetBulb]: {
    id: PhysicalQuantityId.WetBulb,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Wet bulb temperature",
    display: temperatureDisplay,
    defaultSi: 18,
    minSi: -50,
    maxSi: 50,
    derivedFrom: [
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.DryBulbTemperature,
    ],
  },
  [PhysicalQuantityId.VaporPressure]: {
    id: PhysicalQuantityId.VaporPressure,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Vapor pressure",
    display: {
      units: { SI: "kPa", IP: "inHg" },
      displayUnits: { SI: "kPa", IP: "inHg" },
      step: 0.01,
      decimals: 2,
    },
    defaultSi: 1.5,
    minSi: 0,
    maxSi: 10,
    derivedFrom: [
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.DryBulbTemperature,
    ],
  },
  [PhysicalQuantityId.ModifierMeasuredAirSpeed]: {
    id: PhysicalQuantityId.ModifierMeasuredAirSpeed,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Measured air speed",
    display: speedDisplay,
    defaultSi: 0.1,
    minSi: 0,
    maxSi: 2,
    modifierId: ModifierQuantityOwner.MeasuredAirSpeed,
  },
  [PhysicalQuantityId.ModifierMorningOutdoorTemperature]: {
    id: PhysicalQuantityId.ModifierMorningOutdoorTemperature,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Outdoor air temperature at 6 a.m.",
    display: temperatureDisplay,
    defaultSi: 20,
    minSi: -50,
    maxSi: 50,
    modifierId: ModifierQuantityOwner.MorningClothingEstimate,
  },
  [PhysicalQuantityId.ModifierSolarAltitude]: {
    id: PhysicalQuantityId.ModifierSolarAltitude,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Solar altitude",
    display: { units: { SI: "deg", IP: "deg" }, displayUnits: { SI: "°", IP: "°" }, step: 1, decimals: 0 },
    defaultSi: 45,
    minSi: 0,
    maxSi: 90,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierSolarHorizontalAngle]: {
    id: PhysicalQuantityId.ModifierSolarHorizontalAngle,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Solar horizontal angle (SHARP)",
    display: { units: { SI: "deg", IP: "deg" }, displayUnits: { SI: "°", IP: "°" }, step: 1, decimals: 0 },
    defaultSi: 0,
    minSi: 0,
    maxSi: 180,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierDirectSolarRadiation]: {
    id: PhysicalQuantityId.ModifierDirectSolarRadiation,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Direct-beam solar radiation",
    display: { units: { SI: "W/m2", IP: "Btu/(h·ft2)" }, displayUnits: { SI: "W/m²", IP: "Btu/(h·ft²)" }, step: 10, decimals: { SI: 0, IP: 3 } },
    defaultSi: 500,
    minSi: 200,
    maxSi: 1000,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierSolarTransmittance]: {
    id: PhysicalQuantityId.ModifierSolarTransmittance,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Total solar transmittance",
    display: { units: { SI: "1", IP: "1" }, displayUnits: { SI: "", IP: "" }, step: 0.05, decimals: 2 },
    defaultSi: 0.5,
    minSi: 0,
    maxSi: 1,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierSkyVaultViewFraction]: {
    id: PhysicalQuantityId.ModifierSkyVaultViewFraction,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Sky-vault view fraction",
    display: { units: { SI: "1", IP: "1" }, displayUnits: { SI: "", IP: "" }, step: 0.05, decimals: 2 },
    defaultSi: 0.5,
    minSi: 0,
    maxSi: 1,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.ModifierBodyExposureFraction]: {
    id: PhysicalQuantityId.ModifierBodyExposureFraction,
    scope: PhysicalQuantityScope.System,
    state: QuantityState.Slot,
    label: "Body surface exposed to sun",
    display: { units: { SI: "1", IP: "1" }, displayUnits: { SI: "", IP: "" }, step: 0.05, decimals: 2 },
    defaultSi: 0.25,
    minSi: 0,
    maxSi: 1,
    modifierId: ModifierQuantityOwner.SolarGain,
  },
  [PhysicalQuantityId.PhsBodyWeight]: {
    id: PhysicalQuantityId.PhsBodyWeight,
    scope: PhysicalQuantityScope.Model,
    state: QuantityState.Model,
    label: "Body weight",
    display: {
      units: { SI: "kg", IP: "lb" },
      displayUnits: { SI: "kg", IP: "lb" },
      step: 1,
      decimals: 0,
    },
    defaultSi: 75,
    minSi: 30,
    maxSi: 200,
    ownerModelId: ComfortModel.Phs2023,
  },
  [PhysicalQuantityId.PhsHeight]: {
    id: PhysicalQuantityId.PhsHeight,
    scope: PhysicalQuantityScope.Model,
    state: QuantityState.Model,
    label: "Body height",
    display: {
      units: { SI: "m", IP: "ft" },
      displayUnits: { SI: "m", IP: "ft" },
      step: 0.01,
      decimals: 2,
    },
    defaultSi: 1.8,
    minSi: 1.2,
    maxSi: 2.2,
    ownerModelId: ComfortModel.Phs2023,
  },
};

export function isPhysicalQuantityId(value: string): value is PhysicalQuantityId {
  return Object.values(PhysicalQuantityId).includes(value as PhysicalQuantityId);
}

export function resolveQuantityState(
  id: PhysicalQuantityId,
): QuantityState | undefined {
  return physicalQuantityMetaById[id].state;
}

export function createDefaultPrimaryInputState(): PrimaryInputState {
  return primaryInputOrder.reduce((accumulator, id) => {
    accumulator[id] = physicalQuantityMetaById[id].defaultSi;
    return accumulator;
  }, {} as PrimaryInputState);
}

export function getQuantityDisplayMeta(
  id: PhysicalQuantityId,
  unitSystem: UnitSystemType,
): { displayUnits: string; step: number; decimals: number } {
  const { display } = physicalQuantityMetaById[id];
  return {
    displayUnits: display.displayUnits[unitSystem],
    step: display.step,
    decimals: resolveDisplayDecimals(display.decimals, unitSystem),
  };
}

export function getQuantityPresentationMeta(
  id: PhysicalQuantityId,
  unitSystem: UnitSystemType,
): QuantityPresentationMeta {
  const meta = physicalQuantityMetaById[id];
  const display = getQuantityDisplayMeta(id, unitSystem);
  return {
    label: meta.label,
    displayUnits: display.displayUnits,
    step: display.step,
    decimals: display.decimals,
    minSi: meta.minSi,
    maxSi: meta.maxSi,
  };
}

export type QuantityPresentationMeta = {
  label: string;
  displayUnits: string;
  step: number;
  decimals: number;
  minSi: number;
  maxSi: number;
};

export const slotQuantityIdsForModifier = (
  modifierId: ModifierQuantityOwner,
): PhysicalQuantityId[] =>
  Object.values(physicalQuantityMetaById)
    .filter((meta) => meta.modifierId === modifierId)
    .map((meta) => meta.id);

export const derivedSlotQuantityIds = [
  PhysicalQuantityId.DewPoint,
  PhysicalQuantityId.DerivedHumidityRatio,
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

export function getPhysicalQuantityMeta(id: PhysicalQuantityId): PhysicalQuantityMeta {
  return physicalQuantityMetaById[id];
}
