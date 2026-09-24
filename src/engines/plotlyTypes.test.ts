import { describe, expectTypeOf, it } from "vitest";

import type {
  PlotContourTrace,
  PlotLayout,
  PlotScatterLineTrace,
  PlotScatterMarkerTrace,
  PlotTrace,
} from "./plotlyTypes";

describe("PlotlyChartSpec types", () => {
  it("discriminates each supported trace shape", () => {
    expectTypeOf<
      Extract<PlotTrace, { type: "contour" }>
    >().toEqualTypeOf<PlotContourTrace>();
    expectTypeOf<
      Extract<PlotTrace, { type: "scatter"; mode: "markers" }>
    >().toEqualTypeOf<PlotScatterMarkerTrace>();
    expectTypeOf<
      Extract<PlotTrace, { type: "scatter"; mode: "lines" }>
    >().toEqualTypeOf<PlotScatterLineTrace>();
  });

  it("rejects unsupported trace and layout properties", () => {
    // @ts-expect-error Heatmap is a contour coloring mode, not a supported trace.
    const unsupportedHeatmap: PlotTrace = { type: "heatmap" };
    const markerWithGrid: PlotScatterMarkerTrace = {
      type: "scatter",
      mode: "markers",
      name: "Input 1",
      x: [24],
      y: [50],
      marker: {},
      // @ts-expect-error Marker traces cannot carry a contour grid.
      z: [[1]],
    };
    const markerWithObjectMetadata: PlotScatterMarkerTrace = {
      type: "scatter",
      mode: "markers",
      name: "Input 1",
      x: [24],
      y: [50],
      marker: {},
      hoverMetadata: [
        // @ts-expect-error Customdata values are limited to supported primitives.
        { arbitrary: true },
      ],
    };
    const layoutWithLooseAxis: PlotLayout = {
      title: "Chart",
      paper_bgcolor: "#fff",
      plot_bgcolor: "#fff",
      showlegend: false,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      xaxis: {
        title: "X",
        range: [0, 1],
        // @ts-expect-error Arbitrary Plotly axis keys do not cross the PlotlyChartSpec boundary.
        arbitrary: true,
      },
      yaxis: { title: "Y", range: [0, 1] },
    };

    void unsupportedHeatmap;
    void markerWithGrid;
    void markerWithObjectMetadata;
    void layoutWithLooseAxis;
  });
});
