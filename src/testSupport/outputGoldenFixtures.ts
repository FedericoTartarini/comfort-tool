import { type ModelId as ModelIdType } from "../catalog/modelIds";
import type { ChartPayload } from "../charts/types";
import { assembleChart } from "../charts";
import { InputId } from "../catalog/inputSlots";
import { UnitSystem } from "../catalog/units";
import { FieldChartProfileKind } from "../catalog/output/fieldChartProfile";
import {
  WorkspaceId,
  supportsExploreWorkspace,
  supportsStandardWorkspace,
} from "../catalog/workspaces";
import {
  buildFieldChartProfile,
  seedModelOutputSettings,
} from "../state/analysis/fieldChartState";
import { comfortModelConfigs, comfortModelOrder } from "../state/analysis/modelConfigs";
import type { ResultSectionViewModel } from "../state/analysis/types";
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
  chart: ChartPayload | null,
  instanceId: string,
  profileKind: typeof FieldChartProfileKind.Compliance | typeof FieldChartProfileKind.Explore,
): ChartGoldenSnapshot | null {
  if (!chart) return null;
  const assembled = assembleChart(chart);
  return {
    instanceId,
    profileKind,
    traceCount: assembled.data.length,
    traceNames: assembled.data.map((trace) => String(trace.name ?? "")),
    layoutTitle: chart.input.title ?? "",
    xAxisTitle: chart.input.xAxis.title,
    yAxisTitle: chart.input.yAxis.title,
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
      const snapshot = serializeChart(buildResult.payload, chartInstance.instanceId, mode);
      if (snapshot) charts.push(snapshot);
    }
  }

  return { modelId, table, charts };
}

export function buildAllModelOutputGoldenSnapshots(): ModelOutputGoldenSnapshot[] {
  return comfortModelOrder.map((modelId) => buildModelOutputGoldenSnapshot(modelId));
}
