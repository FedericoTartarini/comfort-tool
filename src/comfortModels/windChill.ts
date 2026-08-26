import { wc, wind_chill_temperature } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import type { ModelChartSource } from "../models/chartSource";
import { ModelId } from "../models/modelIds";
import { InputControlId } from "../models/inputControls";
import {
  bandsFromThermalZones,
  ModelOutputKey,
  type ModelOutput,
} from "../models/modelCapabilities";
import { ChartEngine } from "../models/output/chartKinds";
import { TableType } from "../models/output/tableLayouts";
import { WorkspaceId } from "../models/workspaces";
import { PhysicalQuantityId, getQuantityPresentationMeta } from "../models/physicalQuantities";
import { ThermalZone } from "../models/thermalZone";
import { ZoneToken } from "../models/zoneTokens";
import type { GridModelChartSpec } from "../services/comfort/charts/gridModelCharts";
import { requireThermalZone } from "../services/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../services/comfort/requestMapping";
import {
  convertFieldValueFromSi,
  convertMetersPerSecondToKilometersPerHour,
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  defineModel,
  parseEmptyOptions,
} from "../state/comfortTool/modelConfigs/builder";

const MODEL_LABEL = "Wind Chill";
const MODEL_DESCRIPTION =
  "Index that measures how cold it feels when wind is factored in with the actual air temperature.";
const TDB_LIMITS = { min: -45, max: 0 };
const WIND_LIMITS = { min: 1, max: 20 };
const DYNAMIC_CHART_ID = "wind-chill-dynamic-field";
const WIND_AXIS_FIELDS = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.WindSpeed,
] as const;

export const windChillZonesList = [
  new ThermalZone({ label: "Safe", max: 1400, token: ZoneToken.FrostbiteSafe }),
  new ThermalZone({ label: "30 mins to frostbite", min: 1400, max: 1600, token: ZoneToken.Frostbite30Min }),
  new ThermalZone({ label: "10 mins to frostbite", min: 1600, max: 2300, token: ZoneToken.Frostbite10Min }),
  new ThermalZone({ label: "2 mins to frostbite", min: 2300, token: ZoneToken.Frostbite2Min }),
];

export interface WindChillRequest {
  tdb: number;
  v: number;
}

export interface WindChillResponse {
  wci: number;
  wciTemp: number;
  wciZone: string;
  source: CalculationSource;
}

export const windChillRequestAdapter = createFieldRequestAdapter<WindChillRequest>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  v: PhysicalQuantityId.WindSpeed,
});

const windChillOutput: ModelOutput = {
  key: ModelOutputKey.WindChill,
  label: "Wind Chill Index",
  defaultBands: bandsFromThermalZones(windChillZonesList),
};

function getWindChillColor(result: WindChillResponse): string | undefined {
  return requireThermalZone(windChillZonesList, result.wci, MODEL_LABEL).textColor;
}

export function calculateWindChill(payload: WindChillRequest): WindChillResponse {
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

const windChillGridSpec: Omit<
  GridModelChartSpec<WindChillRequest, WindChillResponse>,
  "instanceId" | "dynamicTitle"
> = {
  output: windChillOutput,
  bandLabel: "Frostbite Risk",
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
  axisRanges: {
    [PhysicalQuantityId.DryBulbTemperature]: TDB_LIMITS,
    [PhysicalQuantityId.WindSpeed]: WIND_LIMITS,
  },
  requestAdapter: windChillRequestAdapter,
  evaluate: calculateWindChill,
  getOutputValue: (result) => result.wci,
};

export const windChillModelConfig = defineModel<
  WindChillResponse,
  ModelChartSource<WindChillRequest>
>({
  id: ModelId.WindChill,
  label: MODEL_LABEL,
  description: MODEL_DESCRIPTION,
  standardIds: [],
  workspaceCapabilities: [WorkspaceId.Explore],
  exploreOutputs: [windChillOutput],
  modifiers: [],
  inputFields: [
    {
      kind: "numeric",
      controlId: InputControlId.Temperature,
      fieldKey: PhysicalQuantityId.DryBulbTemperature,
      minValue: TDB_LIMITS.min,
      maxValue: TDB_LIMITS.max,
    },
    {
      kind: "outdoorWindSpeed",
      minValue: WIND_LIMITS.min,
      maxValue: WIND_LIMITS.max,
    },
  ],
  charts: [
    {
      id: DYNAMIC_CHART_ID,
      engine: ChartEngine.DynamicField,
      name: "Dynamic",
      emptyMessage: "No dynamic chart yet.",
      capabilities: {
        allowsAxisSelection: true,
        locksYAxis: true,
        allowsOutputSelection: true,
        allowsBandEditing: true,
        allowsBaselineSelection: true,
        showsZoneToggle: false,
        showsLegend: true,
        showsExport: true,
      },
      spec: {
        title: `${MODEL_LABEL} Dynamic Chart`,
        axisFields: [...WIND_AXIS_FIELDS],
        resolveGridSpec: () => windChillGridSpec,
      },
    },
  ],
  defaultChartId: DYNAMIC_CHART_ID,
  tables: {
    analysis: {
      type: TableType.Analysis,
      rows: [
        {
          id: "wind-chill-index",
          label: `${MODEL_LABEL} Index`,
          format: (result, unitSystem) => {
            const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.WindChill, unitSystem);
            const value = convertModelOutputFromSi(
              ModelOutputKey.WindChill,
              result.wci,
              unitSystem,
            );
            return {
              text: `${formatDisplayValue(value, outputMeta.decimals)} ${outputMeta.displayUnits}`,
              subtext: result.wciZone,
              color: getWindChillColor(result),
            };
          },
        },
        {
          id: "wind-chill-temperature",
          label: `${MODEL_LABEL} Temperature`,
          format: (result, unitSystem) => {
            const temperatureUnits = getQuantityPresentationMeta(
              PhysicalQuantityId.DryBulbTemperature,
              unitSystem,
            ).displayUnits;
            const value = convertFieldValueFromSi(
              PhysicalQuantityId.DryBulbTemperature,
              result.wciTemp,
              unitSystem,
            );
            return {
              text: `${formatDisplayValue(value, 1)} ${temperatureUnits}`,
              color: getWindChillColor(result),
            };
          },
        },
      ],
    },
  },
  calculate: (context, visibleInputIds) =>
    calculatePerInput({
      context,
      visibleInputIds,
      mapRequest: windChillRequestAdapter.mapRequest,
      calculate: calculateWindChill,
    }),
  dynamicAxisFields: [...WIND_AXIS_FIELDS],
  defaultDynamicAxes: {
    xAxis: PhysicalQuantityId.DryBulbTemperature,
    yAxis: PhysicalQuantityId.WindSpeed,
  },
  defaultOptions: {},
  parseOptions: parseEmptyOptions,
});
