import { describe, expect, it } from "vitest";

import { CalculationSource } from "../models/calculationMetadata";
import type { PlotlyChartResponseDto } from "../models/comfortDtos";
import { toPlotlyFigure } from "./plotlyFigure";

describe("toPlotlyFigure", () => {
  it("maps internal chart metadata at the isolated Plotly boundary", () => {
    const chart: PlotlyChartResponseDto = {
      traces: [
        {
          type: "scatter",
          mode: "markers",
          name: "Input 1",
          x: [24],
          y: [50],
          marker: { color: "#2563eb", size: 10 },
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
          hoverMetadata: [[["gap"]]],
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
    expect(figure.data[1].customdata).toEqual([[["gap"]]]);
    expect(figure.data[1].z).toEqual([[null]]);
    expect(figure.config).toEqual({
      responsive: true,
      displaylogo: false,
      displayModeBar: "hover",
    });

    for (const trace of figure.data) {
      expect(trace).not.toHaveProperty("hoverMetadata");
      expect(trace).not.toHaveProperty("isBackgroundZone");
    }

    (figure.data[0].x as number[])[0] = 30;
    expect(chart.traces[0].x).toEqual([24]);
    expect(chart.traces[0]).toHaveProperty("hoverMetadata");
    expect(chart.traces[0]).toHaveProperty("isBackgroundZone", true);
  });
});
