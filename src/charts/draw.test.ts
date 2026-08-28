import { describe, expect, it, vi } from "vitest";

import { ChartType } from "../catalog/chartTypes";
import { CalculationSource } from "../catalog/calculationMetadata";
import {
  ZonePaletteKind,
  ZoneToken,
  remapZoneFill,
  resolveZoneAppearance,
} from "../catalog/zoneTokens";
import { chartPayloadFromSpec } from "../engines/comfort/charts/toChartPayload";
import {
  PublicationColumn,
  chartThemeWithZonePalette,
  publicationChartTheme,
  publicationChartThemeFor,
  publicationLayoutSizePx,
  screenChartTheme,
} from "./chartTheme";
import type { PlotlyChartSpec } from "../engines/plotlyTypes";
import { assembleChart } from "./index";
import { loadPlotly, prepareFigure } from "./draw";
import type { ChartPayload } from "./types";

function blendHexForTest(foreground: string, background: string, opacity: number): string {
  const channel = (hex: string, shift: number) => (
    (Number.parseInt(hex.slice(1), 16) >> shift) & 255
  );
  const mix = (fg: number, bg: number) => Math.round(fg * opacity + bg * (1 - opacity));
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(mix(channel(foreground, 16), channel(background, 16)))}${
    toHex(mix(channel(foreground, 8), channel(background, 8)))
  }${toHex(mix(channel(foreground, 0), channel(background, 0)))}`;
}

function contourPayload(z: (number | null)[][]): ChartPayload {
  return {
    type: ChartType.Dynamic,
    input: {
      title: "Comfort chart",
      paperBgColor: "#fff",
      plotBgColor: "#fff",
      showlegend: false,
      margin: { l: 56, r: 16, t: 48, b: 52 },
      xAxis: { title: "Air temperature", range: [10, 40] },
      yAxis: { title: "Relative humidity", range: [0, 100] },
      fills: [
        {
          name: "Temperature field",
          x: z[0]?.map((_, index) => index) ?? [],
          y: z.map((_, index) => index),
          z,
          contours: { type: "levels", coloring: "heatmap" },
        },
      ],
      points: [],
    },
  };
}

describe("prepareFigure", () => {
  it("exposes restyle and Fx on the loaded Plotly module", async () => {
    const plotly = await loadPlotly();
    expect(typeof plotly.react).toBe("function");
    expect(typeof plotly.restyle).toBe("function");
    expect(typeof plotly.Fx?.hover).toBe("function");
    expect(typeof plotly.Fx?.loneHover).toBe("function");
  });

  it("turns non-finite grid z cells into Plotly gaps on a cloned grid", () => {
    const finiteRow = [1, 2];
    const gapRow = [3, Number.NaN, Number.POSITIVE_INFINITY];
    const z = [finiteRow, gapRow];
    const figure = prepareFigure(assembleChart(contourPayload(z)));
    const plotlyZ = figure.data[0].z as Array<Array<number | null>>;

    expect(plotlyZ).toEqual([
      [1, 2],
      [3, null, null],
    ]);
    expect(plotlyZ).not.toBe(z);
    expect(plotlyZ[0]).not.toBe(finiteRow);
    expect(z).toEqual([finiteRow, gapRow]);
  });

  it("clones an all-finite z grid so Plotly.react can own it", () => {
    const z = Array.from({ length: 20 }, (_, y) =>
      Array.from({ length: 20 }, (_, x) => x + y),
    );
    const figure = prepareFigure(assembleChart(contourPayload(z)));

    expect(figure.data[0].z).toEqual(z);
    expect(figure.data[0].z).not.toBe(z);
    expect((figure.data[0].z as number[][])[0]).not.toBe(z[0]);
  });

  it("does not stringify the figure", () => {
    const stringify = vi.spyOn(JSON, "stringify");
    prepareFigure(
      assembleChart(
        contourPayload([
          [1, Number.NaN],
          [3, 4],
        ]),
      ),
    );
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
  });

  it("clones scatter vertices but leaves NaN as line gaps", () => {
    const x = [0, Number.NaN, 1];
    const y = [10, 20, 30];
    const payload: ChartPayload = {
      type: ChartType.BodyTemperature,
      input: {
        title: "History",
        xAxis: { title: "Hours", range: [0, 1] },
        yAxis: { title: "Value", range: [0, 40] },
        series: [{ name: "Exposure", x, y, color: "#111111" }],
      },
    };
    const figure = prepareFigure(assembleChart(payload));

    expect(figure.data[0].x).not.toBe(x);
    expect(figure.data[0].y).not.toBe(y);
    expect(figure.data[0].x).toEqual([0, Number.NaN, 1]);
    expect((figure.data[0].x as number[])[1]).toBeNaN();
    expect(x[1]).toBeNaN();
  });

  it("maps hover customdata onto Plotly traces", () => {
    const payload: ChartPayload = {
      type: ChartType.Dynamic,
      input: {
        title: "Comfort chart",
        xAxis: { title: "X", range: [0, 1] },
        yAxis: { title: "Y", range: [0, 1] },
        fills: [],
        points: [
          {
            x: 24,
            y: 50,
            name: "Input 1",
            color: "#2563eb",
            hoverinfo: "all",
            hovertemplate: "%{customdata[0]}<extra></extra>",
            customdata: ["Input 1", 24, 50],
          },
        ],
      },
    };
    const figure = prepareFigure(assembleChart(payload));
    expect(figure.data[0].customdata).toEqual(["Input 1", 24, 50]);
    expect(figure.data[0].hovertemplate).toBe("%{customdata[0]}<extra></extra>");
    expect(figure.data[0].hoverinfo).toBe("all");
    expect(figure.data[0]).not.toHaveProperty("hoverMetadata");
    expect(figure.data[0]).not.toHaveProperty("isBackgroundZone");
  });

  it("does not apply publication layout size on the screen theme", () => {
    const figure = prepareFigure(assembleChart(contourPayload([[1]])));
    expect(figure.layout.width).toBeUndefined();
    expect(figure.layout.autosize).toBeUndefined();
    expect(figure.layout.font).toBeUndefined();
  });

  it("applies axis lines and outside ticks through Plotly layout.template", () => {
    const assembled = assembleChart(contourPayload([[1]]));
    const screen = prepareFigure(assembled, screenChartTheme);
    const publication = prepareFigure(assembled, publicationChartTheme);
    for (const figure of [screen, publication]) {
      const template = figure.layout.template as {
        layout: { xaxis: Record<string, unknown>; yaxis: Record<string, unknown> };
      };
      for (const axisKey of ["xaxis", "yaxis"] as const) {
        const axis = template.layout[axisKey];
        expect(axis.showline).toBe(true);
        expect(axis.linecolor).toBe("#111827");
        expect(axis.linewidth).toBe(1);
        expect(axis.ticks).toBe("outside");
        expect(axis.ticklen).toBe(4);
        expect(axis.tickwidth).toBe(1);
        expect(axis.tickcolor).toBe("#111827");
      }
      expect(figure.layout.xaxis).not.toHaveProperty("showline");
      expect(figure.layout.yaxis).not.toHaveProperty("showline");
    }
  });

  it("keeps dummy axes without tick marks while the template still draws lines", () => {
    const payload: ChartPayload = {
      type: ChartType.Set,
      input: {
        title: "SET",
        xAxis: { title: "Air temperature", range: [10, 40] },
        yAxis: { title: "", range: [0, 1], showticklabels: false },
        yAxis2: { title: "SET", range: [20, 30] },
        series: [{ name: "SET", x: [10, 40], y: [22, 28], color: "#111111" }],
      },
    };
    const figure = prepareFigure(assembleChart(payload));
    const yAxis = figure.layout.yaxis as Record<string, unknown>;
    const yAxis2 = figure.layout.yaxis2 as Record<string, unknown>;
    expect(yAxis.showticklabels).toBe(false);
    expect(yAxis.ticks).toBe("");
    expect(yAxis2.ticks).toBeUndefined();
    const template = figure.layout.template as {
      layout: { yaxis: Record<string, unknown> };
    };
    expect(template.layout.yaxis.showline).toBe(true);
    expect(template.layout.yaxis.ticks).toBe("outside");
  });

  it("builds a separate publication figure with mm/pt/dpi sizing", () => {
    const assembled = assembleChart(contourPayload([[1, 2], [3, 4]]));
    const screen = prepareFigure(assembled, screenChartTheme);
    const publication = prepareFigure(assembled, publicationChartTheme);
    const size = publicationLayoutSizePx();

    expect(publication.layout.width).toBe(size.width);
    expect(publication.layout.height).toBe(size.height);
    expect(publication.layout.autosize).toBe(false);
    expect(screen.layout.width).toBeUndefined();
  });

  it("keeps Compare legends readable at both publication column widths", () => {
    const payload: ChartPayload = {
      type: ChartType.Dynamic,
      input: {
        title: "Compare",
        showlegend: true,
        xAxis: { title: "X", range: [0, 1] },
        yAxis: { title: "Y", range: [0, 1] },
        fills: [],
        points: [
          { x: 0.2, y: 0.2, name: "Input 1", color: "#2563eb" },
          { x: 0.4, y: 0.4, name: "Input 2", color: "#dc2626" },
        ],
      },
    };
    const assembled = assembleChart(payload);
    const single = prepareFigure(
      assembled,
      publicationChartThemeFor(PublicationColumn.Single),
    );
    const double = prepareFigure(
      assembled,
      publicationChartThemeFor(PublicationColumn.Double),
    );
    expect(Number(double.layout.width)).toBeGreaterThan(Number(single.layout.width));
    expect(single.layout.legend).toBeDefined();
    expect(double.layout.legend).toBeDefined();
  });

  it("bakes translucent toself fills onto the plot background so band seams stay closed", () => {
    const fill = resolveZoneAppearance(ZoneToken.Warm).fill;
    const plotBg = "#f8fafc";
    const payload: ChartPayload = {
      type: ChartType.Adaptive,
      input: {
        title: "Bands",
        plotBgColor: plotBg,
        xAxis: { title: "X", range: [0, 1] },
        yAxis: { title: "Y", range: [0, 1] },
        regions: [
          {
            name: "Warm",
            x: [0, 1, 1, 0],
            y: [0, 0, 1, 1],
            fillcolor: fill,
            linecolor: fill,
            linewidth: 1.5,
            opacity: 0.8,
          },
        ],
        points: [],
      },
    };
    const figure = prepareFigure(assembleChart(payload));
    const line = figure.data[0].line as { color?: string; width?: number };
    const baked = blendHexForTest(fill, plotBg, 0.8);

    expect(figure.data[0].opacity).toBe(1);
    expect(figure.data[0].fillcolor).toBe(baked);
    expect(line.color).toBe(baked);
    expect(line.width).toBe(1.5);
  });

  it("remaps zone fills for publication and colour-blind palettes", () => {
    const fill = resolveZoneAppearance(ZoneToken.Neutral).fill;
    const payload: ChartPayload = {
      type: ChartType.Adaptive,
      input: {
        title: "Adaptive",
        xAxis: { title: "X", range: [0, 1] },
        yAxis: { title: "Y", range: [0, 1] },
        regions: [
          {
            name: "Neutral",
            x: [0, 1, 1, 0],
            y: [0, 0, 1, 1],
            fillcolor: fill,
          },
        ],
        points: [],
      },
    };
    const assembled = assembleChart(payload);
    const publication = prepareFigure(assembled, publicationChartTheme);
    const colourBlind = prepareFigure(
      assembled,
      chartThemeWithZonePalette(screenChartTheme, ZonePaletteKind.ColourBlind),
    );
    expect(publication.data[0].fillcolor).toBe(
      remapZoneFill(fill, ZonePaletteKind.Publication),
    );
    expect(colourBlind.data[0].fillcolor).toBe(
      remapZoneFill(fill, ZonePaletteKind.ColourBlind),
    );
  });

  it("defaults omitted contour line width to 0 so Plotly does not stroke fills", () => {
    const figure = prepareFigure(assembleChart(contourPayload([[1, 2], [3, 4]])));
    expect(figure.data[0].line).toEqual({ width: 0 });
  });

  it("keeps an explicit contour boundary line", () => {
    const payload = contourPayload([[1, 2], [3, 4]]);
    if (payload.type !== ChartType.Dynamic) {
      throw new Error("expected Dynamic payload");
    }
    const fills = payload.input.fills;
    if (!fills?.[0]) {
      throw new Error("expected a Dynamic fill");
    }
    fills[0] = {
      ...fills[0],
      line: { width: 1, color: "#333333" },
    };
    const figure = prepareFigure(assembleChart(payload));
    expect(figure.data[0].line).toEqual({ width: 1, color: "#333333" });
  });

  it("copies bind contour line through ChartPayload into the figure", () => {
    const spec: PlotlyChartSpec = {
      traces: [
        {
          type: "contour",
          name: "Fill",
          x: [0, 1],
          y: [0, 1],
          z: [[1, 2], [3, 4]],
          contours: {
            type: "constraint",
            operation: ">=",
            value: 0,
            coloring: "none",
            showlines: false,
          },
          line: { width: 0 },
        },
        {
          type: "contour",
          name: "Boundary",
          x: [0, 1],
          y: [0, 1],
          z: [[1, 2], [3, 4]],
          contours: {
            type: "constraint",
            operation: "=",
            value: 1,
            coloring: "none",
            showlines: true,
          },
          line: { width: 1, color: "#333333" },
        },
      ],
      layout: {
        title: "Test",
        paper_bgcolor: "#fff",
        plot_bgcolor: "#fff",
        showlegend: false,
        margin: { l: 1, r: 1, t: 1, b: 1 },
        xaxis: { title: "X", range: [0, 1] },
        yaxis: { title: "Y", range: [0, 1] },
      },
      annotations: [],
      source: CalculationSource.FrontendGenerated,
    };
    const figure = prepareFigure(
      assembleChart(chartPayloadFromSpec(ChartType.Dynamic, spec)),
    );
    expect(figure.data[0].line).toEqual({ width: 0 });
    expect(figure.data[1].line).toEqual({ width: 1, color: "#333333" });
  });
});
