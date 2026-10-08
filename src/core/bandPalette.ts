import {
  HEAT_INDEX_STRESS_CATEGORY_BINS,
  PMV_CATEGORY_BINS_ISO,
  PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE,
  PMV_THERMAL_SENSATION_VOTE_BINS_ISO,
  UTCI_STRESS_CATEGORY_BINS,
  type ClassifierBins,
} from "jsthermalcomfort";
import { palette } from "./palette";
import type { SlotHue } from "./slotBadge";

/**
 * The band palettes of the app (ADR-0002 decisions 60 and 66). A classifier's
 * colours come from its entry in {@link classifierPalettes}, keyed by the
 * library's classifier object, by identity, as the quantity table is, and read
 * by its entry's rule; they are assigned by position in its bins, never by
 * label text, so the library owns the bands and the app owns only the paint.
 * The result table's Compliance swatches read from here, as Explore's default
 * Band list does (`core/bands.ts`), and both charts' chrome ink; a slot's own
 * ink is its hue (`core/slotBadge.ts`).
 */

/** Colours by count, first first, as its source lists them. */
type ColorFamily = Readonly<Record<number, readonly string[]>>;

/*
 * RdBu and YlOrRd from ColorBrewer, at the counts the table reads,
 * copied from https://github.com/axismaps/colorbrewer (colorbrewer_schemes.js)
 * as hex. This product includes color specifications and designs developed by
 * Cynthia Brewer (http://colorbrewer.org/), licensed under the Apache License 2.0.
 */
const rdBu: ColorFamily = {
  7: ["#b2182b", "#ef8a62", "#fddbc7", "#f7f7f7", "#d1e5f0", "#67a9cf", "#2166ac"],
  11: ["#67001f", "#b2182b", "#d6604d", "#f4a582", "#fddbc7", "#f7f7f7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac", "#053061"],
};

const ylOrRd: ColorFamily = {
  5: ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"],
  6: ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"],
};

/** The colour families the table reads; the palette's test holds the slot hues apart from every colour of them. */
export const colorFamilies = { rdBu, ylOrRd } as const;

/**
 * A classifier's palette (ADR-0002 decision 66, rule 4). A sequential family
 * runs lightest first and is read at one more than the band count, its
 * lightest colour dropped, so no first band is near white. A diverging family
 * is read centred on the `neutral` band: at the odd count that covers the
 * longer side, the shorter side's surplus dropped from the neutral outward, so
 * each side keeps its darkest colours and the neutral its family's neutral.
 */
export type PaletteEntry =
  | {
      readonly kind: "sequential";
      readonly family: ColorFamily;
      /** The last band is outside every category, as ISO 7730's "none" is, and has no colour. */
      readonly lastBandUnpainted?: true;
    }
  | {
      readonly kind: "diverging";
      readonly family: ColorFamily;
      /** Read the family from its last colour to its first: RdBu runs hot to cold, a scale cold to hot. */
      readonly reversed?: true;
      /** The neutral band's index, 0 the first. */
      readonly neutral: number;
    };

/** The entries {@link classifierPalettes} chooses from. */
export const palettes = {
  /** A scale around the neutral band `neutral`, cold blue to hot red. */
  diverging: (neutral: number): PaletteEntry => ({ kind: "diverging", family: rdBu, reversed: true, neutral }),
  /** A one-sided scale, safe to dangerous. */
  sequential: { kind: "sequential", family: ylOrRd },
  /** A one-sided scale of categories, whose last band, "none", is in none of them. */
  sequentialCategories: { kind: "sequential", family: ylOrRd, lastBandUnpainted: true },
} as const satisfies Record<string, PaletteEntry | ((neutral: number) => PaletteEntry)>;

/**
 * Every classifier the app paints, with its palette. A new classifier lands
 * here ahead of its model, its own commit with a test, as a new quantity lands
 * in the quantity table; a family gains the colours at a new count with it.
 */
const classifierPalettes: ReadonlyMap<ClassifierBins, PaletteEntry> = new Map<ClassifierBins, PaletteEntry>([
  // Neutral is "Neutral", the fourth of seven.
  [PMV_THERMAL_SENSATION_VOTE_BINS_ISO, palettes.diverging(3)],
  [PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE, palettes.diverging(3)],
  [HEAT_INDEX_STRESS_CATEGORY_BINS, palettes.sequential],
  [PMV_CATEGORY_BINS_ISO, palettes.sequentialCategories],
  // Neutral is "no thermal stress", the sixth of ten.
  [UTCI_STRESS_CATEGORY_BINS, palettes.diverging(5)],
]);

/**
 * One colour per band of `bins`, in its order, read from its palette's family
 * by the palette's rule; `undefined` for a band its palette leaves unpainted.
 * Throws, naming the classifier by its first and last labels, when `table` has
 * no entry for it, its family has no colours at the count the rule reads, or
 * its neutral band is not one of its bands, rather than painting it half or
 * wrapping round. Only a test passes its own `table`.
 */
export function bandColors(
  bins: ClassifierBins,
  table: ReadonlyMap<ClassifierBins, PaletteEntry> = classifierPalettes,
): readonly (string | undefined)[] {
  const { labels } = bins;
  const count = labels.length;
  const name = `The classifier "${labels[0]}" … "${labels[count - 1]}"`;
  const entry = table.get(bins);
  if (!entry) {
    throw new Error(`${name} has no palette; add it to the band palette's table`);
  }
  const colorsAt = (read: number): readonly string[] => {
    const colors = entry.family[read];
    if (!colors) {
      throw new Error(`${name} has ${count} bands, read at ${read} colours, a count its palette's colour family does not have`);
    }
    return colors;
  };
  if (entry.kind === "sequential") {
    const ordered: (string | undefined)[] = colorsAt(count + 1).slice(1);
    if (entry.lastBandUnpainted) {
      ordered[count - 1] = undefined;
    }
    return ordered;
  }
  const { neutral } = entry;
  if (!Number.isInteger(neutral) || neutral < 0 || neutral >= count) {
    throw new Error(`${name} has ${count} bands, which cannot centre on a neutral band at index ${neutral}`);
  }
  const below = neutral;
  const above = count - 1 - neutral;
  const side = Math.max(below, above);
  const read = colorsAt(2 * side + 1);
  const colors = entry.reversed ? [...read].reverse() : read;
  return [...colors.slice(0, below), colors[side], ...colors.slice(colors.length - above)];
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

/** A `#rrggbb` hex as the `r, g, b` an `rgba()` takes. */
function channelsOf(hex: string): string {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)).join(", ");
}

/**
 * Chart ink. Not bands — the Comfort zones and the markers are in their
 * slot's hue (`core/slotBadge.ts`), the isolines are neutral chrome, and a
 * Band's Edge is one neutral line whatever the band's own colour. The chrome
 * is the interface's slate (`core/palette.ts`), so the page is one palette.
 */
export const chartInk = {
  /** A slot's marker: its hue. */
  marker: (hue: SlotHue): string => hue,
  /** A Comfort zone's outline: its slot's hue. */
  zoneLine: (hue: SlotHue): string => hue,
  zoneLineWidth: 1.5,
  /** A Band's Edge (ADR-0002 decision 62): darker than the isolines, so it reads over them, and thinner than a zone's outline. */
  bandLine: palette.inkMuted,
  bandLineWidth: 1,
  /**
   * Fill of zone `level` of `levels` nested Comfort zones, 0 the outermost:
   * the slot's hue, its opacity rising evenly from 0.2 at the outermost, so
   * every zone shows on the paper, to 0.4 at the innermost; a lone zone is
   * 0.4 (ADR-0002 decision 71).
   */
  zoneFill: (hue: SlotHue, level: number, levels: number): string =>
    `rgba(${channelsOf(hue)}, ${0.2 + 0.2 * (levels === 1 ? 1 : level / (levels - 1))})`,
  /** The plot area's ground, which a band painted nowhere shows: the page's paper. */
  ground: palette.paper,
  isoline: palette.lineStrong,
  isolineWidth: 1,
  saturationLine: palette.lineHeavy,
  saturationLineWidth: 1.5,
  markerEdge: palette.paper,
} as const;
