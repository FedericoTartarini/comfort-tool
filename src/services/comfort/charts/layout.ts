import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import { buildAxisValues, formatAxisTitle } from "./axis";
import type { ChartResponseSpec } from "./types";

export function buildChartResponse({
  traces,
  layout,
  annotations = [],
  source,
}: ChartResponseSpec): PlotlyChartResponseDto {
  const xValues = buildAxisValues(layout.xAxis);
  const yValues = buildAxisValues(layout.yAxis);
  const plotLayout = {
    title: layout.title,
    paper_bgcolor: layout.paperBgColor,
    plot_bgcolor: layout.plotBgColor,
    showlegend: layout.showLegend,
    margin: layout.margin,
    xaxis: {
      title: formatAxisTitle(layout.xAxis),
      range: [xValues.displayRange.min, xValues.displayRange.max],
      ...(layout.gridColor ? { gridcolor: layout.gridColor } : {}),
    },
    yaxis: {
      title: formatAxisTitle(layout.yAxis),
      range: [yValues.displayRange.min, yValues.displayRange.max],
      ...(layout.gridColor ? { gridcolor: layout.gridColor } : {}),
    },
    ...(layout.legend !== undefined ? { legend: layout.legend } : {}),
    ...(layout.height !== undefined ? { height: layout.height } : {}),
  };

  return {
    traces,
    layout: plotLayout,
    annotations,
    source,
  };
}
