import { draw } from "./draw";
import { frameLayout, pointTrace, polylineTrace } from "./traces";
import type { AssembleResult, BodyTemperatureInput } from "./types";

export function assembleBodyTemperature(
  input: BodyTemperatureInput,
): AssembleResult {
  const data: Record<string, unknown>[] = [
    ...input.series.map(polylineTrace),
    ...(input.points ?? []).map(pointTrace),
  ];
  return { data, layout: frameLayout({ ...input, showlegend: input.showlegend ?? true }) };
}

export function bodyTemperatureFigure(
  root: HTMLElement,
  input: BodyTemperatureInput,
): Promise<void> {
  return draw(root, assembleBodyTemperature(input));
}
