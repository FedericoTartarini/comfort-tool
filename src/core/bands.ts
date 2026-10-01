import type { ClassifierBins } from "jsthermalcomfort";
import { bandColors } from "./bandPalette";

/**
 * The Bands of one model as the Explore page paints them (ADR-0002 decision
 * 59): a read-only copy of the library's classifier — its Edges, its labels and
 * its inclusivity flag — with a colour per band, `undefined` for a band painted
 * nowhere. The three arrays are of one length. A list is itself a
 * `ClassifierBins`, so the library's `classifyFromBins` is handed it as it is
 * and the app writes no inclusivity rule.
 *
 * Built and changed here alone, by pure functions from a list to a list; a
 * band is named by its index, 0 the first, and its Edge is its upper one.
 */
export interface BandList extends ClassifierBins {
  readonly edges: readonly number[];
  readonly labels: readonly string[];
  readonly right: boolean;
  readonly colors: readonly (string | undefined)[];
}

/**
 * The default list of `bins`: a copy, coloured by position from the
 * classifier's palette. Colours are assigned here once; after that each band
 * carries its own.
 */
export function bandListOf(bins: ClassifierBins): BandList {
  return { edges: [...bins.edges], labels: [...bins.labels], right: bins.right, colors: bandColors(bins) };
}

/**
 * Band `index`'s Edge moved to `edge`, which must fall strictly between its
 * neighbours: the Edge below and the Edge above, where each exists. Otherwise
 * the move is refused and `list` itself is returned.
 */
export function moveEdge(list: BandList, index: number, edge: number): BandList {
  const { edges } = list;
  const below = index === 0 ? Number.NEGATIVE_INFINITY : edges[index - 1];
  const above = index === edges.length - 1 ? Number.POSITIVE_INFINITY : edges[index + 1];
  if (!(below < edge && edge < above)) {
    return list;
  }
  return { ...list, edges: withReplaced(edges, index, edge) };
}

/**
 * Band `index` split at the midpoint of its interval by a new Edge: the upper
 * half keeps the band's label and colour, the lower half has an empty label
 * and no colour, so nothing already painted changes colour.
 *
 * The first band is open below, so its midpoint is taken down to the next
 * Edge below its own in `classifier`, the list's default; with none there,
 * the new Edge is one unit below its upper one.
 */
export function addEdge(list: BandList, index: number, classifier: ClassifierBins): BandList {
  const upper = list.edges[index];
  return {
    ...list,
    edges: withInserted(list.edges, index, index === 0 ? firstBandSplit(upper, classifier) : (list.edges[index - 1] + upper) / 2),
    labels: withInserted(list.labels, index, ""),
    colors: withInserted(list.colors, index, undefined),
  };
}

/**
 * Band `index` removed by deleting its upper Edge, which merges it into the
 * band above, keeping that band's label and colour. The last band has none
 * above, so it merges into the one below, which keeps its own and takes the
 * last Edge. The only band is never removed: `list` itself is returned.
 */
export function removeEdge(list: BandList, index: number): BandList {
  const count = list.labels.length;
  if (count === 1) {
    return list;
  }
  return {
    ...list,
    edges: withRemoved(list.edges, index === count - 1 ? index - 1 : index),
    labels: withRemoved(list.labels, index),
    colors: withRemoved(list.colors, index),
  };
}

/** Band `index` relabelled `label`. */
export function setLabel(list: BandList, index: number, label: string): BandList {
  return { ...list, labels: withReplaced(list.labels, index, label) };
}

/** Band `index` recoloured `color`, or left unpainted for `undefined`. */
export function setColor(list: BandList, index: number, color: string | undefined): BandList {
  return { ...list, colors: withReplaced(list.colors, index, color) };
}

/** The new Edge that splits a first band whose upper Edge is `upper` (see {@link addEdge}). */
function firstBandSplit(upper: number, classifier: ClassifierBins): number {
  const below = classifier.edges.filter((edge) => edge < upper);
  return below.length === 0 ? upper - 1 : (below[below.length - 1] + upper) / 2;
}

function withInserted<T>(items: readonly T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function withRemoved<T>(items: readonly T[], index: number): T[] {
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

function withReplaced<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, position) => (position === index ? item : existing));
}
