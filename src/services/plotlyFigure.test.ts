import { describe, expect, it, vi } from "vitest";

import { CalculationSource } from "../models/calculationMetadata";
import type { PlotlyChartResponseDto } from "../models/comfortDtos";
import { toPlotlyFigure } from "./plotlyFigure";

function contourChart(
  z: number[][],
  extras: Partial<PlotlyChartResponseDto> = {},
): PlotlyChartResponseDto {
  return {
    traces: [
      {
        type: "contour",
        name: "Temperature field",
        x: z[0]?.map((_, index) => index) ?? [],
        y: z.map((_, index) => index),
        z,
        contours: { type: "levels", coloring: "heatmap" },
      },
    ],
    layout: {
      title: "Comfort chart",
      paper_bgcolor: "#fff",
      plot_bgcolor: "#fff",
      showlegend: false,
      margin: { l: 56, r: 16, t: 48, b: 52 },
      xaxis: { title: "Air temperature", range: [10, 40] },
      yaxis: { title: "Relative humidity", range: [0, 100] },
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
    ...extras,
  };
}

describe("toPlotlyFigure", () => {
  it("maps internal chart metadata at the isolated Plotly boundary", () => {
    const hoverMetadata: Array<Array<Array<string>>> = [[["gap"]]];
    const chart: PlotlyChartResponseDto = {
      traces: [
        {
          type: "scatter",
          mode: "markers",
          name: "Input 1",
          x: [24],
          y: [50],
          marker: {
            color: "#2563eb",
            size: 10,
            line: { color: "#000000", width: 1.5 },
          },
          hoverMetadata: ["Input 1", 24, 50],
          isBackgroundZone: true,
        },
        {
          type: "contour",
          name: "Temperature field",
          x: [20],
          y: [40],
          z: [[Number.NaN]],
          contours: { type: "levels", coloring: "heatmap" },
          hoverMetadata,
        },
      ],
      layout: {
        title: "Comfort chart",
        paper_bgcolor: "#fff",
        plot_bgcolor: "#fff",
        showlegend: false,
        margin: { l: 56, r: 16, t: 48, b: 52 },
        xaxis: { title: "Air temperature", range: [10, 40] },
        yaxis: { title: "Relative humidity", range: [0, 100] },
        legend: { orientation: "h", x: 0.5, y: 1.08 },
      },
      annotations: [
        {
          x: 24,
          y: 50,
          text: "Input 1",
          showarrow: false,
          font: { size: 8, color: "#1f2937" },
        },
      ],
      source: CalculationSource.FrontendGenerated,
    };

    const figure = toPlotlyFigure(chart);

    expect(figure.layout.title).toEqual({ text: "Comfort chart" });
    expect(figure.layout.xaxis.title).toEqual({
      text: "Air temperature",
      standoff: 12,
    });
    expect(figure.layout.yaxis.title).toEqual({
      text: "Relative humidity",
      standoff: 12,
    });
    expect(figure.data[0].customdata).toEqual(["Input 1", 24, 50]);
    expect(figure.data[1].customdata).toBe(hoverMetadata);
    expect(figure.data[1].z).toEqual([[null]]);
    expect(figure.data[1].z).not.toBe(chart.traces[1].z);
    expect(figure.data[0].x).not.toBe(chart.traces[0].x);
    expect(figure.data[0].y).not.toBe(chart.traces[0].y);
    expect(figure.config).toEqual({
      responsive: true,
      displaylogo: false,
      displayModeBar: "hover",
    });

    for (const trace of figure.data) {
      expect(trace).not.toHaveProperty("hoverMetadata");
      expect(trace).not.toHaveProperty("isBackgroundZone");
    }

    figure.data[0].name = "mutated";
    figure.data[0].uid = "plotly-owned";
    (figure.data[0].marker as { size: number }).size = 99;
    figure.layout.margin.t = 0;
    figure.layout.xaxis.range[0] = -99;
    figure.layout.annotations[0].text = "mutated";
    figure.layout.annotations[0].font.size = 1;
    figure.layout.legend = { orientation: "v" };

    expect(chart.traces[0].name).toBe("Input 1");
    expect(chart.traces[0]).not.toHaveProperty("uid");
    expect(chart.traces[0].marker).toEqual({
      color: "#2563eb",
      size: 10,
      line: { color: "#000000", width: 1.5 },
    });
    expect(chart.traces[0]).toHaveProperty("hoverMetadata");
    expect(chart.traces[0]).toHaveProperty("isBackgroundZone", true);
    expect(chart.layout.margin.t).toBe(48);
    expect(chart.layout.xaxis.range).toEqual([10, 40]);
    expect(chart.annotations[0]).toEqual({
      x: 24,
      y: 50,
      text: "Input 1",
      showarrow: false,
      font: { size: 8, color: "#1f2937" },
    });
    expect(chart.layout.legend).toEqual({ orientation: "h", x: 0.5, y: 1.08 });
  });

  it("turns non-finite grid z cells into Plotly gaps on a cloned grid", () => {
    const finiteRow = [1, 2];
    const gapRow = [3, Number.NaN, Number.POSITIVE_INFINITY];
    const z = [finiteRow, gapRow];
    const figure = toPlotlyFigure(contourChart(z));
    const plotlyZ = figure.data[0].z as Array<Array<number | null>>;

    expect(plotlyZ).toEqual([
      [1, 2],
      [3, null, null],
    ]);
    expect(plotlyZ).not.toBe(z);
    expect(plotlyZ[0]).not.toBe(finiteRow);
    expect(plotlyZ[1]).not.toBe(gapRow);
    expect(z).toEqual([finiteRow, gapRow]);
    expect(gapRow).toEqual([3, Number.NaN, Number.POSITIVE_INFINITY]);
  });

  it("clones an all-finite z grid so Plotly.react can own it", () => {
    const z = Array.from({ length: 100 }, (_, y) =>
      Array.from({ length: 100 }, (_, x) => x + y),
    );
    const figure = toPlotlyFigure(contourChart(z));

    expect(figure.data[0].z).toEqual(z);
    expect(figure.data[0].z).not.toBe(z);
    expect((figure.data[0].z as number[][])[0]).not.toBe(z[0]);
  });

  it("does not stringify the figure", () => {
    const stringify = vi.spyOn(JSON, "stringify");
    toPlotlyFigure(
      contourChart([
        [1, Number.NaN],
        [3, 4],
      ]),
    );
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
  });

  it("clones scatter vertices but leaves NaN as line gaps", () => {
    const x = [0, Number.NaN, 1];
    const y = [10, 20, 30];
    const chart: PlotlyChartResponseDto = {
      traces: [
        {
          type: "scatter",
          mode: "lines",
          name: "Exposure",
          x,
          y,
          line: { color: "#111111", width: 1.2 },
          marker: {},
        },
      ],
      layout: {
        title: "History",
        paper_bgcolor: "#fff",
        plot_bgcolor: "#fff",
        showlegend: false,
        margin: { l: 40, r: 16, t: 40, b: 40 },
        xaxis: { title: "Hours", range: [0, 1] },
        yaxis: { title: "Value", range: [0, 40] },
      },
      annotations: [],
      source: CalculationSource.FrontendGenerated,
    };

    const figure = toPlotlyFigure(chart);

    expect(figure.data[0].x).not.toBe(x);
    expect(figure.data[0].y).not.toBe(y);
    expect(figure.data[0].x).toEqual([0, Number.NaN, 1]);
    expect((figure.data[0].x as number[])[1]).toBeNaN();
    expect(x[1]).toBeNaN();
  });
});
