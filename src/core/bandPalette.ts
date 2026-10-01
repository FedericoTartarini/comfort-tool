import {
  HEAT_INDEX_STRESS_CATEGORY_BINS,
  PMV_CATEGORY_BINS_ISO,
  PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE,
  PMV_THERMAL_SENSATION_VOTE_BINS_ISO,
  type ClassifierBins,
} from "jsthermalcomfort";
import type { SlotHue } from "./slotBadge";

/**
 * The band palettes of the app (ADR-0002 decision 60). A classifier's colours
 * come from its entry in {@link classifierPalettes}, keyed by the library's
 * classifier object, by identity, as the quantity table is, and read at its
 * band count; they are assigned by position in its bins, never by label text,
 * so the library owns the bands and the app owns only the paint. The result
 * table's Compliance swatches read from here, as Explore's default Band list
 * does (`core/bands.ts`), and both charts' chrome ink; a slot's own ink is its
 * hue (`core/slotBadge.ts`).
 */

/** Colours by band count, first band first. */
type ColorFamily = Readonly<Record<number, readonly string[]>>;

/** The fills the CBE tool has published for the seven-point thermal sensation scale, Cold … Hot. */
const cbeSensation: ColorFamily = {
  7: ["#0571b0", "#4c78a8", "#92c5de", "#f2f2f2", "#f4a582", "#e15759", "#cc79a7"],
};

/*
 * RdBu and YlOrRd from ColorBrewer, at the band counts the table reads,
 * copied from https://github.com/axismaps/colorbrewer (colorbrewer_schemes.js)
 * as hex. This product includes color specifications and designs developed by
 * Cynthia Brewer (http://colorbrewer.org/), licensed under the Apache License 2.0.
 */
const rdBu: ColorFamily = {
  10: ["#67001f", "#b2182b", "#d6604d", "#f4a582", "#fddbc7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac", "#053061"],
};

const ylOrRd: ColorFamily = {
  4: ["#ffffb2", "#fecc5c", "#fd8d3c", "#e31a1c"],
  5: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
};

/** A classifier's palette: a colour family, read at the classifier's band count. */
export interface PaletteEntry {
  readonly family: ColorFamily;
  /** Read the family from its last colour to its first: RdBu runs hot to cold, a scale cold to hot. */
  readonly reversed?: true;
  /** The last band is outside every category, as ISO 7730's "none" is, and has no colour. */
  readonly lastBandUnpainted?: true;
}

/** The entries {@link classifierPalettes} chooses from. */
export const palettes = {
  /** The thermal-sensation scale's CBE fills, for now (decision 60). */
  cbeSensation: { family: cbeSensation },
  /** A scale around neutral, cold blue to hot red, as UTCI's will be. */
  diverging: { family: rdBu, reversed: true },
  /** A one-sided scale, safe to dangerous. */
  sequential: { family: ylOrRd },
  /** A one-sided scale of categories, whose last band, "none", is in none of them. */
  sequentialCategories: { family: ylOrRd, lastBandUnpainted: true },
} as const satisfies Record<string, PaletteEntry>;

/**
 * Every classifier the app paints, with its palette. A new classifier lands
 * here ahead of its model, its own commit with a test, as a new quantity lands
 * in the quantity table; a family gains the colours at a new band count with it.
 */
const classifierPalettes: ReadonlyMap<ClassifierBins, PaletteEntry> = new Map<ClassifierBins, PaletteEntry>([
  [PMV_THERMAL_SENSATION_VOTE_BINS_ISO, palettes.cbeSensation],
  [PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE, palettes.cbeSensation],
  [HEAT_INDEX_STRESS_CATEGORY_BINS, palettes.sequential],
  [PMV_CATEGORY_BINS_ISO, palettes.sequentialCategories],
]);

/**
 * One colour per band of `bins`, in its order, read from its palette's family
 * at its band count; `undefined` for a band its palette leaves unpainted.
 * Throws, naming the classifier by its first and last labels, when `table` has
 * no entry for it or its family has no colours at its band count, rather than
 * painting it half or wrapping round. Only a test passes its own `table`.
 */
export function bandColors(
  bins: ClassifierBins,
  table: ReadonlyMap<ClassifierBins, PaletteEntry> = classifierPalettes,
): readonly (string | undefined)[] {
  const { labels } = bins;
  const name = `The classifier "${labels[0]}" … "${labels[labels.length - 1]}"`;
  const entry = table.get(bins);
  if (!entry) {
    throw new Error(`${name} has no palette; add it to the band palette's table`);
  }
  const colors = entry.family[labels.length];
  if (!colors) {
    throw new Error(`${name} has ${labels.length} bands, a count its palette's colour family does not have`);
  }
  const ordered: (string | undefined)[] = entry.reversed ? [...colors].reverse() : [...colors];
  if (entry.lastBandUnpainted) {
    ordered[ordered.length - 1] = undefined;
  }
  return ordered;
}

/**
 * Fill for `category`'s band in `bins`, as {@link bandColors} gives it;
 * `undefined` for a band left unpainted and for a category the classifier does
 * not name (NaN included — the model's own way of saying "past the last
 * Edge"). The app never calls `classifyFromBins` here: the value is already
 * the category the model returned, not a number to re-classify.
 */
export function colorForBand(bins: ClassifierBins, category: string | number): string | undefined {
  const index = bins.labels.indexOf(category as string);
  return index === -1 ? undefined : bandColors(bins)[index];
}

/**
 * Chart ink. Not bands — the Comfort zones and the markers are in their
 * slot's hue (`core/slotBadge.ts`), the isolines are neutral chrome.
 */
export const chartInk = {
  zoneLineWidth: 1.5,
  /**
   * Fill of zone `level` of `levels` nested Comfort zones, 0 the outermost:
   * the slot's hue, its opacity rising inwards to 0.4, so a lone zone keeps
   * the fill it always had.
   */
  zoneFill: (hue: SlotHue, level: number, levels: number): string =>
    `rgba(${hue.zoneFillRgb}, ${(0.4 * (level + 1)) / levels})`,
  /** The plot area's ground, which a band painted nowhere shows. */
  ground: "#ffffff",
  isoline: "#cbd5e1",
  saturationLine: "#94a3b8",
  markerEdge: "#ffffff",
} as const;
