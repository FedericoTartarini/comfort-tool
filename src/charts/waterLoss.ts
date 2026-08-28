import { draw } from "./draw";
import { frameLayout, pointTrace, polylineTrace } from "./traces";
import type { AssembleResult, WaterLossInput } from "./types";

export function assembleWaterLoss(input: WaterLossInput): AssembleResult {
  const data: Record<string, unknown>[] = [
    ...input.series.map(polylineTrace),
    ...(input.points ?? []).map(pointTrace),
  ];
  return { data, layout: frameLayout({ ...input, showlegend: input.showlegend ?? true }) };
}

export function waterLossFigure(
  root: HTMLElement,
  input: WaterLossInput,
): Promise<void> {
  return draw(root, assembleWaterLoss(input));
}
