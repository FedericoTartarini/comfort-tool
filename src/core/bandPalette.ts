import type { ClassifierBins } from "jsthermalcomfort-main";

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
 * one of them (NaN included — the model's own way of saying "not classified").
 * The app never calls `classifyFromBins` here: the value is already the
 * category the model returned, not a number to re-classify.
 */
export function colorForBand(bins: ClassifierBins, category: string | number): string | undefined {
  const index = bins.labels.indexOf(category as string);
  return index === -1 ? undefined : bandFill(index);
}

/** Fill for the band at `index` of a scale, wrapping when a scale is longer than the palette. */
export function bandFill(index: number): string {
  return sensationPalette[index % sensationPalette.length];
}

/**
 * Chart ink (Phase 3). Not thresholds — the compliance zone's outline and fill
 * are the palette's cool tones, the isolines and markers are neutral chrome.
 */
export const chartInk = {
  zoneLine: "#4c78a8",
  zoneFill: "rgba(146, 197, 222, 0.4)",
  isoline: "#cbd5e1",
  saturationLine: "#94a3b8",
  marker: "#111827",
  markerEdge: "#ffffff",
} as const;
