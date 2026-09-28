import type { ClassifierBins } from "jsthermalcomfort";

/**
 * The one band palette of the app. Colours are assigned by position in the
 * library's own classifier bins, never by label text, so the library owns the
 * bands and the app owns only the paint. The result table, the chart zones
 * and legends (Phase 3) and Explore's default bands (Phase 5) all read from
 * here.
 *
 * Seven entries match the seven-point thermal sensation scale; the fills are
 * the ones the CBE tool has published for Cold … Hot.
 */
export const sensationPalette = [
  "#0571b0",
  "#4c78a8",
  "#92c5de",
  "#f2f2f2",
  "#f4a582",
  "#e15759",
  "#cc79a7",
] as const;

/**
 * Fill for `category`'s position in `bins.labels`; `undefined` when it is not
 * one of them (NaN included — the model's own way of saying "not classified");
 * throws, as {@link fillAtIndex} does, for a classifier longer than the palette.
 * The app never calls `classifyFromBins` here: the value is already the
 * category the model returned, not a number to re-classify.
 */
export function colorForBand(bins: ClassifierBins, category: string | number): string | undefined {
  const index = bins.labels.indexOf(category as string);
  return index === -1 ? undefined : fillAtIndex(bins, index);
}

/**
 * Fill for the band at `index` of `bins`. A classifier with more labels than
 * the palette has colours throws, naming it by its first and last labels,
 * rather than wrapping round and painting its last bands in the first
 * colours. Which palette such a classifier gets is Phase 5's decision.
 */
export function fillAtIndex(bins: ClassifierBins, index: number): string {
  const { labels } = bins;
  if (labels.length > sensationPalette.length) {
    throw new Error(
      `The classifier "${labels[0]}" … "${labels[labels.length - 1]}" has ${labels.length} bands, ` +
        `more than the ${sensationPalette.length} colours of the palette`,
    );
  }
  return sensationPalette[index];
}

/**
 * Chart ink (Phase 3). Not thresholds — the Comfort zones' outline and fill
 * are the palette's cool tones, the isolines and markers are neutral chrome.
 */
export const chartInk = {
  zoneLine: "#4c78a8",
  zoneLineWidth: 1.5,
  /**
   * Fill of zone `level` of `levels` nested Comfort zones, 0 the outermost: one
   * hue, its opacity rising inwards to 0.4, so a lone zone keeps the fill it
   * always had.
   */
  zoneFill: (level: number, levels: number): string => `rgba(146, 197, 222, ${(0.4 * (level + 1)) / levels})`,
  isoline: "#cbd5e1",
  saturationLine: "#94a3b8",
  marker: "#111827",
  markerEdge: "#ffffff",
} as const;
