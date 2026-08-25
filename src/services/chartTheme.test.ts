import { describe, expect, it } from "vitest";

import {
  CHART_LAYOUT_DPI,
  ChartThemeKind,
  MM_PER_INCH,
  PUBLICATION_COLUMN_SIZE_MM,
  PUBLICATION_DPI,
  PublicationColumn,
  mmToPx,
  publicationChartTheme,
  publicationChartThemeFor,
  publicationImageSize,
  publicationLayoutSizePx,
  publicationLegendStyle,
  publicationRasterScale,
  ptToPx,
  screenChartTheme,
} from "./chartTheme";

describe("chartTheme", () => {
  it("keeps screen interactive and publication print-sized", () => {
    expect(screenChartTheme.kind).toBe(ChartThemeKind.Screen);
    expect(screenChartTheme.displayModeBar).toBe("hover");
    expect(screenChartTheme.responsive).toBe(true);

    expect(publicationChartTheme.kind).toBe(ChartThemeKind.Publication);
    expect(publicationChartTheme.column).toBe(PublicationColumn.Single);
    expect(publicationChartTheme.displayModeBar).toBe(false);
    expect(publicationChartTheme.responsive).toBe(false);
    expect(publicationChartTheme.dpi).toBe(PUBLICATION_DPI);
    expect(publicationChartTheme.dpi).toBe(300);
  });

  it("keeps single and double column on the same publication type tokens", () => {
    const single = publicationChartThemeFor(PublicationColumn.Single);
    const double = publicationChartThemeFor(PublicationColumn.Double);

    expect(single.column).toBe(PublicationColumn.Single);
    expect(double.column).toBe(PublicationColumn.Double);
    expect(single.widthMm).toBe(PUBLICATION_COLUMN_SIZE_MM.single.widthMm);
    expect(double.widthMm).toBe(PUBLICATION_COLUMN_SIZE_MM.double.widthMm);
    expect(double.widthMm).toBeGreaterThan(single.widthMm);
    expect(single.widthMm).toBe(90);
    expect(double.widthMm).toBe(190);

    expect(double.kind).toBe(single.kind);
    expect(double.fontFamily).toBe(single.fontFamily);
    expect(double.fontPt).toBe(single.fontPt);
    expect(double.titleFontPt).toBe(single.titleFontPt);
    expect(double.axisTitleStandoffPt).toBe(single.axisTitleStandoffPt);
    expect(double.dpi).toBe(single.dpi);
    expect(double.displayModeBar).toBe(false);
    expect(double.responsive).toBe(false);
    expect(publicationChartTheme).toEqual(single);
  });

  it("converts publication millimetres and points through explicit dpi", () => {
    expect(mmToPx(25.4, 96)).toBeCloseTo(96);
    expect(ptToPx(72, 96)).toBeCloseTo(96);
    expect(ptToPx(publicationChartTheme.fontPt, CHART_LAYOUT_DPI)).toBe(12);
  });

  it("sizes PNG at ~300 DPI of the publication millimetre geometry", () => {
    const png = publicationImageSize("png");
    const expectedWidth = mmToPx(
      publicationChartTheme.widthMm,
      PUBLICATION_DPI,
    );
    const expectedHeight = mmToPx(
      publicationChartTheme.heightMm,
      PUBLICATION_DPI,
    );

    expect(publicationRasterScale()).toBe(PUBLICATION_DPI / CHART_LAYOUT_DPI);
    expect(png.scale).toBe(PUBLICATION_DPI / CHART_LAYOUT_DPI);
    // Layout width is rounded to a CSS pixel; raster size stays within 2 px of
    // the exact millimetre × 300 DPI product.
    expect(Math.abs(png.width * png.scale - expectedWidth)).toBeLessThan(2);
    expect(Math.abs(png.height * png.scale - expectedHeight)).toBeLessThan(2);
  });

  it("exports SVG at the same layout geometry without raster scale", () => {
    const png = publicationImageSize("png");
    const svg = publicationImageSize("svg");
    const layout = publicationLayoutSizePx();

    expect(svg.width).toBe(png.width);
    expect(svg.height).toBe(png.height);
    expect(svg.width).toBe(layout.width);
    expect(svg.height).toBe(layout.height);
    expect(svg.scale).toBe(1);
    expect(png.scale).toBeGreaterThan(1);
  });

  it("uses CSS pixels for layout so each column width is a finite plot width", () => {
    const single = publicationLayoutSizePx(
      publicationChartThemeFor(PublicationColumn.Single),
    );
    const double = publicationLayoutSizePx(
      publicationChartThemeFor(PublicationColumn.Double),
    );

    expect(single.width).toBe(Math.round((90 / MM_PER_INCH) * CHART_LAYOUT_DPI));
    expect(single.height).toBe(Math.round((90 / MM_PER_INCH) * CHART_LAYOUT_DPI));
    expect(double.width).toBe(
      Math.round((190 / MM_PER_INCH) * CHART_LAYOUT_DPI),
    );
    expect(double.height).toBe(
      Math.round((142.5 / MM_PER_INCH) * CHART_LAYOUT_DPI),
    );
    expect(single.width).toBeGreaterThan(300);
    expect(double.width).toBeGreaterThan(single.width);
  });

  it("keeps Compare legend type at 9 pt on both column widths", () => {
    const single = publicationLegendStyle(
      publicationChartThemeFor(PublicationColumn.Single),
    );
    const double = publicationLegendStyle(
      publicationChartThemeFor(PublicationColumn.Double),
    );

    expect(single.fontSizePx).toBe(12);
    expect(double.fontSizePx).toBe(single.fontSizePx);
    expect(single.fontFamily).toBe(double.fontFamily);
    expect(single.itemsizing).toBe("constant");
    expect(double.itemsizing).toBe("constant");
    expect(single.extraMarginPx).toBeGreaterThan(0);
  });
});
