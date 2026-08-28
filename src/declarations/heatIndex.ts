import { heat_index } from "jsthermalcomfort";
import { CalculationSource } from "../catalog/calculationMetadata";
import type { ModelChartSource } from "../catalog/chartSource";
import { ModelId } from "../catalog/modelIds";
import { InputControlId } from "../catalog/inputControls";
import {
  bandsFromThermalZones,
  ModelOutputKey,
  type ModelOutput,
} from "../catalog/modelCapabilities";
import { ChartType } from "../catalog/chartTypes";
import { TableType } from "../catalog/tableTypes";
import { WorkspaceId } from "../catalog/workspaces";
import { PhysicalQuantityId } from "../catalog/quantities";
import { ThermalZone } from "../catalog/thermalZone";
import { ZoneToken } from "../catalog/zoneTokens";
import { UnitSystem } from "../catalog/units";
import type { GridModelChartSpec } from "../engines/comfort/charts/gridModelCharts";
import { requireThermalZone } from "../engines/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../engines/comfort/requestMapping";
import {
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../engines/units";
import {
  defineModel,
  parseEmptyOptions,
} from "../state/analysis/modelConfigs/builder";

const MODEL_LABEL = "Heat Index";
const MODEL_DESCRIPTION =
  "Combines air temperature and relative humidity to determine the human-perceived equivalent temperature.";
const TDB_LIMITS = { min: 20, max: 50 };
const DYNAMIC_CHART_ID = "heat-index-dynamic-field";
const AXIS_FIELDS = [
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

export interface HeatIndexRequest {
  tdb: number;
  rh: number;
}

export interface HeatIndexResponse {
  hi: number;
  category: string;
  source: CalculationSource;
}

export const heatIndexRequestAdapter = createFieldRequestAdapter<HeatIndexRequest>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  rh: PhysicalQuantityId.RelativeHumidity,
});

const heatIndexOutput: ModelOutput = {
  key: ModelOutputKey.HeatIndex,
  label: MODEL_LABEL,
  defaultBands: bandsFromThermalZones(heatIndexZonesList),
};

export function calculateHeatIndex(payload: HeatIndexRequest): HeatIndexResponse {
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
  GridModelChartSpec<HeatIndexRequest, HeatIndexResponse>,
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
  HeatIndexResponse,
  ModelChartSource<HeatIndexRequest>
>({
  id: ModelId.HeatIndex,
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
  charts: [
    {
      id: DYNAMIC_CHART_ID,
      type: ChartType.Dynamic,
      emptyMessage: "No dynamic chart yet.",
      capabilities: {
        allowsAxisSelection: true,
        locksYAxis: false,
        allowsOutputSelection: true,
        allowsBandEditing: true,
        allowsBaselineSelection: true,
        showsLegend: true,
        showsExport: true,
      },
      spec: {
        title: `${MODEL_LABEL} Dynamic Chart`,
        axisFields: [...AXIS_FIELDS],
        resolveGridSpec: () => heatIndexGridSpec,
      },
    },
  ],
  defaultChartId: DYNAMIC_CHART_ID,
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
