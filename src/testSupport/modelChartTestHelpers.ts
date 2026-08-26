import type { PlotlyChartSpec } from "../services/plotlyTypes";
import type { InputId as InputIdType } from "../catalog/inputSlots";
import type { ChartBuildContext } from "../catalog/modelCapabilities";
import {
  FieldChartProfileKind,
  type FieldChartProfile,
} from "../catalog/output/fieldChartProfile";
import type { RuntimeComfortModelDefinition } from "../state/analysis/modelConfigs/definition";

export function chartContextToProfile(
  context: ChartBuildContext,
): FieldChartProfile {
  const { fieldChartConfig } = context;
  if (fieldChartConfig.profileKind === FieldChartProfileKind.Compliance) {
    return {
      kind: FieldChartProfileKind.Compliance,
      xField: fieldChartConfig.xField,
      yField: fieldChartConfig.yField,
      zOutput: fieldChartConfig.zOutput,
      bands: fieldChartConfig.bands,
    };
  }

  return {
    kind: FieldChartProfileKind.Explore,
    xField: fieldChartConfig.xField,
    yField: fieldChartConfig.yField,
    zOutput: fieldChartConfig.zOutput,
    bands: fieldChartConfig.bands,
  };
}

export function buildChartPlotly<TResult>(
  config: RuntimeComfortModelDefinition,
  instanceId: string,
  chartSource: unknown,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): PlotlyChartSpec | null {
  return config.buildChart(
    instanceId,
    chartSource,
    resultsByInput,
    chartContextToProfile(context),
    {
      unitSystem: context.unitSystem,
      baselineInputId: context.baselineInputId,
      chartSourceVersion: 1,
      modelInputs: context.modelInputs ?? {},
    },
  ).plotly;
}
