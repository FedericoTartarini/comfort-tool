import type {
  Annotation,
  Axis,
  Frame,
  Grid,
  Point,
  Polygon,
  Polyline,
} from "./types";

export function partitionHoverFills(fills: readonly Grid[]): {
  background: Grid[];
  hover: Grid[];
} {
  const background: Grid[] = [];
  const hover: Grid[] = [];
  for (const fill of fills) {
    if (fill.isHoverLayer) hover.push(fill);
    else background.push(fill);
  }
  return { background, hover };
}

export function axisTrace(axis: Axis): Record<string, unknown> {
  return {
    title: { text: axis.title },
    range: axis.range,
    ...(axis.gridcolor ? { gridcolor: axis.gridcolor } : {}),
    ...(axis.showgrid !== undefined ? { showgrid: axis.showgrid } : {}),
    ...(axis.zeroline !== undefined ? { zeroline: axis.zeroline } : {}),
    ...(axis.showticklabels !== undefined
      ? { showticklabels: axis.showticklabels }
      : {}),
    ...(axis.ticks !== undefined ? { ticks: axis.ticks } : {}),
    ...(axis.showticklabels === false ? { ticks: "" } : {}),
    ...(axis.dtick !== undefined
      ? {
          tickmode: "linear",
          tick0: axis.range[0],
          dtick: axis.dtick,
        }
      : {}),
    ...(axis.side ? { side: axis.side } : {}),
    ...(axis.overlaying ? { overlaying: axis.overlaying } : {}),
  };
}

export function frameLayout(frame: Frame): Record<string, unknown> {
  const layout: Record<string, unknown> = {
    paper_bgcolor: frame.paperBgColor ?? "#ffffff",
    plot_bgcolor: frame.plotBgColor ?? "#f8fafc",
    showlegend: frame.showlegend ?? false,
    hovermode: "closest",
    margin: frame.margin ?? { l: 56, r: 24, t: 48, b: 80 },
    xaxis: axisTrace(frame.xAxis),
    yaxis: axisTrace(frame.yAxis),
    annotations: (frame.annotations ?? []).map(annotationTrace),
  };
  if (frame.title) layout.title = { text: frame.title };
  if (frame.height !== undefined) layout.height = frame.height;
  if (frame.legend) layout.legend = { ...frame.legend };
  if (frame.yAxis2) {
    layout.yaxis2 = axisTrace({
      ...frame.yAxis2,
      overlaying: frame.yAxis2.overlaying ?? "y",
      side: frame.yAxis2.side ?? "right",
    });
  }
  return layout;
}

export function annotationTrace(annotation: Annotation): Record<string, unknown> {
  return {
    x: annotation.x,
    y: annotation.y,
    text: annotation.text,
    showarrow: annotation.showarrow ?? false,
    ...(annotation.font ? { font: annotation.font } : {}),
  };
}

export function gridTrace(grid: Grid): Record<string, unknown> {
  return {
    type: "contour",
    name: grid.name,
    x: grid.x,
    y: grid.y,
    z: grid.z,
    ...(grid.colorscale ? { colorscale: grid.colorscale } : {}),
    ...(grid.fillcolor ? { fillcolor: grid.fillcolor } : {}),
    ...(grid.contours ? { contours: grid.contours } : {}),
    ...(grid.hovertemplate ? { hovertemplate: grid.hovertemplate } : {}),
    ...(grid.customdata !== undefined ? { customdata: grid.customdata } : {}),
    ...(grid.text ? { text: grid.text } : {}),
    ...(grid.opacity !== undefined ? { opacity: grid.opacity } : {}),
    ...(grid.showscale !== undefined ? { showscale: grid.showscale } : {}),
    ...(grid.hoverongaps !== undefined ? { hoverongaps: grid.hoverongaps } : {}),
    ...(grid.hoverinfo ? { hoverinfo: grid.hoverinfo } : {}),
    ...(grid.zmin !== undefined ? { zmin: grid.zmin } : {}),
    ...(grid.zmax !== undefined ? { zmax: grid.zmax } : {}),
    line: grid.line ?? { width: 0 },
    showlegend: false,
  };
}

export function polylineTrace(line: Polyline): Record<string, unknown> {
  return {
    type: "scatter",
    mode: "lines",
    name: line.name,
    x: line.x,
    y: line.y,
    line: {
      color: line.color,
      width: line.width ?? 1.2,
      ...(line.dash ? { dash: line.dash } : {}),
    },
    ...(line.hovertemplate ? { hovertemplate: line.hovertemplate } : {}),
    ...(line.customdata !== undefined ? { customdata: line.customdata } : {}),
    ...(line.text ? { text: line.text } : {}),
    ...(line.showlegend !== undefined ? { showlegend: line.showlegend } : {}),
    ...(line.visible !== undefined ? { visible: line.visible } : {}),
    ...(line.hoverinfo ? { hoverinfo: line.hoverinfo } : {}),
    ...(line.yaxis ? { yaxis: line.yaxis } : {}),
  };
}

export function polygonTrace(polygon: Polygon): Record<string, unknown> {
  return {
    type: "scatter",
    mode: "lines",
    name: polygon.name,
    x: polygon.x,
    y: polygon.y,
    fill: "toself",
    fillcolor: polygon.fillcolor,
    line: {
      color: polygon.linecolor ?? polygon.fillcolor,
      width: polygon.linewidth ?? 0.8,
    },
    ...(polygon.opacity !== undefined ? { opacity: polygon.opacity } : {}),
    hoverinfo: polygon.hoverinfo ?? "skip",
    ...(polygon.hovertemplate ? { hovertemplate: polygon.hovertemplate } : {}),
    showlegend: polygon.showlegend ?? false,
    cliponaxis: false,
  };
}

export function pointTrace(point: Point): Record<string, unknown> {
  const hoverinfo = point.hoverinfo ?? "skip";
  return {
    type: "scatter",
    mode: "markers",
    name: point.name,
    x: [point.x],
    y: [point.y],
    marker: {
      color: point.color,
      size: 12,
      line: { color: "#000000", width: 1.5 },
    },
    ...(hoverinfo === "skip"
      ? {}
      : {
          ...(point.hovertemplate ? { hovertemplate: point.hovertemplate } : {}),
          ...(point.customdata !== undefined ? { customdata: point.customdata } : {}),
        }),
    hoverinfo,
    showlegend: point.showlegend ?? true,
  };
}
