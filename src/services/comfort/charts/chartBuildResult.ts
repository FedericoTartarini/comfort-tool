import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";

export const ChartLegendKind = {
  Bands: "bands",
  Series: "series",
  Zones: "zones",
} as const;

export type ChartLegendKind = (typeof ChartLegendKind)[keyof typeof ChartLegendKind];

export interface ChartLegendItem {
  readonly label: string;
  readonly color: string;
}

export interface ChartLegendViewModel {
  readonly kind: ChartLegendKind;
  readonly title: string;
  readonly items: readonly ChartLegendItem[];
  readonly toggleable?: boolean;
}

export type ChartOutputReadiness = "empty" | "stale" | "ready";

export interface ChartBuildResult {
  readonly plotly: PlotlyChartResponseDto | null;
  readonly legend: ChartLegendViewModel | null;
  readonly readiness: ChartOutputReadiness;
  readonly emptyMessage: string;
}
