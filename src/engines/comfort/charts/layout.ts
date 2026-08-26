import type {
  PlotLayout,
  PlotlyChartSpec,
} from "../../plotlyTypes";
import { buildAxisValues, formatAxisTitle } from "./axis";
import type { ChartResponseSpec } from "./types";

export function buildChartResponse({
  traces,
  layout,
  annotations = [],
  source,
}: ChartResponseSpec): PlotlyChartSpec {
  const xValues = buildAxisValues(layout.xAxis);
  const yValues = buildAxisValues(layout.yAxis);
  const plotLayout: PlotLayout = {
    title: layout.title,
    paper_bgcolor: layout.paperBgColor,
    plot_bgcolor: layout.plotBgColor,
    showlegend: layout.showLegend,
    margin: layout.margin,
    xaxis: {
      title: formatAxisTitle(layout.xAxis),
      range: [xValues.displayRange.min, xValues.displayRange.max],
      ...((layout.xAxis.gridColor ?? layout.gridColor)
        ? { gridcolor: layout.xAxis.gridColor ?? layout.gridColor }
        : {}),
      ...((layout.xAxis.showGrid ?? layout.showGrid) !== undefined
        ? { showgrid: layout.xAxis.showGrid ?? layout.showGrid }
        : {}),
      ...((layout.xAxis.zeroLine ?? layout.zeroLine) !== undefined
        ? { zeroline: layout.xAxis.zeroLine ?? layout.zeroLine }
        : {}),
      ...(layout.xAxis.showTickLabels !== undefined
        ? { showticklabels: layout.xAxis.showTickLabels }
        : {}),
    },
    yaxis: {
      title: formatAxisTitle(layout.yAxis),
      range: [yValues.displayRange.min, yValues.displayRange.max],
      ...((layout.yAxis.gridColor ?? layout.gridColor)
        ? { gridcolor: layout.yAxis.gridColor ?? layout.gridColor }
        : {}),
      ...((layout.yAxis.showGrid ?? layout.showGrid) !== undefined
        ? { showgrid: layout.yAxis.showGrid ?? layout.showGrid }
        : {}),
      ...((layout.yAxis.zeroLine ?? layout.zeroLine) !== undefined
        ? { zeroline: layout.yAxis.zeroLine ?? layout.zeroLine }
        : {}),
      ...(layout.yAxis.showTickLabels !== undefined
        ? { showticklabels: layout.yAxis.showTickLabels }
        : {}),
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
