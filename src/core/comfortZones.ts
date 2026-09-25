import type { Bound, ClassifierBins } from "jsthermalcomfort";
import { copy } from "$lib/text/copy";
import type { ComfortZone } from "./modelDeclaration";

/**
 * One Comfort zone per category of a classifier that cuts |PMV|, innermost
 * first: each bin's label and its upper edge, which the zone includes when the
 * classifier is right-inclusive, as numpy's `digitize` and pythermalcomfort's
 * `_mapping` read `right`. The bin past the final edge is not a zone: the
 * final edge is the sentinel closing the open-ended outside bin ("none", then
 * NaN), the library's convention for every v1 classifier and the one thing
 * read here that no field states.
 */
export function categoryZones(bins: ClassifierBins): readonly [ComfortZone, ...ComfortZone[]] {
  const [first, ...rest] = bins.edges
    .slice(0, -1)
    .map((limit, index) => ({ label: copy.categoryZone(bins.labels[index]), limit, inclusive: bins.right }));
  if (!first) {
    throw new Error("Classifier bins with fewer than two edges cannot be read as |PMV| category limits");
  }
  return [first, ...rest];
}

/**
 * The one Comfort zone of a standard with a single interval, at its upper
 * end, strict at both ends as pythermalcomfort computes `compliance`. The
 * chart draws |PMV| against one limit, so an interval not symmetric about
 * zero would be drawn as one it is not.
 */
export function intervalZone(label: string, bound: Bound): ComfortZone {
  if (bound.min === undefined || bound.max === undefined || bound.min !== -bound.max) {
    throw new Error(`${label}: the interval is not symmetric about zero, so it is not an |PMV| limit`);
  }
  return { label, limit: bound.max, inclusive: false };
}
