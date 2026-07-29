import { ModelOutputKey, type ModelOutputKey as ModelOutputKeyType } from "../../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { convertTemperatureFromSi, convertTemperatureToSi } from "./temperature";

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

// 1 W/m² = 0.316998 BTU/(h·ft²).
const WCI_TO_IP_FACTOR = 0.316998;

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
      unitSystem === UnitSystem.IP ? value * WCI_TO_IP_FACTOR : value
    ),
    toSi: (value, unitSystem) => (
      unitSystem === UnitSystem.IP ? value / WCI_TO_IP_FACTOR : value
    ),
  },
  [ModelOutputKey.OperativeTemperature]: temperaturePresentation(),
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
