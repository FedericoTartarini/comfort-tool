import { heat_index } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import type { ModelChartSourceDto } from "../models/comfortDtos";
import { ComfortModel } from "../models/comfortModels";
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
import { UnitSystem } from "../models/units";
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

const MODEL_LABEL = "Heat Index";
const MODEL_DESCRIPTION =
  "Combines air temperature and relative humidity to determine the human-perceived equivalent temperature.";
const TDB_LIMITS = { min: 20, max: 50 };
const FIXED_CHART_INSTANCE_ID = "heat-index-ranges";
const DYNAMIC_CHART_INSTANCE_ID = "heat-index-dynamic-field";
const PSYCHROMETRIC_AXIS_FIELDS = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.RelativeHumidity,
] as const;

export const heatIndexZonesList = [
  new ThermalZone({ label: "Safe", max: 27, token: ZoneToken.Safe }),
  new ThermalZone({ label: "Caution", min: 27, max: 32, token: ZoneToken.Caution }),
  new ThermalZone({ label: "Extreme Caution", min: 32, max: 39, token: ZoneToken.StrongCaution }),
  new ThermalZone({ label: "Danger", min: 39, max: 51, token: ZoneToken.Danger }),
  new ThermalZone({ label: "Extreme Danger", min: 51, token: ZoneToken.ExtremeDanger }),
];

const heatIndexCautionZone: ThermalZone = (() => {
  const zone = heatIndexZonesList.find(({ label }) => label === "Caution");
  if (!zone) throw new Error("Heat Index requires a Caution zone.");
  return zone;
})();

export interface HeatIndexRequestDto {
  tdb: number;
  rh: number;
}

export interface HeatIndexResponseDto {
  hi: number;
  category: string;
  source: CalculationSource;
}

export const heatIndexRequestAdapter = createFieldRequestAdapter<HeatIndexRequestDto>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  rh: PhysicalQuantityId.RelativeHumidity,
});

const heatIndexOutput: ModelOutput = {
  key: ModelOutputKey.HeatIndex,
  label: MODEL_LABEL,
  defaultBands: bandsFromThermalZones(heatIndexZonesList),
};

export function calculateHeatIndex(payload: HeatIndexRequestDto): HeatIndexResponseDto {
  const result = heat_index(payload.tdb, payload.rh, {
    units: UnitSystem.SI,
    round: true,
  });
  const hi = Number.isFinite(result.hi)
    ? result.hi
    : payload.tdb < heatIndexCautionZone.min
      ? payload.tdb
      : result.hi;
  const category = requireThermalZone(heatIndexZonesList, hi, MODEL_LABEL).label;

  return { hi, category, source: CalculationSource.JsThermalComfort };
}

const heatIndexGridSpec: Omit<
  GridModelChartSpec<HeatIndexRequestDto, HeatIndexResponseDto>,
  "instanceId" | "dynamicTitle"
> = {
  output: heatIndexOutput,
  axisRanges: {
    [PhysicalQuantityId.DryBulbTemperature]: TDB_LIMITS,
  },
  requestAdapter: heatIndexRequestAdapter,
  evaluate: calculateHeatIndex,
  getOutputValue: (result) => result.hi,
};

export const heatIndexModelConfig = defineModel<
  HeatIndexResponseDto,
  ModelChartSourceDto<HeatIndexRequestDto>
>({
  id: ComfortModel.HeatIndex,
  label: MODEL_LABEL,
  description: MODEL_DESCRIPTION,
  standardIds: [],
  workspaceCapabilities: [WorkspaceId.Explore],
  exploreOutputs: [heatIndexOutput],
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
        title: `${MODEL_LABEL} Ranges`,
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
        resolveGridSpec: () => heatIndexGridSpec,
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
        resolveGridSpec: () => heatIndexGridSpec,
      },
    },
  ],
  defaultChartInstanceId: FIXED_CHART_INSTANCE_ID,
  tables: {
    analysis: {
      type: TableType.Analysis,
      rows: [{
        id: "heat-index",
        label: MODEL_LABEL,
        format: (result, unitSystem) => {
          const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.HeatIndex, unitSystem);
          const value = convertModelOutputFromSi(
            ModelOutputKey.HeatIndex,
            result.hi,
            unitSystem,
          );
          const color = requireThermalZone(
            heatIndexZonesList,
            result.hi,
            MODEL_LABEL,
          ).textColor;
          const cell = {
            text: formatDisplayValue(value, outputMeta.decimals),
            subtext: result.category,
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
      mapRequest: heatIndexRequestAdapter.mapRequest,
      calculate: calculateHeatIndex,
    }),
  defaultDynamicAxes: {
    xAxis: PhysicalQuantityId.DryBulbTemperature,
    yAxis: PhysicalQuantityId.RelativeHumidity,
  },
  defaultOptions: {},
  parseOptions: parseEmptyOptions,
});
