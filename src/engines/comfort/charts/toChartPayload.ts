import { ChartType } from "../../../catalog/chartTypes";
import type {
  AdaptiveInput,
  Axis,
  BodyTemperatureInput,
  ChartPayload,
  DynamicInput,
  Frame,
  Grid,
  GridContours,
  HeatLossInput,
  Point,
  Polygon,
  Polyline,
  PsychrometricInput,
  SetInput,
  UtciInput,
  WaterLossInput,
} from "../../../charts/types";
import type {
  PlotAnnotation,
  PlotAxis,
  PlotlyChartSpec,
  PlotTrace,
} from "../../plotlyTypes";

function toAxis(axis: PlotAxis): Axis {
  return {
    title: axis.title,
    range: [axis.range[0], axis.range[1]],
    ...(axis.gridcolor ? { gridcolor: axis.gridcolor } : {}),
    ...(axis.showgrid !== undefined ? { showgrid: axis.showgrid } : {}),
    ...(axis.zeroline !== undefined ? { zeroline: axis.zeroline } : {}),
    ...(axis.showticklabels !== undefined
      ? { showticklabels: axis.showticklabels }
      : {}),
    ...(axis.dtick !== undefined ? { dtick: axis.dtick } : {}),
    ...(axis.side ? { side: axis.side } : {}),
    ...(axis.overlaying ? { overlaying: axis.overlaying } : {}),
  };
}

function toFrame(spec: PlotlyChartSpec): Frame {
  return {
    title: spec.layout.title,
    paperBgColor: spec.layout.paper_bgcolor,
    plotBgColor: spec.layout.plot_bgcolor,
    showlegend: spec.layout.showlegend,
    margin: spec.layout.margin,
    ...(spec.layout.height !== undefined ? { height: spec.layout.height } : {}),
    ...(spec.layout.legend ? { legend: spec.layout.legend } : {}),
    xAxis: toAxis(spec.layout.xaxis),
    yAxis: toAxis(spec.layout.yaxis),
    ...(spec.layout.yaxis2 ? { yAxis2: toAxis(spec.layout.yaxis2) } : {}),
    annotations: spec.annotations.map(toAnnotation),
  };
}

function toAnnotation(annotation: PlotAnnotation) {
  return {
    x: annotation.x,
    y: annotation.y,
    text: annotation.text,
    showarrow: annotation.showarrow,
    font: annotation.font,
  };
}

function finiteGrid(z: number[][]): (number | null)[][] {
  return z.map((row) =>
    row.map((value) => (Number.isFinite(value) ? value : null)),
  );
}

function toGrid(trace: PlotTrace): Grid | null {
  if (trace.type !== "contour" || !Array.isArray(trace.z)) return null;
  const z = trace.z as number[][];
  const contours = trace.contours
    ? ({
        ...(trace.contours.type ? { type: trace.contours.type } : {}),
        ...("coloring" in trace.contours && trace.contours.coloring
          ? { coloring: trace.contours.coloring }
          : {}),
        ...("showlines" in trace.contours
          ? { showlines: trace.contours.showlines }
          : {}),
        ...("start" in trace.contours ? { start: trace.contours.start } : {}),
        ...("end" in trace.contours ? { end: trace.contours.end } : {}),
        ...("size" in trace.contours ? { size: trace.contours.size } : {}),
        ...("smoothing" in trace.contours
          ? { smoothing: trace.contours.smoothing }
          : {}),
        ...("operation" in trace.contours && trace.contours.operation
          ? { operation: trace.contours.operation }
          : {}),
        ...("value" in trace.contours ? { value: trace.contours.value } : {}),
        ...(trace.contours.line ? { line: trace.contours.line } : {}),
      } satisfies GridContours)
    : undefined;
  return {
    x: [...trace.x],
    y: [...trace.y],
    z: finiteGrid(z),
    name: trace.name,
    ...(trace.colorscale ? { colorscale: trace.colorscale.map((stop: [number, string]) => [stop[0], stop[1]] as [number, string]) } : {}),
    ...(trace.fillcolor ? { fillcolor: trace.fillcolor } : {}),
    ...(contours ? { contours } : {}),
    ...(trace.hovertemplate ? { hovertemplate: trace.hovertemplate } : {}),
    ...(trace.hoverMetadata !== undefined
      ? { customdata: trace.hoverMetadata }
      : {}),
    ...(trace.text ? { text: trace.text } : {}),
    ...(trace.opacity !== undefined ? { opacity: trace.opacity } : {}),
    ...(trace.showscale !== undefined ? { showscale: trace.showscale } : {}),
    ...(trace.hoverongaps !== undefined ? { hoverongaps: trace.hoverongaps } : {}),
    ...(trace.hoverinfo ? { hoverinfo: trace.hoverinfo } : {}),
    ...(trace.zmin !== undefined ? { zmin: trace.zmin } : {}),
    ...(trace.zmax !== undefined ? { zmax: trace.zmax } : {}),
    ...(trace.isHoverLayer ? { isHoverLayer: true } : {}),
    ...(trace.line
      ? {
          line: {
            ...(trace.line.color ? { color: trace.line.color } : {}),
            ...(trace.line.width !== undefined ? { width: trace.line.width } : {}),
          },
        }
      : {}),
  };
}

function toPolyline(trace: PlotTrace): Polyline | null {
  if (trace.type !== "scatter" || trace.mode !== "lines" || trace.fill === "toself") {
    return null;
  }
  return {
    x: [...trace.x],
    y: [...trace.y],
    name: trace.name,
    color: trace.line?.color,
    width: trace.line?.width,
    dash: trace.line?.dash,
    ...(trace.hovertemplate ? { hovertemplate: trace.hovertemplate } : {}),
    ...(trace.hoverMetadata !== undefined
      ? { customdata: trace.hoverMetadata }
      : {}),
    ...(trace.text ? { text: [...trace.text] } : {}),
    ...(trace.showlegend !== undefined ? { showlegend: trace.showlegend } : {}),
    ...(trace.visible !== undefined ? { visible: trace.visible } : {}),
    ...(trace.hoverinfo ? { hoverinfo: trace.hoverinfo } : {}),
    ...(trace.yaxis ? { yaxis: trace.yaxis } : {}),
  };
}

function toPolygon(trace: PlotTrace): Polygon | null {
  if (trace.type !== "scatter" || trace.fill !== "toself") return null;
  return {
    x: [...trace.x],
    y: [...trace.y],
    fillcolor: trace.fillcolor ?? "#000000",
    linecolor: trace.line?.color,
    linewidth: trace.line?.width,
    name: trace.name,
    ...(trace.opacity !== undefined ? { opacity: trace.opacity } : {}),
    ...(trace.hoverinfo ? { hoverinfo: trace.hoverinfo } : {}),
    ...(trace.hovertemplate ? { hovertemplate: trace.hovertemplate } : {}),
    ...(trace.showlegend !== undefined ? { showlegend: trace.showlegend } : {}),
  };
}

function toPoint(trace: PlotTrace): Point | null {
  if (trace.type !== "scatter" || trace.mode !== "markers") return null;
  return {
    x: trace.x[0] ?? 0,
    y: trace.y[0] ?? 0,
    name: trace.name,
    color: trace.marker?.color ?? "#2563eb",
    ...(trace.hovertemplate ? { hovertemplate: trace.hovertemplate } : {}),
    ...(trace.hoverMetadata !== undefined
      ? { customdata: trace.hoverMetadata }
      : {}),
    ...(trace.showlegend !== undefined ? { showlegend: trace.showlegend } : {}),
    ...(trace.hoverinfo ? { hoverinfo: trace.hoverinfo } : {}),
  };
}

function collect(spec: PlotlyChartSpec) {
  const fills: Grid[] = [];
  const curves: Polyline[] = [];
  const polygons: Polygon[] = [];
  const points: Point[] = [];
  for (const trace of spec.traces) {
    const grid = toGrid(trace);
    if (grid) {
      fills.push(grid);
      continue;
    }
    const point = toPoint(trace);
    if (point) {
      points.push(point);
      continue;
    }
    const polygon = toPolygon(trace);
    if (polygon) {
      polygons.push(polygon);
      continue;
    }
    const line = toPolyline(trace);
    if (line) curves.push(line);
  }
  return { fills, curves, polygons, points };
}

export function chartPayloadFromSpec(
  type: ChartType,
  spec: PlotlyChartSpec,
): ChartPayload {
  const frame = toFrame(spec);
  const { fills, curves, polygons, points } = collect(spec);

  switch (type) {
    case ChartType.Psychrometric: {
      const mask = polygons.find((polygon) => polygon.name === "Supersaturated region mask");
      const zones = polygons.filter((polygon) => polygon !== mask);
      const input: PsychrometricInput = {
        ...frame,
        fills,
        ...(mask ? { mask } : {}),
        curves,
        zones,
        points,
      };
      return { type, input };
    }
    case ChartType.Dynamic: {
      const input: DynamicInput = { ...frame, fills, points };
      return { type, input };
    }
    case ChartType.HeatLoss: {
      const input: HeatLossInput = {
        ...frame,
        series: curves,
        ...(polygons.length > 0 ? { bands: polygons } : {}),
        ...(points.length > 0 ? { points } : {}),
      };
      return { type, input };
    }
    case ChartType.Set: {
      const input: SetInput = {
        ...frame,
        series: curves,
        ...(polygons.length > 0 ? { bands: polygons } : {}),
        ...(points.length > 0 ? { points } : {}),
      };
      return { type, input };
    }
    case ChartType.Adaptive: {
      const input: AdaptiveInput = {
        ...frame,
        ...(fills.length > 0 ? { fills } : {}),
        regions: polygons,
        points,
      };
      return { type, input };
    }
    case ChartType.Utci: {
      const input: UtciInput = { ...frame, fills, points };
      return { type, input };
    }
    case ChartType.BodyTemperature: {
      const input: BodyTemperatureInput = {
        ...frame,
        series: curves,
        ...(points.length > 0 ? { points } : {}),
      };
      return { type, input };
    }
    case ChartType.WaterLoss: {
      const input: WaterLossInput = {
        ...frame,
        series: curves,
        ...(points.length > 0 ? { points } : {}),
      };
      return { type, input };
    }
  }
}
