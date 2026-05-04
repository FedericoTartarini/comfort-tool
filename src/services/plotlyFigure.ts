/*
* This file contains the code for converting the PlotlyChartResponseDto to a PlotlyFigure.
* The PlotlyFigure is a type that is used to represent the figure that is displayed in the chart.
* 
*/

import type {
  PlotAnnotationDto,
  PlotLayoutDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
} from "../models/comfortDtos";

// Axis title type
type PlotlyAxisTitle = string | { text: string; standoff?: number };

// Figure layout type
type PlotlyFigureLayout = Omit<PlotLayoutDto, "title" | "xaxis" | "yaxis"> & {
  // Title type
  title?: string | { text: string };
  // X-axis type
  xaxis: Record<string, unknown> & { title?: PlotlyAxisTitle };
  // Y-axis type
  yaxis: Record<string, unknown> & { title?: PlotlyAxisTitle };
  // Annotations type
  annotations: PlotAnnotationDto[];
  // Transition type
  transition?: Record<string, unknown>;
};

// Convert the PlotlyChartResponseDto to a PlotlyFigure
export function toPlotlyFigure(chart: PlotlyChartResponseDto): {
  data: PlotTraceDto[];
  layout: PlotlyFigureLayout;
  config: Record<string, unknown>;
} {
  // Copy the x-axis
  const xaxis: PlotlyFigureLayout["xaxis"] = { ...chart.layout.xaxis };
  // Copy the y-axis
  const yaxis: PlotlyFigureLayout["yaxis"] = { ...chart.layout.yaxis };

  // Add standoff to the x-axis title if it's a string
  if (typeof xaxis.title === "string") {
    xaxis.title = { text: xaxis.title, standoff: 12 };
  }

  // Add standoff to the y-axis title if it's a string
  if (typeof yaxis.title === "string") {
    yaxis.title = { text: yaxis.title, standoff: 12 };
  }

  // Return the plotly figure
  return {
    // Traces data
    data: chart.traces,
    // Figure layout
    layout: {
      // Spread all base "layout" properties (like title, x-axis, y-axis),
      // so they can be selectively overridden by the properties below.
      ...chart.layout,
      // If title exists, format it as an object of type {text: string}, otherwise keep it as is.
      title: chart.layout.title ? { text: chart.layout.title } : chart.layout.title,
      xaxis,
      yaxis,
      // Chart annotations (labels, arrows, and other callouts)
      annotations: chart.annotations,
    },
    // Plotly configuration
    config: {
      responsive: true,
      displaylogo: false,
      displayModeBar: false,
    },
  };
}
