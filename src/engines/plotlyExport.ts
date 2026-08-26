import type { PlotlyChartSpec } from "./plotlyTypes";
import {
  PublicationColumn,
  publicationChartThemeFor,
  publicationImageSize,
  type PublicationChartTheme,
  type PublicationColumn as PublicationColumnType,
} from "./chartTheme";
import {
  toPlotlyFigure,
  type PlotlyFigure,
} from "./plotlyFigure";

export type ChartExportFormat = "png" | "svg";

export type PublicationExportHandler = (
  format: ChartExportFormat,
  column: PublicationColumnType,
) => void;

export interface PublicationExportMenuItem {
  format: ChartExportFormat;
  column: PublicationColumnType;
  label: string;
}

export const publicationExportMenuItems: readonly PublicationExportMenuItem[] = [
  {
    format: "png",
    column: PublicationColumn.Single,
    label: "PNG, single column",
  },
  {
    format: "png",
    column: PublicationColumn.Double,
    label: "PNG, double column",
  },
  {
    format: "svg",
    column: PublicationColumn.Single,
    label: "SVG, single column",
  },
  {
    format: "svg",
    column: PublicationColumn.Double,
    label: "SVG, double column",
  },
];

export interface PlotlyToImageOptions {
  format: ChartExportFormat;
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

export function chartExportFilename(
  chart: PlotlyChartSpec,
  column: PublicationColumnType = PublicationColumn.Single,
): string {
  const titleText = chart.layout.title.trim() || "cbe-thermal-comfort-chart";
  const slug =
    titleText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cbe-thermal-comfort-chart";
  return `${slug}-${column}`;
}

export function publicationToImageOptions(
  format: ChartExportFormat,
  theme: PublicationChartTheme = publicationChartThemeFor(
    PublicationColumn.Single,
  ),
): PlotlyToImageOptions {
  return {
    format,
    ...publicationImageSize(format, theme),
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
  chart: PlotlyChartSpec,
  format: ChartExportFormat,
  column: PublicationColumnType = PublicationColumn.Single,
): Promise<void> {
  const theme = publicationChartThemeFor(column);
  const figure = toPlotlyFigure(chart, { theme });
  const dedicatedFigure = {
    data: figure.data,
    layout: figure.layout,
    config: figure.config,
  };
  assertDedicatedFigure(dedicatedFigure);

  const url = await plotly.toImage(
    dedicatedFigure,
    publicationToImageOptions(format, theme),
  );
  triggerBrowserDownload(url, `${chartExportFilename(chart, column)}.${format}`);
}
