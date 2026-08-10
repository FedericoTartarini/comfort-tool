import { describe, expectTypeOf, it } from "vitest";

import type {
  PlotContourTraceDto,
  PlotLayoutDto,
  PlotScatterLineTraceDto,
  PlotScatterMarkerTraceDto,
  PlotTraceDto,
} from "./comfortDtos";

describe("comfort DTO types", () => {
  it("discriminates each supported trace shape", () => {
    expectTypeOf<
      Extract<PlotTraceDto, { type: "contour" }>
    >().toEqualTypeOf<PlotContourTraceDto>();
    expectTypeOf<
      Extract<PlotTraceDto, { type: "scatter"; mode: "markers" }>
    >().toEqualTypeOf<PlotScatterMarkerTraceDto>();
    expectTypeOf<
      Extract<PlotTraceDto, { type: "scatter"; mode: "lines" }>
    >().toEqualTypeOf<PlotScatterLineTraceDto>();
  });

  it("rejects unsupported trace and layout properties", () => {
    // @ts-expect-error Heatmap is a contour coloring mode, not a supported trace.
    const unsupportedHeatmap: PlotTraceDto = { type: "heatmap" };
    const markerWithGrid: PlotScatterMarkerTraceDto = {
      type: "scatter",
      mode: "markers",
      name: "Input 1",
      x: [24],
      y: [50],
      marker: {},
      // @ts-expect-error Marker traces cannot carry a contour grid.
      z: [[1]],
    };
    const markerWithObjectMetadata: PlotScatterMarkerTraceDto = {
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
    const layoutWithLooseAxis: PlotLayoutDto = {
      title: "Chart",
      paper_bgcolor: "#fff",
      plot_bgcolor: "#fff",
      showlegend: false,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      xaxis: {
        title: "X",
        range: [0, 1],
        // @ts-expect-error Arbitrary Plotly axis keys do not cross the DTO boundary.
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
