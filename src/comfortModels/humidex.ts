import { humidex } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import type { ModelChartSourceDto } from "../models/comfortDtos";
import { ModelId } from "../models/comfortModels";
import { InputControlId } from "../models/inputControls";
import {
  bandsFromThermalZones,
  ModelOutputKey,
  type ModelOutput,
} from "../models/modelCapabilities";
import { ChartKind } from "../models/output/chartKinds";
import { TableType } from "../models/output/tableLayouts";
import { WorkspaceId } from "../models/workspaces";
import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../models/physicalQuantities";
import { ThermalZone } from "../models/thermalZone";
import { ZoneToken } from "../models/zoneTokens";
import type { GridModelChartSpec } from "../services/comfort/charts/gridModelCharts";
import { requireThermalZone } from "../services/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../services/comfort/requestMapping";
import {
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  defineModel,
  parseEmptyOptions,
} from "../state/comfortTool/modelConfigs/builder";

const MODEL_LABEL = "Humidex";
const MODEL_DESCRIPTION =
  "Canadian index used to describe how hot the weather feels to the average person, by combining the effects of heat and humidity.";
const TDB_LIMITS = { min: 20, max: 50 };
const FIXED_CHART_INSTANCE_ID = "humidex-ranges";
const DYNAMIC_CHART_INSTANCE_ID = "humidex-dynamic-field";
const PSYCHROMETRIC_AXIS_FIELDS = [
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

export interface HumidexRequestDto {
  tdb: number;
  rh: number;
}

export interface HumidexResponseDto {
  humidex: number;
  humidexDiscomfort: string;
  source: CalculationSource;
}

export const humidexRequestAdapter = createFieldRequestAdapter<HumidexRequestDto>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  rh: PhysicalQuantityId.RelativeHumidity,
});

const humidexOutput: ModelOutput = {
  key: ModelOutputKey.Humidex,
  label: MODEL_LABEL,
  defaultBands: bandsFromThermalZones(humidexZonesList),
};

export function calculateHumidex(payload: HumidexRequestDto): HumidexResponseDto {
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
  GridModelChartSpec<HumidexRequestDto, HumidexResponseDto>,
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
  HumidexResponseDto,
  ModelChartSourceDto<HumidexRequestDto>
>({
  id: ModelId.Humidex,
  label: MODEL_LABEL,
  description: MODEL_DESCRIPTION,
  standardIds: [],
  workspaceCapabilities: [WorkspaceId.Explore],
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
  outputCharts: [
    {
      instanceId: FIXED_CHART_INSTANCE_ID,
      kind: ChartKind.DynamicField,
      name: "Psychrometric",
      emptyMessage: "No psychrometric chart yet.",
      capabilities: {
        allowsAxisSelection: false,
        locksYAxis: false,
        allowsOutputSelection: false,
        allowsBandEditing: false,
        allowsBaselineSelection: true,
        showsZoneToggle: false,
        showsLegend: true,
        showsExport: true,
      },
      spec: {
        title: `${MODEL_LABEL} Discomfort`,
        axisFields: [...PSYCHROMETRIC_AXIS_FIELDS],
        lockedAxes: {
          xField: PhysicalQuantityId.RelativeHumidity,
          yField: PhysicalQuantityId.DryBulbTemperature,
          xRangeSi: {
            min: getPhysicalQuantityMeta(PhysicalQuantityId.RelativeHumidity).minSi,
            max: getPhysicalQuantityMeta(PhysicalQuantityId.RelativeHumidity).maxSi,
          },
          yRangeSi: TDB_LIMITS,
        },
        resolveGridSpec: () => humidexGridSpec,
      },
    },
    {
      instanceId: DYNAMIC_CHART_INSTANCE_ID,
      kind: ChartKind.DynamicField,
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
        axisFields: [...PSYCHROMETRIC_AXIS_FIELDS],
        resolveGridSpec: () => humidexGridSpec,
      },
    },
  ],
  defaultChartInstanceId: FIXED_CHART_INSTANCE_ID,
  tables: {
    analysis: {
      type: TableType.Analysis,
      rows: [{
        id: "humidex",
        label: MODEL_LABEL,
        format: (result, unitSystem) => {
          const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.Humidex, unitSystem);
          const value = convertModelOutputFromSi(
            ModelOutputKey.Humidex,
            result.humidex,
            unitSystem,
          );
          const color = requireThermalZone(
            humidexZonesList,
            result.humidex,
            MODEL_LABEL,
          ).textColor;
          const cell = {
            text: formatDisplayValue(value, outputMeta.decimals),
            subtext: result.humidexDiscomfort,
            color,
          };
          if (outputMeta.displayUnits) {
            cell.text = `${cell.text} ${outputMeta.displayUnits}`;
          }
          return cell;
        },
      }],
    },
  },
  calculate: (context, visibleInputIds) =>
    calculatePerInput({
      context,
      visibleInputIds,
      mapRequest: humidexRequestAdapter.mapRequest,
      calculate: calculateHumidex,
    }),
  defaultDynamicAxes: {
    xAxis: PhysicalQuantityId.DryBulbTemperature,
    yAxis: PhysicalQuantityId.RelativeHumidity,
  },
  defaultOptions: {},
  parseOptions: parseEmptyOptions,
});
