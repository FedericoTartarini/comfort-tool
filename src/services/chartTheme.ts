/**
 * Screen and publication chart theme (Plan 0h / 2a / 2c).
 *
 * Geometry stays Plotly-agnostic. This module sizes the two surfaces:
 * screen (CSS pixels, hover mode bar) and publication (explicit mm / pt / dpi,
 * no mode bar). Export builds a separate figure; it must not capture the
 * on-screen plot. Publication widths are journal single- and double-column
 * profiles on the same type tokens (font, pt, dpi). Zone fills remap through
 * `src/models/zoneTokens.ts` (screen / publication / colour-blind).
 */

import {
  ZonePaletteKind,
  type ZonePaletteKind as ZonePaletteKindType,
} from "../models/zoneTokens";

export const ChartThemeKind = {
  Screen: "screen",
  Publication: "publication",
} as const;

export type ChartThemeKind =
  (typeof ChartThemeKind)[keyof typeof ChartThemeKind];

/** Journal column widths for publication export (Plan 2a). */
export const PublicationColumn = {
  Single: "single",
  Double: "double",
} as const;

export type PublicationColumn =
  (typeof PublicationColumn)[keyof typeof PublicationColumn];

/** CSS pixels are 1/96 in. Plotly layout width/height use this space. */
export const CHART_LAYOUT_DPI = 96;

/** Publication PNG resolution (Plan 0h). */
export const PUBLICATION_DPI = 300;

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

/**
 * Elsevier / ASHRAE two-column figure widths. Single column is square so a
 * Compare legend still has vertical room; double column keeps the 0h 4:3
 * aspect (120×90) scaled to 190 mm.
 */
export const PUBLICATION_COLUMN_SIZE_MM: Record<
  PublicationColumn,
  { widthMm: number; heightMm: number }
> = {
  [PublicationColumn.Single]: { widthMm: 90, heightMm: 90 },
  [PublicationColumn.Double]: { widthMm: 190, heightMm: 142.5 },
};

const PUBLICATION_TYPE = {
  kind: ChartThemeKind.Publication,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontPt: 9,
  titleFontPt: 11,
  axisTitleStandoffPt: 9,
  dpi: PUBLICATION_DPI,
  displayModeBar: false,
  responsive: false,
  displaylogo: false,
  zonePalette: ZonePaletteKind.Publication,
} as const;

export interface ScreenChartTheme {
  kind: typeof ChartThemeKind.Screen;
  fontFamily: string;
  fontSizePx: number;
  titleFontSizePx: number;
  axisTitleStandoffPx: number;
  displayModeBar: "hover";
  responsive: true;
  displaylogo: false;
  zonePalette: ZonePaletteKindType;
}

export interface PublicationChartTheme {
  kind: typeof ChartThemeKind.Publication;
  column: PublicationColumn;
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
  zonePalette: ZonePaletteKindType;
}

export type ChartTheme = ScreenChartTheme | PublicationChartTheme;

export interface PublicationLegendStyle {
  fontFamily: string;
  fontSizePx: number;
  itemsizing: "constant";
  itemwidth: number;
  tracegroupgap: number;
  extraMarginPx: number;
}

export const screenChartTheme: ScreenChartTheme = {
  kind: ChartThemeKind.Screen,
  fontFamily: "Open Sans, verdana, arial, sans-serif",
  fontSizePx: 12,
  titleFontSizePx: 14,
  axisTitleStandoffPx: 12,
  displayModeBar: "hover",
  responsive: true,
  displaylogo: false,
  zonePalette: ZonePaletteKind.Screen,
};

/** Apply a zone palette (for example colour-blind) without changing type tokens. */
export function chartThemeWithZonePalette<T extends ChartTheme>(
  theme: T,
  zonePalette: ZonePaletteKindType,
): T {
  return { ...theme, zonePalette };
}

export function publicationChartThemeFor(
  column: PublicationColumn,
): PublicationChartTheme {
  const size = PUBLICATION_COLUMN_SIZE_MM[column];
  return {
    ...PUBLICATION_TYPE,
    column,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
  };
}

/** Default publication theme is the single-column profile. */
export const publicationChartTheme: PublicationChartTheme =
  publicationChartThemeFor(PublicationColumn.Single);

export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}

export function ptToPx(pt: number, dpi: number): number {
  return (pt / PT_PER_INCH) * dpi;
}

/**
 * Legend tokens for publication figures. Font stays 9 pt on both column
 * widths so Compare's three named markers remain readable.
 */
export function publicationLegendStyle(
  theme: PublicationChartTheme,
): PublicationLegendStyle {
  const isSingle = theme.column === PublicationColumn.Single;
  return {
    fontFamily: theme.fontFamily,
    fontSizePx: ptToPx(theme.fontPt, CHART_LAYOUT_DPI),
    itemsizing: "constant",
    itemwidth: isSingle ? 30 : 40,
    tracegroupgap: isSingle ? 6 : 10,
    extraMarginPx: Math.round(mmToPx(isSingle ? 14 : 10, CHART_LAYOUT_DPI)),
  };
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
