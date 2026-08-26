import { type ModelId as ModelIdType } from "../models/modelIds";
import type { PlotlyChartSpec } from "../services/plotlyTypes";
import { InputId } from "../models/inputSlots";
import { UnitSystem } from "../models/units";
import { FieldChartProfileKind } from "../models/output/fieldChartProfile";
import {
  WorkspaceId,
  supportsExploreWorkspace,
  supportsStandardWorkspace,
} from "../models/workspaces";
import {
  buildFieldChartProfile,
  seedModelOutputSettings,
} from "../state/comfortTool/fieldChartState";
import { comfortModelConfigs, comfortModelOrder } from "../state/comfortTool/modelConfigs";
import type { ResultSectionViewModel } from "../state/comfortTool/types";
import {
  createGoldenCalculationContext,
  getGoldenInputOverrides,
  getGoldenModelInputOverrides,
} from "./goldenFixtures";

const visibleInputIds = [InputId.Input1];

export interface TableGoldenSnapshot {
  sections: Array<{
    title: string;
    group?: string;
    cells: Array<{
      text: string;
      subtext?: string;
      color?: string;
    } | null>;
  }>;
}

export interface ChartGoldenSnapshot {
  instanceId: string;
  profileKind: typeof FieldChartProfileKind.Compliance | typeof FieldChartProfileKind.Explore;
  traceCount: number;
  traceNames: string[];
  layoutTitle: string;
  xAxisTitle: string;
  yAxisTitle: string;
}

export interface ModelOutputGoldenSnapshot {
  modelId: ModelIdType;
  table: TableGoldenSnapshot;
  charts: ChartGoldenSnapshot[];
}

function serializeTable(sections: ResultSectionViewModel[]): TableGoldenSnapshot {
  return {
    sections: sections.map((section) => ({
      title: section.title,
      ...(section.group ? { group: section.group } : {}),
      cells: visibleInputIds.map((inputId) => {
        const cell = section.valuesByInput[inputId];
        return cell
          ? {
              text: cell.text,
              ...(cell.subtext ? { subtext: cell.subtext } : {}),
              ...(cell.color ? { color: cell.color } : {}),
            }
          : null;
      }),
    })),
  };
}

function serializeChart(
  chart: PlotlyChartSpec | null,
  instanceId: string,
  profileKind: typeof FieldChartProfileKind.Compliance | typeof FieldChartProfileKind.Explore,
): ChartGoldenSnapshot | null {
  if (!chart) return null;
  return {
    instanceId,
    profileKind,
    traceCount: chart.traces.length,
    traceNames: chart.traces
      .filter((trace) => !trace.isBackgroundZone)
      .map((trace) => trace.name),
    layoutTitle: chart.layout.title,
    xAxisTitle: String(chart.layout.xaxis.title ?? ""),
    yAxisTitle: String(chart.layout.yaxis.title ?? ""),
  };
}

export function buildModelOutputGoldenSnapshot(
  modelId: ModelIdType,
): ModelOutputGoldenSnapshot {
  const config = comfortModelConfigs[modelId];
  const context = createGoldenCalculationContext(
    modelId,
    getGoldenInputOverrides(modelId),
    getGoldenModelInputOverrides(modelId),
  );
  const { resultsByInput, chartSource } = config.calculate(context, visibleInputIds);
  const table = serializeTable(
    config.buildTable(resultsByInput, visibleInputIds, UnitSystem.SI),
  );

  const charts: ChartGoldenSnapshot[] = [];
  const baseSettings = seedModelOutputSettings(config);
  const workspaces = [
  supportsStandardWorkspace(config.workspaceCapabilities) ? WorkspaceId.Standard : null,
  supportsExploreWorkspace(config.workspaceCapabilities) ? WorkspaceId.Explore : null,
  ].filter((workspace) => workspace !== null);

  for (const chartInstance of config.chartInstances.entries) {
    for (const workspace of workspaces) {
      const mode = workspace === WorkspaceId.Explore ? FieldChartProfileKind.Explore : FieldChartProfileKind.Compliance;
      const profile = buildFieldChartProfile(config, baseSettings, workspace);
      const buildResult = config.buildChart(
        chartInstance.instanceId,
        chartSource,
        resultsByInput,
        profile,
        {
          unitSystem: UnitSystem.SI,
          baselineInputId: InputId.Input1,
          chartSourceVersion: 1,
          modelInputs: context.modelInputs,
        },
      );
      const snapshot = serializeChart(buildResult.plotly, chartInstance.instanceId, mode);
      if (snapshot) charts.push(snapshot);
    }
  }

  return { modelId, table, charts };
}

export function buildAllModelOutputGoldenSnapshots(): ModelOutputGoldenSnapshot[] {
  return comfortModelOrder.map((modelId) => buildModelOutputGoldenSnapshot(modelId));
}
