import { draw } from "../draw";
import {
  frameLayout,
  gridTrace,
  partitionHoverFills,
  pointTrace,
  polygonTrace,
  polylineTrace,
} from "../traces";
import type { AssembleResult, PsychrometricInput } from "../types";

export function assemblePsychrometric(
  input: PsychrometricInput,
): AssembleResult {
  const { background, hover } = partitionHoverFills(input.fills ?? []);
  const comfortZones = input.zones.filter((zone) => (
    zone.name?.includes("comfort zone")
  ));
  const bandZones = input.zones.filter((zone) => (
    !zone.name?.includes("comfort zone")
  ));
  const data: Record<string, unknown>[] = [
    ...background.map(gridTrace),
    ...(input.mask ? [polygonTrace(input.mask)] : []),
    ...bandZones.map(polygonTrace),
    ...input.curves.map(polylineTrace),
    ...comfortZones.map(polygonTrace),
    ...hover.map(gridTrace),
    ...input.points.map(pointTrace),
  ];
  return { data, layout: frameLayout(input) };
}

export function psychrometricFigure(
  root: HTMLElement,
  input: PsychrometricInput,
): Promise<void> {
  return draw(root, assemblePsychrometric(input));
}
