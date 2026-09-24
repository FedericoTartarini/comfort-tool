import { draw } from "./draw";
import { frameLayout, pointTrace, polygonTrace, polylineTrace } from "./traces";
import type { AssembleResult, HeatLossInput } from "./types";

export function assembleHeatLoss(input: HeatLossInput): AssembleResult {
  const data: Record<string, unknown>[] = [
    ...(input.bands ?? []).map(polygonTrace),
    ...input.series.map(polylineTrace),
    ...(input.points ?? []).map(pointTrace),
  ];
  return { data, layout: frameLayout({ ...input, showlegend: input.showlegend ?? true }) };
}

export function heatLossFigure(
  root: HTMLElement,
  input: HeatLossInput,
): Promise<void> {
  return draw(root, assembleHeatLoss(input));
}
