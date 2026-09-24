import { draw } from "./draw";
import { frameLayout, pointTrace, polygonTrace, polylineTrace } from "./traces";
import type { AssembleResult, SetInput } from "./types";

export function assembleSet(input: SetInput): AssembleResult {
  const data: Record<string, unknown>[] = [
    ...(input.bands ?? []).map(polygonTrace),
    ...input.series.map(polylineTrace),
    ...(input.points ?? []).map(pointTrace),
  ];
  return { data, layout: frameLayout({ ...input, showlegend: input.showlegend ?? true }) };
}

export function setFigure(
  root: HTMLElement,
  input: SetInput,
): Promise<void> {
  return draw(root, assembleSet(input));
}
