import { ModelOutputKey, type ModelOutputKey as ModelOutputKeyType } from "../../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { convertTemperatureFromSi, convertTemperatureToSi } from "./temperature";
import {
  convertHeatFluxFromSi,
  convertHeatFluxToSi,
  convertMassFromSi,
  convertMassToSi,
} from "./physicalQuantities";

export interface ModelOutputDisplayMeta {
  displayUnits: string;
  step: number;
  decimals: number;
}

interface ModelOutputPresentation {
  metaByUnitSystem: Record<UnitSystemType, ModelOutputDisplayMeta>;
  fromSi: (value: number, unitSystem: UnitSystemType) => number;
  toSi: (value: number, unitSystem: UnitSystemType) => number;
}

function identity(value: number): number {
  return value;
}

function identityPresentation(
  displayUnits: string,
  step: number,
  decimals: number,
): ModelOutputPresentation {
  const meta = { displayUnits, step, decimals };
  return {
    metaByUnitSystem: {
      [UnitSystem.SI]: meta,
      [UnitSystem.IP]: meta,
    },
    fromSi: identity,
    toSi: identity,
  };
}

function temperaturePresentation(): ModelOutputPresentation {
  return {
    metaByUnitSystem: {
      [UnitSystem.SI]: { displayUnits: "°C", step: 0.5, decimals: 1 },
      [UnitSystem.IP]: { displayUnits: "°F", step: 1, decimals: 1 },
    },
    fromSi: (value, unitSystem) => (
      unitSystem === UnitSystem.IP ? convertTemperatureFromSi(value) : value
    ),
    toSi: (value, unitSystem) => (
      unitSystem === UnitSystem.IP ? convertTemperatureToSi(value) : value
    ),
  };
}

function exposureTimePresentation(): ModelOutputPresentation {
  return {
    metaByUnitSystem: {
      [UnitSystem.SI]: { displayUnits: "h", step: 0.25, decimals: 2 },
      [UnitSystem.IP]: { displayUnits: "h", step: 0.25, decimals: 2 },
    },
    fromSi: (value) => value / 60,
    toSi: (value) => value * 60,
  };
}

function waterLossPresentation(): ModelOutputPresentation {
  return {
    metaByUnitSystem: {
      [UnitSystem.SI]: { displayUnits: "kg", step: 0.1, decimals: 2 },
      [UnitSystem.IP]: { displayUnits: "lb", step: 0.25, decimals: 2 },
    },
    fromSi: (value, unitSystem) => (
      unitSystem === UnitSystem.IP ? convertMassFromSi(value) : value / 1000
    ),
    toSi: (value, unitSystem) => (
      unitSystem === UnitSystem.IP ? convertMassToSi(value) : value * 1000
    ),
  };
}

const presentationByOutput: Record<ModelOutputKeyType, ModelOutputPresentation> = {
  [ModelOutputKey.Pmv]: identityPresentation("", 0.1, 1),
  [ModelOutputKey.Ppd]: identityPresentation("%", 1, 0),
  [ModelOutputKey.Utci]: temperaturePresentation(),
  [ModelOutputKey.HeatIndex]: temperaturePresentation(),
  [ModelOutputKey.Humidex]: identityPresentation("", 1, 1),
  [ModelOutputKey.WindChill]: {
    metaByUnitSystem: {
      [UnitSystem.SI]: { displayUnits: "W/m²", step: 10, decimals: 0 },
      [UnitSystem.IP]: { displayUnits: "BTU/(h·ft²)", step: 1, decimals: 0 },
    },
    fromSi: (value, unitSystem) => (
      unitSystem === UnitSystem.IP ? convertHeatFluxFromSi(value) : value
    ),
    toSi: (value, unitSystem) => (
      unitSystem === UnitSystem.IP ? convertHeatFluxToSi(value) : value
    ),
  },
  [ModelOutputKey.OperativeTemperature]: temperaturePresentation(),
  [ModelOutputKey.PhsLimitingExposureTime]: exposureTimePresentation(),
  [ModelOutputKey.PhsRectalTemperature]: temperaturePresentation(),
  [ModelOutputKey.PhsWaterLoss]: waterLossPresentation(),
};

export function getModelOutputDisplayMeta(
  outputKey: ModelOutputKeyType,
  unitSystem: UnitSystemType,
): ModelOutputDisplayMeta {
  return presentationByOutput[outputKey].metaByUnitSystem[unitSystem];
}

export function convertModelOutputFromSi(
  outputKey: ModelOutputKeyType,
  valueSi: number,
  unitSystem: UnitSystemType,
): number {
  if (!Number.isFinite(valueSi)) {
    return valueSi;
  }
  return presentationByOutput[outputKey].fromSi(valueSi, unitSystem);
}

export function convertModelOutputToSi(
  outputKey: ModelOutputKeyType,
  displayValue: number,
  unitSystem: UnitSystemType,
): number {
  if (!Number.isFinite(displayValue)) {
    return displayValue;
  }
  return presentationByOutput[outputKey].toSi(displayValue, unitSystem);
}
