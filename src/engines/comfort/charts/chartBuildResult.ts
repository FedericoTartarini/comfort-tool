import type { ChartPayload } from "../../../charts/types";
import type { PlotlyChartSpec } from "../../plotlyTypes";

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

export interface ChartHoverProbeHit {
  readonly hovertemplate: string;
  readonly customdata?: unknown;
}

export interface ChartHoverProbe {
  probeDisplay(xDisplay: number, yDisplay: number): ChartHoverProbeHit | null;
}

export interface ChartPlotlyBuild {
  readonly spec: PlotlyChartSpec;
  readonly hoverProbe?: ChartHoverProbe;
}

export interface ChartBuildResult {
  readonly payload: ChartPayload | null;
  readonly legend: ChartLegendViewModel | null;
  readonly readiness: ChartOutputReadiness;
  readonly emptyMessage: string;
  readonly hoverProbe?: ChartHoverProbe;
}
