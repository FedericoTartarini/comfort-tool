import type { PlotlyChartResponseDto } from "../models/comfortDtos";
import {
  publicationChartTheme,
  publicationImageSize,
} from "./chartTheme";
import {
  toPlotlyFigure,
  type PlotlyFigure,
} from "./plotlyFigure";

export interface PlotlyToImageOptions {
  format: "png" | "svg";
  width: number;
  height: number;
  scale: number;
}

export interface PlotlyToImageApi {
  toImage: (
    figure: {
      data: PlotlyFigure["data"];
      layout: PlotlyFigure["layout"];
      config: PlotlyFigure["config"];
    },
    options: PlotlyToImageOptions,
  ) => Promise<string>;
}

export function chartExportFilename(chart: PlotlyChartResponseDto): string {
  const titleText = chart.layout.title.trim() || "cbe-thermal-comfort-chart";
  return (
    titleText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cbe-thermal-comfort-chart"
  );
}

export function publicationToImageOptions(
  format: "png" | "svg",
): PlotlyToImageOptions {
  return {
    format,
    ...publicationImageSize(format),
  };
}

function assertDedicatedFigure(
  figure: object,
): asserts figure is {
  data: PlotlyFigure["data"];
  layout: PlotlyFigure["layout"];
  config: PlotlyFigure["config"];
} {
  if (typeof HTMLElement !== "undefined" && figure instanceof HTMLElement) {
    throw new Error("Publication export must not capture the on-screen plot.");
  }
}

function triggerBrowserDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Build a publication-themed figure and rasterize/vectorize it. Never pass the
 * live graph div — PNG and SVG share that figure's geometry.
 */
export async function downloadPublicationChart(
  plotly: PlotlyToImageApi,
  chart: PlotlyChartResponseDto,
  format: "png" | "svg",
): Promise<void> {
  const figure = toPlotlyFigure(chart, { theme: publicationChartTheme });
  const dedicatedFigure = {
    data: figure.data,
    layout: figure.layout,
    config: figure.config,
  };
  assertDedicatedFigure(dedicatedFigure);

  const url = await plotly.toImage(
    dedicatedFigure,
    publicationToImageOptions(format),
  );
  triggerBrowserDownload(url, `${chartExportFilename(chart)}.${format}`);
}
