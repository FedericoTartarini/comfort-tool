import { draw } from "./draw";
import {
  frameLayout,
  gridTrace,
  partitionHoverFills,
  pointTrace,
  polygonTrace,
} from "./traces";
import type { AssembleResult, DynamicInput } from "./types";

export function assembleDynamic(input: DynamicInput): AssembleResult {
  const { background, hover } = partitionHoverFills(input.fills ?? []);
  const data: Record<string, unknown>[] = [
    ...background.map(gridTrace),
    ...(input.zones ?? []).map(polygonTrace),
    ...hover.map(gridTrace),
    ...input.points.map(pointTrace),
  ];
  return { data, layout: frameLayout(input) };
}

export function dynamicFigure(
  root: HTMLElement,
  input: DynamicInput,
): Promise<void> {
  return draw(root, assembleDynamic(input));
}
