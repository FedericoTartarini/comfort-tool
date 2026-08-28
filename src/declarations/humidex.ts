import { humidex } from "jsthermalcomfort";
import { PhysicalQuantityId } from "../catalog/quantities";
import { CalculationSource } from "../catalog/calculationMetadata";
import type { ModelChartSource } from "../catalog/chartSource";
import { ModelId } from "../catalog/modelIds";
import { InputControlId } from "../catalog/inputControls";
import { bandsFromThermalZones, type ModelOutput } from "../catalog/modelCapabilities";
import { ChartType } from "../catalog/chartTypes";
import { SurfaceId } from "../catalog/surfaces";
import { ThermalZone } from "../catalog/thermalZone";
import { ZoneToken } from "../catalog/zoneTokens";
import type { GridModelChartSpec } from "../engines/comfort/charts/gridModelCharts";
import { requireThermalZone } from "../engines/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../engines/comfort/requestMapping";
import {
  defineModel,
  parseEmptyOptions,
} from "../state/analysis/modelConfigs/builder";

const MODEL_LABEL = "Humidex";
const MODEL_DESCRIPTION =
  "Canadian index used to describe how hot the weather feels to the average person, by combining the effects of heat and humidity.";
const TDB_LIMITS = { min: 20, max: 50 };
const DYNAMIC_CHART_ID = "humidex-dynamic-field";
const AXIS_FIELDS = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.RelativeHumidity,
] as const;

export const humidexZonesList = [
  new ThermalZone({ label: "Little/None", max: 30, token: ZoneToken.Safe }),
  new ThermalZone({ label: "Noticeable", min: 30, max: 35, token: ZoneToken.Caution }),
  new ThermalZone({ label: "Evident", min: 35, max: 40, token: ZoneToken.StrongCaution }),
  new ThermalZone({ label: "Intense", min: 40, max: 45, token: ZoneToken.Intense }),
  new ThermalZone({ label: "Dangerous", min: 45, max: 54, token: ZoneToken.Danger }),
  new ThermalZone({ label: "Stroke Probable", min: 54, token: ZoneToken.ExtremeDanger }),
];

export interface HumidexRequest {
  tdb: number;
  rh: number;
}

export interface HumidexResponse {
  humidex: number;
  humidexDiscomfort: string;
  source: CalculationSource;
}

export const humidexRequestAdapter = createFieldRequestAdapter<HumidexRequest>({ tdb: PhysicalQuantityId.DryBulbTemperature, rh: PhysicalQuantityId.RelativeHumidity });

const humidexOutput: ModelOutput = {
  key: PhysicalQuantityId.Humidex,
  label: MODEL_LABEL,
  defaultBands: bandsFromThermalZones(humidexZonesList),
};

export function calculateHumidex(payload: HumidexRequest): HumidexResponse {
  const value = humidex(payload.tdb, payload.rh, { round: true }).humidex;
  const humidexDiscomfort = requireThermalZone(
    humidexZonesList,
    value,
    MODEL_LABEL,
  ).label;

  return {
    humidex: value,
    humidexDiscomfort,
    source: CalculationSource.JsThermalComfort,
  };
}

const humidexGridSpec: Omit<
  GridModelChartSpec<HumidexRequest, HumidexResponse>,
  "instanceId" | "dynamicTitle"
> = {
  output: humidexOutput,
  axisRanges: {
    [PhysicalQuantityId.DryBulbTemperature]: TDB_LIMITS,
  },
  requestAdapter: humidexRequestAdapter,
  evaluate: calculateHumidex,
  getOutputValue: (result) => result.humidex,
};

export const humidexModelConfig = defineModel<
  HumidexResponse,
  ModelChartSource<HumidexRequest>
>({
  id: ModelId.Humidex,
  label: MODEL_LABEL,
  description: MODEL_DESCRIPTION,
  standardIds: [],
  workspaceCapabilities: [SurfaceId.Explore],
  exploreOutputs: [humidexOutput],
  modifiers: [],
  inputFields: [
    {
      kind: "numeric",
      controlId: InputControlId.Temperature,
      fieldKey: PhysicalQuantityId.DryBulbTemperature,
      minValue: TDB_LIMITS.min,
      maxValue: TDB_LIMITS.max,
    },
    { kind: "simpleHumidity" },
  ],
  charts: [
    {
      id: DYNAMIC_CHART_ID,
      type: ChartType.Dynamic,
      emptyMessage: "No dynamic chart yet.",
      spec: {
        title: `${MODEL_LABEL} Dynamic Chart`,
        axisFields: [...AXIS_FIELDS],
        resolveGridSpec: () => humidexGridSpec,
      },
    },
  ],
  defaultChartId: DYNAMIC_CHART_ID,
  tables: {
    results: [
      {
        quantity: PhysicalQuantityId.Humidex,
        label: MODEL_LABEL,
        subtext: (result) => result.humidexDiscomfort,
        color: (result) => requireThermalZone(
          humidexZonesList,
          result.humidex,
          MODEL_LABEL,
        ).textColor,
      },
    ],
  },
  calculate: (context, visibleInputIds) =>
    calculatePerInput({
      context,
      visibleInputIds,
      mapRequest: humidexRequestAdapter.mapRequest,
      calculate: calculateHumidex,
    }),
  defaultDynamicAxes: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity },
  defaultOptions: {},
  parseOptions: parseEmptyOptions,
});
