import { wc, wind_chill_temperature } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import { ComfortModel } from "../models/comfortModels";
import { PhysicalQuantityId, getQuantityPresentationMeta } from "../models/physicalQuantities";
import { ModelOutputKey } from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import type { UnitSystem as UnitSystemType } from "../models/units";
import { requireThermalZone } from "../services/comfort/helpers";
import {
  convertFieldValueFromSi,
  convertMetersPerSecondToKilometersPerHour,
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import type { ResultRowDefinition } from "../state/comfortTool/modelConfigs/builder";
import {
  buildOutdoorWindIndexModelConfig,
  type OutdoorWindIndexRequestDto,
} from "./presets/outdoorWindIndexModel";

const MODEL_LABEL = "Wind Chill";
const MODEL_DESCRIPTION =
  "Index that measures how cold it feels when wind is factored in with the actual air temperature.";
const TDB_LIMITS = { min: -45, max: 0 };
const WIND_LIMITS = { min: 1, max: 20 };

export const windChillZonesList = [
  new ThermalZone({ label: "Safe", max: 1400, color: "#e0f2fe", textColor: "#0369a1" }),
  new ThermalZone({ label: "30 mins to frostbite", min: 1400, max: 1600, color: "#64b5f5", textColor: "#1d4ed8" }),
  new ThermalZone({ label: "10 mins to frostbite", min: 1600, max: 2300, color: "#5c6bc0", textColor: "#3730a3" }),
  new ThermalZone({ label: "2 mins to frostbite", min: 2300, color: "#8e24aa", textColor: "#6b21a8" }),
];

export type WindChillRequestDto = OutdoorWindIndexRequestDto;

export interface WindChillResponseDto {
  wci: number;
  wciTemp: number;
  wciZone: string;
  source: CalculationSource;
}

export function calculateWindChill(payload: WindChillRequestDto): WindChillResponseDto {
  const wci = wc(payload.tdb, payload.v).wci;
  const wciTemp = payload.v > 1.33 && payload.tdb <= 10
    ? wind_chill_temperature(
        payload.tdb,
        convertMetersPerSecondToKilometersPerHour(payload.v),
      ).wct
    : payload.tdb;
  const wciZone = requireThermalZone(windChillZonesList, wci, MODEL_LABEL).label;

  return {
    wci,
    wciTemp,
    wciZone,
    source: CalculationSource.JsThermalComfort,
  };
}

function buildWindChillResultRows(
  unitSystem: UnitSystemType,
): ResultRowDefinition<WindChillResponseDto>[] {
  const temperatureUnits = getQuantityPresentationMeta(
    PhysicalQuantityId.DryBulbTemperature,
    unitSystem,
  ).displayUnits;
  const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.WindChill, unitSystem);
  const getColor = (result: WindChillResponseDto) =>
    requireThermalZone(windChillZonesList, result.wci, MODEL_LABEL).textColor;

  return [
    {
      title: `${MODEL_LABEL} Index`,
      formatter: (result) => {
        const value = convertModelOutputFromSi(ModelOutputKey.WindChill, result.wci, unitSystem);
        return {
          text: `${formatDisplayValue(value, outputMeta.decimals)} ${outputMeta.displayUnits}`,
          subtext: result.wciZone,
          color: getColor(result),
        };
      },
    },
    {
      title: `${MODEL_LABEL} Temperature`,
      formatter: (result) => {
        const value = convertFieldValueFromSi(
          PhysicalQuantityId.DryBulbTemperature,
          result.wciTemp,
          unitSystem,
        );
        return {
          text: `${formatDisplayValue(value, 1)} ${temperatureUnits}`,
          color: getColor(result),
        };
      },
    },
  ];
}

export const windChillModelConfig = buildOutdoorWindIndexModelConfig<WindChillResponseDto>({
  comfortModel: ComfortModel.WindChill,
  label: MODEL_LABEL,
  description: MODEL_DESCRIPTION,
  outputKey: ModelOutputKey.WindChill,
  outputLabel: "Wind Chill Index",
  zones: windChillZonesList,
  tdbLimits: TDB_LIMITS,
  windLimits: WIND_LIMITS,
  dynamicChartInstanceId: "wind-chill-dynamic-field",
  dynamicTitle: `${MODEL_LABEL} Dynamic Chart`,
  bandLabel: "Frostbite Risk",
  calculate: calculateWindChill,
  getOutputValue: (result) => result.wci,
  resultRows: (unitSystem) => buildWindChillResultRows(unitSystem),
  dynamicHoverExtension: {
    getTemplateSuffix: (unitSystem) => {
      const units = getQuantityPresentationMeta(
        PhysicalQuantityId.DryBulbTemperature,
        unitSystem,
      ).displayUnits;
      return `<br>${MODEL_LABEL} Temperature: %{customdata[1]:.1f} ${units}`;
    },
    getMetadata: (result, unitSystem) => [
      result == null
        ? ""
        : convertFieldValueFromSi(
            PhysicalQuantityId.DryBulbTemperature,
            result.wciTemp,
            unitSystem,
          ),
    ],
  },
});
