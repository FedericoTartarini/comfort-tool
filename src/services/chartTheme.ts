/**
 * Screen and publication chart theme (Plan 0h).
 *
 * Geometry stays Plotly-agnostic. This module sizes the two surfaces:
 * screen (CSS pixels, hover mode bar) and publication (explicit mm / pt / dpi,
 * no mode bar). Export builds a separate figure; it must not capture the
 * on-screen plot. Extra journal column widths are Phase 2a.
 */

export const ChartThemeKind = {
  Screen: "screen",
  Publication: "publication",
} as const;

export type ChartThemeKind =
  (typeof ChartThemeKind)[keyof typeof ChartThemeKind];

/** CSS pixels are 1/96 in. Plotly layout width/height use this space. */
export const CHART_LAYOUT_DPI = 96;

/** Publication PNG resolution (Plan 0h). */
export const PUBLICATION_DPI = 300;

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

export interface ScreenChartTheme {
  kind: typeof ChartThemeKind.Screen;
  fontFamily: string;
  fontSizePx: number;
  titleFontSizePx: number;
  axisTitleStandoffPx: number;
  displayModeBar: "hover";
  responsive: true;
  displaylogo: false;
}

export interface PublicationChartTheme {
  kind: typeof ChartThemeKind.Publication;
  fontFamily: string;
  fontPt: number;
  titleFontPt: number;
  axisTitleStandoffPt: number;
  widthMm: number;
  heightMm: number;
  dpi: number;
  displayModeBar: false;
  responsive: false;
  displaylogo: false;
}

export type ChartTheme = ScreenChartTheme | PublicationChartTheme;

export const screenChartTheme: ScreenChartTheme = {
  kind: ChartThemeKind.Screen,
  fontFamily: "Open Sans, verdana, arial, sans-serif",
  fontSizePx: 12,
  titleFontSizePx: 14,
  axisTitleStandoffPx: 12,
  displayModeBar: "hover",
  responsive: true,
  displaylogo: false,
};

export const publicationChartTheme: PublicationChartTheme = {
  kind: ChartThemeKind.Publication,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontPt: 9,
  titleFontPt: 11,
  axisTitleStandoffPt: 9,
  widthMm: 120,
  heightMm: 90,
  dpi: PUBLICATION_DPI,
  displayModeBar: false,
  responsive: false,
  displaylogo: false,
};

export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}

export function ptToPx(pt: number, dpi: number): number {
  return (pt / PT_PER_INCH) * dpi;
}

export function publicationLayoutSizePx(
  theme: PublicationChartTheme = publicationChartTheme,
): { width: number; height: number } {
  return {
    width: Math.round(mmToPx(theme.widthMm, CHART_LAYOUT_DPI)),
    height: Math.round(mmToPx(theme.heightMm, CHART_LAYOUT_DPI)),
  };
}

export function publicationRasterScale(
  theme: PublicationChartTheme = publicationChartTheme,
): number {
  return theme.dpi / CHART_LAYOUT_DPI;
}

export interface PublicationImageSize {
  width: number;
  height: number;
  scale: number;
}

/**
 * PNG uses layout CSS pixels × dpi/96 so the raster is ~300 DPI at the
 * themed millimetre size. SVG keeps scale 1 so the vector matches that
 * layout geometry.
 */
export function publicationImageSize(
  format: "png" | "svg",
  theme: PublicationChartTheme = publicationChartTheme,
): PublicationImageSize {
  const { width, height } = publicationLayoutSizePx(theme);
  return {
    width,
    height,
    scale: format === "png" ? publicationRasterScale(theme) : 1,
  };
}
