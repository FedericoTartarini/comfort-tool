import { describe, expect, it } from "vitest";

import {
  CHART_LAYOUT_DPI,
  ChartThemeKind,
  MM_PER_INCH,
  PUBLICATION_DPI,
  mmToPx,
  publicationChartTheme,
  publicationImageSize,
  publicationLayoutSizePx,
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
    expect(publicationChartTheme.displayModeBar).toBe(false);
    expect(publicationChartTheme.responsive).toBe(false);
    expect(publicationChartTheme.dpi).toBe(PUBLICATION_DPI);
    expect(publicationChartTheme.dpi).toBe(300);
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

  it("uses CSS pixels for layout so 120 mm is a finite plot width", () => {
    const { width, height } = publicationLayoutSizePx();
    expect(width).toBe(Math.round((120 / MM_PER_INCH) * CHART_LAYOUT_DPI));
    expect(height).toBe(Math.round((90 / MM_PER_INCH) * CHART_LAYOUT_DPI));
    expect(width).toBeGreaterThan(400);
    expect(height).toBeGreaterThan(300);
  });
});
