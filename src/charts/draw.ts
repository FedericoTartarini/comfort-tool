import { remapZoneFill } from "../catalog/zoneTokens";
import {
  ChartThemeKind,
  publicationLayoutSizePx,
  publicationLegendStyle,
  ptToPx,
  screenChartTheme,
  CHART_LAYOUT_DPI,
  type ChartTheme,
  type PublicationChartTheme,
} from "./chartTheme";
import type { AssembleResult } from "./types";

export type PlotlyModule = {
  react: (
    root: HTMLElement,
    data: unknown[],
    layout: Record<string, unknown>,
    config: Record<string, unknown>,
  ) => Promise<void>;
  purge: (root: HTMLElement) => void;
  toImage: (
    figure: {
      data: unknown[];
      layout: Record<string, unknown>;
      config: Record<string, unknown>;
    },
    options: {
      format: "png" | "svg";
      width: number;
      height: number;
      scale: number;
    },
  ) => Promise<string>;
  Plots?: {
    resize: (root: HTMLElement) => Promise<void> | void;
  };
  restyle?: (
    root: HTMLElement,
    update: Record<string, unknown>,
    traces?: number | number[],
  ) => Promise<void> | void;
  addTraces?: (
    root: HTMLElement,
    traces: unknown | unknown[],
    newIndices?: number | number[],
  ) => Promise<void> | void;
  Fx?: {
    hover: (root: HTMLElement, hoverData: unknown, axes?: string) => void;
    unhover: (root: HTMLElement) => void;
    loneHover?: (item: unknown, options?: unknown) => void;
    loneUnhover?: (root: HTMLElement) => void;
  };
};

let plotlyModule: PlotlyModule | null = null;

export async function loadPlotly(): Promise<PlotlyModule> {
  if (plotlyModule) return plotlyModule;
  const imported = (await import("plotly.js-dist-min")) as PlotlyModule & {
    default?: PlotlyModule;
  };
  const plotly = imported.default ?? imported;
  if (!plotly.Fx && imported.Fx) plotly.Fx = imported.Fx;
  if (!plotly.restyle && imported.restyle) plotly.restyle = imported.restyle;
  if (!plotly.addTraces && imported.addTraces) plotly.addTraces = imported.addTraces;
  plotlyModule = plotly;
  return plotlyModule;
}

function withNullGaps(z: unknown): unknown {
  if (!Array.isArray(z)) return z;
  if (z.length > 0 && Array.isArray(z[0])) {
    return (z as unknown[][]).map((row) =>
      row.map((value) =>
        typeof value === "number" && Number.isFinite(value) ? value : null,
      ),
    );
  }
  return (z as unknown[]).map((value) =>
    typeof value === "number" && Number.isFinite(value) ? value : null,
  );
}

function parseHexRgb(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function blendHexOnto(
  foreground: string,
  background: string,
  opacity: number,
): string | null {
  const fg = parseHexRgb(foreground);
  const bg = parseHexRgb(background);
  if (!fg || !bg) return null;
  const mix = (channel: number, bgChannel: number) =>
    Math.round(channel * opacity + bgChannel * (1 - opacity));
  const toHex = (channel: number) => channel.toString(16).padStart(2, "0");
  return `#${toHex(mix(fg[0], bg[0]))}${toHex(mix(fg[1], bg[1]))}${toHex(mix(fg[2], bg[2]))}`;
}

function bakeOpaquePolygonFill(
  trace: Record<string, unknown>,
  plotBg: string,
): void {
  if (trace.fill !== "toself") return;
  const opacity = trace.opacity;
  if (typeof opacity !== "number" || !(opacity < 1)) return;
  if (typeof trace.fillcolor !== "string") return;
  const fill = blendHexOnto(trace.fillcolor, plotBg, opacity);
  if (fill === null) return;
  trace.fillcolor = fill;
  const line =
    trace.line && typeof trace.line === "object"
      ? ({ ...(trace.line as object) } as Record<string, unknown>)
      : {};
  if (typeof line.color === "string") {
    line.color = blendHexOnto(line.color, plotBg, opacity) ?? line.color;
  } else {
    line.color = fill;
  }
  trace.line = line;
  trace.opacity = 1;
}

function cloneTrace(
  trace: Record<string, unknown>,
  theme: ChartTheme,
  plotBg: string,
): Record<string, unknown> {
  const cloned: Record<string, unknown> = { ...trace };
  if (Array.isArray(cloned.x)) cloned.x = cloned.x.slice();
  if (Array.isArray(cloned.y)) cloned.y = cloned.y.slice();
  if (Array.isArray(cloned.z)) cloned.z = withNullGaps(cloned.z);
  if (Array.isArray(cloned.text)) {
    cloned.text = Array.isArray(cloned.text[0])
      ? (cloned.text as unknown[][]).map((row) => row.slice())
      : cloned.text.slice();
  }
  if (typeof cloned.fillcolor === "string") {
    cloned.fillcolor = remapZoneFill(cloned.fillcolor, theme.zonePalette);
  }
  if (Array.isArray(cloned.colorscale)) {
    cloned.colorscale = (cloned.colorscale as Array<[number, string]>).map(
      ([stop, color]) => [stop, remapZoneFill(color, theme.zonePalette)],
    );
  }
  if (cloned.marker && typeof cloned.marker === "object") {
    cloned.marker = { ...(cloned.marker as object) };
  }
  if (cloned.line && typeof cloned.line === "object") {
    const line = { ...(cloned.line as object) } as Record<string, unknown>;
    if (typeof line.color === "string") {
      line.color = remapZoneFill(line.color, theme.zonePalette);
    }
    cloned.line = line;
  }
  if (cloned.contours && typeof cloned.contours === "object") {
    cloned.contours = { ...(cloned.contours as object) };
  }
  bakeOpaquePolygonFill(cloned, plotBg);
  return cloned;
}

const AXIS_LINE_COLOR = "#111827";

const AXIS_CHROME = {
  showline: true,
  linecolor: AXIS_LINE_COLOR,
  linewidth: 1,
  ticks: "outside",
  ticklen: 4,
  tickwidth: 1,
  tickcolor: AXIS_LINE_COLOR,
  tickformat: ".2~f",
} as const;

/** Plotly layout.template: axis lines, ticks, and a shared hover label (not simple_white). */
const AXIS_CHROME_TEMPLATE = {
  layout: {
    xaxis: AXIS_CHROME,
    yaxis: AXIS_CHROME,
    hoverlabel: {
      bgcolor: "#ffffff",
      bordercolor: AXIS_LINE_COLOR,
      font: { color: AXIS_LINE_COLOR },
    },
  },
};

function applyPublicationLayout(
  layout: Record<string, unknown>,
  theme: PublicationChartTheme,
): void {
  const { width, height } = publicationLayoutSizePx(theme);
  const fontSize = ptToPx(theme.fontPt, CHART_LAYOUT_DPI);
  const titleFontSize = ptToPx(theme.titleFontPt, CHART_LAYOUT_DPI);
  layout.width = width;
  layout.height = height;
  layout.autosize = false;
  layout.font = { family: theme.fontFamily, size: fontSize };
  if (layout.title && typeof layout.title === "object") {
    layout.title = {
      ...(layout.title as object),
      font: { family: theme.fontFamily, size: titleFontSize },
    };
  }
  if (layout.showlegend === false) return;
  const legendStyle = publicationLegendStyle(theme);
  const legend = (layout.legend as Record<string, unknown> | undefined) ?? {
    orientation: "h",
    x: 0,
    y: -0.18,
  };
  layout.legend = {
    ...legend,
    font: { family: legendStyle.fontFamily, size: legendStyle.fontSizePx },
    itemsizing: legendStyle.itemsizing,
    itemwidth: legendStyle.itemwidth,
    tracegroupgap: legendStyle.tracegroupgap,
  };
}

export function prepareFigure(
  assembled: AssembleResult,
  theme: ChartTheme = screenChartTheme,
): AssembleResult {
  const plotBg =
    typeof assembled.layout.plot_bgcolor === "string"
      ? assembled.layout.plot_bgcolor
      : "#ffffff";
  const data = assembled.data.map((trace) => cloneTrace(trace, theme, plotBg));
  const layout: Record<string, unknown> = {
    ...assembled.layout,
    template: AXIS_CHROME_TEMPLATE,
    margin: assembled.layout.margin
      ? { ...(assembled.layout.margin as object) }
      : assembled.layout.margin,
    xaxis: assembled.layout.xaxis
      ? { ...(assembled.layout.xaxis as object) }
      : assembled.layout.xaxis,
    yaxis: assembled.layout.yaxis
      ? { ...(assembled.layout.yaxis as object) }
      : assembled.layout.yaxis,
  };
  if (assembled.layout.yaxis2) {
    layout.yaxis2 = { ...(assembled.layout.yaxis2 as object) };
  }
  if (theme.kind === ChartThemeKind.Publication) {
    applyPublicationLayout(layout, theme);
  }
  return { data, layout };
}

const screenConfig = {
  responsive: true,
  displaylogo: false,
  displayModeBar: "hover" as const,
};

export async function draw(
  root: HTMLElement,
  assembled: AssembleResult,
  theme: ChartTheme = screenChartTheme,
): Promise<void> {
  const plotly = await loadPlotly();
  const figure = prepareFigure(assembled, theme);
  await plotly.react(root, figure.data, figure.layout, {
    ...screenConfig,
    responsive: theme.responsive,
    displayModeBar: theme.displayModeBar,
  });
}

export async function destroy(root: HTMLElement): Promise<void> {
  const plotly = await loadPlotly();
  plotly.purge(root);
}

export async function exportImage(
  assembled: AssembleResult,
  options: {
    format: "png" | "svg";
    width: number;
    height: number;
    scale: number;
  },
  theme: ChartTheme,
): Promise<string> {
  const plotly = await loadPlotly();
  const figure = prepareFigure(assembled, theme);
  return plotly.toImage(
    {
      data: figure.data,
      layout: figure.layout,
      config: {
        responsive: false,
        displaylogo: false,
        displayModeBar: false,
      },
    },
    options,
  );
}
