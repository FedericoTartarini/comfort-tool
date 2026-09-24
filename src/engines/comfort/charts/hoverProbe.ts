import type { ChartHoverProbe, ChartHoverProbeHit } from "./chartBuildResult";
import type { ChartAxisScale } from "./types";

export function createDisplayHoverProbe(
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  evaluateSi: (xSi: number, ySi: number) => ChartHoverProbeHit | null,
): ChartHoverProbe {
  return {
    probeDisplay(xDisplay, yDisplay) {
      if (!Number.isFinite(xDisplay) || !Number.isFinite(yDisplay)) return null;
      const xSi = xAxis.toSi(xDisplay);
      const ySi = yAxis.toSi(yDisplay);
      if (!Number.isFinite(xSi) || !Number.isFinite(ySi)) return null;
      return evaluateSi(xSi, ySi);
    },
  };
}
