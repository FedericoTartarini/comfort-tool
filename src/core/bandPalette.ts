import type { IntervalScale } from "jsthermalcomfort/reference";

/**
 * The one band palette of the app. Colours are assigned by position in a
 * library scale, never by label text, so the library owns the bands and the
 * app owns only the paint. The result table, the chart zones and legends
 * (Phase 3) and Explore's default bands (Phase 5) all read from here.
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

/** Colours for a `Measure.intervals` entry, by whether the conditions satisfied it. */
export const intervalColor = { satisfied: "#047857", unsatisfied: "#dc2626" } as const;

/** Fill for the band `value` falls into; `undefined` when the scale does not classify it (NaN included). */
export function colorForBand(scale: IntervalScale, value: number): string | undefined {
  const band = scale.classify(value);
  if (!band) {
    return undefined;
  }
  const index = scale.intervals.indexOf(band);
  return sensationPalette[index % sensationPalette.length];
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
