import type { ChartPayload } from "../charts/types";
import { assembleChart } from "../charts";
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

export function buildChartResult<TResult>(
  config: RuntimeComfortModelDefinition,
  instanceId: string,
  chartSource: unknown,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
) {
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
  );
}

export function buildChartPayload<TResult>(
  config: RuntimeComfortModelDefinition,
  instanceId: string,
  chartSource: unknown,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
): ChartPayload | null {
  return buildChartResult(
    config,
    instanceId,
    chartSource,
    resultsByInput,
    context,
  ).payload;
}

export type ChartFigure = {
  traces: Array<
    Record<string, unknown> & {
      name?: string;
      type?: string;
      mode?: string;
      x?: number[];
      y?: number[];
      z?: (number | null)[][];
      fill?: string;
      fillcolor?: string;
      line?: { color?: string; width?: number };
      hoverinfo?: string;
      hovertemplate?: string;
      customdata?: unknown[] | unknown[][];
      hoverongaps?: boolean;
      colorscale?: Array<[number, string]>;
      contours?: {
        type?: string;
        operation?: string;
        coloring?: string;
        value?: number | [number, number];
      };
      visible?: true | "legendonly";
      yaxis?: string;
      text?: string[][] | string[];
    }
  >;
  layout: {
    title: string;
    height?: number;
    plot_bgcolor?: string;
    paper_bgcolor?: string;
    showlegend?: boolean;
    xaxis: { title: string; range: [number, number]; dtick?: number };
    yaxis: { title: string; range: [number, number]; dtick?: number };
    yaxis2?: {
      title: string;
      range: [number, number];
      overlaying?: string;
      side?: string;
    };
    annotations: Array<{ x: number; y: number; text: string }>;
  };
  payload: ChartPayload;
};

export function chartFigure(
  payload: ChartPayload | null | undefined,
): ChartFigure | null {
  if (!payload) return null;
  const assembled = assembleChart(payload);
  return {
    traces: assembled.data as ChartFigure["traces"],
    layout: {
      title: payload.input.title ?? "",
      height: payload.input.height,
      plot_bgcolor: payload.input.plotBgColor,
      paper_bgcolor: payload.input.paperBgColor,
      showlegend: payload.input.showlegend,
      xaxis: {
        title: payload.input.xAxis.title,
        range: payload.input.xAxis.range,
        ...(payload.input.xAxis.dtick !== undefined
          ? { dtick: payload.input.xAxis.dtick }
          : {}),
      },
      yaxis: {
        title: payload.input.yAxis.title,
        range: payload.input.yAxis.range,
        ...(payload.input.yAxis.dtick !== undefined
          ? { dtick: payload.input.yAxis.dtick }
          : {}),
      },
      ...(payload.input.yAxis2
        ? {
            yaxis2: {
              title: payload.input.yAxis2.title,
              range: payload.input.yAxis2.range,
              overlaying: payload.input.yAxis2.overlaying,
              side: payload.input.yAxis2.side,
            },
          }
        : {}),
      annotations: (payload.input.annotations ?? []).map((annotation) => ({
        x: annotation.x,
        y: annotation.y,
        text: annotation.text,
      })),
    },
    payload,
  };
}

export function buildChartPlotly<TResult>(
  config: RuntimeComfortModelDefinition,
  instanceId: string,
  chartSource: unknown,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
) {
  const result = buildChartResult(
    config,
    instanceId,
    chartSource,
    resultsByInput,
    context,
  );
  return chartFigure(result.payload);
}
