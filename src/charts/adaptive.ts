import { draw } from "./draw";
import {
  frameLayout,
  gridTrace,
  partitionHoverFills,
  pointTrace,
  polygonTrace,
} from "./traces";
import type { AdaptiveInput, AssembleResult } from "./types";

export function assembleAdaptive(input: AdaptiveInput): AssembleResult {
  const { background, hover } = partitionHoverFills(input.fills ?? []);
  const data: Record<string, unknown>[] = [
    ...background.map(gridTrace),
    ...input.regions.map(polygonTrace),
    ...hover.map(gridTrace),
    ...input.points.map(pointTrace),
  ];
  return { data, layout: frameLayout({ ...input, showlegend: input.showlegend ?? true }) };
}

export function adaptiveFigure(
  root: HTMLElement,
  input: AdaptiveInput,
): Promise<void> {
  return draw(root, assembleAdaptive(input));
}
