import type {
  PlotAnnotationDto,
  PlotAxisDto,
  PlotLayoutDto,
  PlotlyChartResponseDto,
} from "../models/comfortDtos";

type PlotlyAxisTitle = string | { text: string; standoff?: number };

export type PlotlyFigureAxis = Omit<PlotAxisDto, "title"> & {
  title?: PlotlyAxisTitle;
};

export type PlotlyFigureLayout = Omit<
  PlotLayoutDto,
  "title" | "xaxis" | "yaxis"
> & {
  title?: string | { text: string };
  xaxis: PlotlyFigureAxis;
  yaxis: PlotlyFigureAxis;
  annotations: PlotAnnotationDto[];
};

export interface PlotlyFigureConfig {
  responsive: true;
  displaylogo: false;
  displayModeBar: "hover";
}

export interface PlotlyFigure {
  data: Array<Record<string, unknown>>;
  layout: PlotlyFigureLayout;
  config: PlotlyFigureConfig;
}

export function toPlotlyFigure(chart: PlotlyChartResponseDto): PlotlyFigure {
  const xaxis: PlotlyFigureAxis = { ...chart.layout.xaxis };
  const yaxis: PlotlyFigureAxis = { ...chart.layout.yaxis };

  if (typeof xaxis.title === "string") {
    xaxis.title = { text: xaxis.title, standoff: 12 };
  }

  if (typeof yaxis.title === "string") {
    yaxis.title = { text: yaxis.title, standoff: 12 };
  }

  const figure: PlotlyFigure = {
    data: chart.traces.map((trace) => {
      const plotlyTrace = { ...trace };
      const customdata = plotlyTrace.hoverMetadata;
      delete plotlyTrace.hoverMetadata;
      delete plotlyTrace.isBackgroundZone;
      return {
        ...plotlyTrace,
        customdata,
      };
    }),
    layout: {
      ...chart.layout,
      title: chart.layout.title
        ? { text: chart.layout.title }
        : chart.layout.title,
      xaxis,
      yaxis,
      annotations: chart.annotations,
    },
    config: {
      responsive: true,
      displaylogo: false,
      displayModeBar: "hover",
    },
  };

  // Plotly mutates nested figure data. Preserve the existing JSON-clone
  // boundary, including conversion of non-finite grid cells into Plotly gaps.
  return JSON.parse(JSON.stringify(figure)) as PlotlyFigure;
}
