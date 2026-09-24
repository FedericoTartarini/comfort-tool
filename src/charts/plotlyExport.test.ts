import { afterEach, describe, expect, it, vi } from "vitest";

import { ChartType } from "../catalog/chartTypes";
import type { ChartPayload } from "./types";
import {
  PublicationColumn,
  publicationChartThemeFor,
  publicationImageSize,
} from "./chartTheme";
import {
  chartExportFilename,
  downloadPublicationChart,
  publicationExportMenuItems,
  publicationToImageOptions,
} from "./plotlyExport";

function contourChart(): ChartPayload {
  return {
    type: ChartType.Dynamic,
    input: {
      title: "PMV ASHRAE 55 Dynamic Chart (PMV)",
      paperBgColor: "#fff",
      plotBgColor: "#fff",
      showlegend: false,
      margin: { l: 56, r: 16, t: 48, b: 52 },
      xAxis: { title: "Air temperature", range: [10, 40] },
      yAxis: { title: "Relative humidity", range: [0, 100] },
      fills: [
        {
          name: "Temperature field",
          x: [0, 1],
          y: [0, 1],
          z: [
            [1, 2],
            [3, 4],
          ],
          contours: { type: "levels", coloring: "heatmap" },
        },
      ],
      points: [],
    },
  };
}

describe("plotlyExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("slugifies the chart title and column for download filenames", () => {
    expect(chartExportFilename(contourChart())).toBe(
      "pmv-ashrae-55-dynamic-chart-pmv-single",
    );
    expect(
      chartExportFilename(contourChart(), PublicationColumn.Double),
    ).toBe("pmv-ashrae-55-dynamic-chart-pmv-double");
  });

  it("lists single- and double-column PNG and SVG export profiles", () => {
    expect(publicationExportMenuItems).toEqual([
      {
        format: "png",
        column: PublicationColumn.Single,
        label: "PNG, single column",
      },
      {
        format: "png",
        column: PublicationColumn.Double,
        label: "PNG, double column",
      },
      {
        format: "svg",
        column: PublicationColumn.Single,
        label: "SVG, single column",
      },
      {
        format: "svg",
        column: PublicationColumn.Double,
        label: "SVG, double column",
      },
    ]);
  });

  it("gives PNG and SVG the same layout size, with PNG scaled to 300 DPI", () => {
    const png = publicationToImageOptions("png");
    const svg = publicationToImageOptions("svg");
    const geometry = publicationImageSize("png");

    expect(png).toEqual({
      format: "png",
      width: geometry.width,
      height: geometry.height,
      scale: geometry.scale,
    });
    expect(svg).toEqual({
      format: "svg",
      width: png.width,
      height: png.height,
      scale: 1,
    });
  });

  it("exports from a dedicated publication figure, not the on-screen graph div", async () => {
    const toImage = vi.fn().mockResolvedValue("data:image/png;base64,aaa");
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe(
          "pmv-ashrae-55-dynamic-chart-pmv-single.png",
        );
      });
    const graphDiv = document.createElement("div");
    document.body.appendChild(graphDiv);

    await downloadPublicationChart({ toImage }, contourChart(), "png");

    expect(toImage).toHaveBeenCalledOnce();
    const [figure, options] = toImage.mock.calls[0];
    expect(figure).not.toBeInstanceOf(HTMLElement);
    expect(figure).not.toBe(graphDiv);
    expect(Array.isArray(figure.data)).toBe(true);
    expect(figure.layout.width).toBe(publicationImageSize("png").width);
    expect(figure.config.displayModeBar).toBe(false);
    expect(options).toEqual(publicationToImageOptions("png"));
    expect(click).toHaveBeenCalledOnce();
    expect(document.body.querySelector("a[download]")).toBeNull();

    graphDiv.remove();
  });

  it("downloads SVG from the same publication figure geometry", async () => {
    const toImage = vi.fn().mockResolvedValue("data:image/svg+xml,<svg></svg>");
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe(
          "pmv-ashrae-55-dynamic-chart-pmv-single.svg",
        );
      });

    await downloadPublicationChart({ toImage }, contourChart(), "svg");

    const [figure, options] = toImage.mock.calls[0];
    expect(figure).not.toBeInstanceOf(HTMLElement);
    expect(figure.config.displayModeBar).toBe(false);
    expect(options).toEqual(publicationToImageOptions("svg"));
    expect(options.width).toBe(publicationToImageOptions("png").width);
    expect(options.height).toBe(publicationToImageOptions("png").height);
    expect(click).toHaveBeenCalledOnce();
  });

  it("exports double column on the same theme as a wider dedicated figure", async () => {
    const toImage = vi.fn().mockResolvedValue("data:image/png;base64,aaa");
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe(
          "pmv-ashrae-55-dynamic-chart-pmv-double.png",
        );
      });
    const doubleTheme = publicationChartThemeFor(PublicationColumn.Double);
    const singleTheme = publicationChartThemeFor(PublicationColumn.Single);

    await downloadPublicationChart(
      { toImage },
      contourChart(),
      "png",
      PublicationColumn.Double,
    );

    const [figure, options] = toImage.mock.calls[0];
    expect(figure).not.toBeInstanceOf(HTMLElement);
    expect(figure.layout.width).toBe(
      publicationImageSize("png", doubleTheme).width,
    );
    expect(figure.layout.width).toBeGreaterThan(
      publicationImageSize("png", singleTheme).width,
    );
    expect(figure.layout.font.family).toBe(singleTheme.fontFamily);
    expect(figure.layout.font.size).toBe(12);
    expect(figure.config.displayModeBar).toBe(false);
    expect(options).toEqual(publicationToImageOptions("png", doubleTheme));
    expect(click).toHaveBeenCalledOnce();
  });
});
