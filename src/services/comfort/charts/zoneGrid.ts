import type { GridContourLayerSpec } from "./chartEngine";
import type { NumericBand } from "../../../models/modelCapabilities";
import type { PlotTraceDto } from "../../../models/comfortDtos";
import { buildGridContourTrace } from "./gridEngine";
import type { GridEvaluationResult } from "./types";

type ZoneColorSource = {
  color: string;
};

interface BoundaryLayerOptions {
  name?: string;
  contours?: GridContourLayerSpec["contours"];
  hovertemplate?: string;
  hoverinfo?: string;
  includeText?: boolean;
  includeHoverMetadata?: boolean;
}

interface ZoneContourLayersOptions {
  name: string;
  colorscale: any[];
  contours: GridContourLayerSpec["contours"];
  hovertemplate: string;
  showscale?: boolean;
  zmin?: number;
  zmax?: number;
  colorbar?: GridContourLayerSpec["colorbar"];
  opacity?: number;
  line?: GridContourLayerSpec["line"];
  isZone?: boolean;
  isBackgroundZone?: boolean;
  isComfortZone?: boolean;
  hoverinfo?: string;
  includeText?: boolean;
  includeHoverMetadata?: boolean;
  boundaryLayer?: BoundaryLayerOptions;
}

export function buildZoneColorscale(zones: ReadonlyArray<ZoneColorSource>): Array<[number, string]> {
  if (zones.length === 0) {
    throw new Error("At least one zone is required to build a colorscale");
  }

  const colorscale: Array<[number, string]> = [];
  const step = 1 / zones.length;

  zones.forEach((zone, index) => {
    colorscale.push([index * step, zone.color]);
    colorscale.push([(index + 1) * step, zone.color]);
  });

  return colorscale;
}

export function buildZoneContourLayers({
  name,
  colorscale,
  contours,
  hovertemplate,
  showscale = false,
  zmin,
  zmax,
  colorbar,
  opacity,
  line,
  isZone,
  isBackgroundZone,
  isComfortZone,
  hoverinfo,
  includeText,
  includeHoverMetadata,
  boundaryLayer,
}: ZoneContourLayersOptions): GridContourLayerSpec[] {
  const zoneLayer: GridContourLayerSpec = {
    name,
    colorscale,
    contours,
    hovertemplate,
    showscale,
    zmin,
    zmax,
    colorbar,
    opacity,
    line,
    isZone,
    isBackgroundZone,
    isComfortZone,
    hoverinfo,
    includeText,
    includeHoverMetadata,
  };

  if (!boundaryLayer) {
    return [zoneLayer];
  }

  return [
    zoneLayer,
    {
      name: boundaryLayer.name ?? "Boundaries",
      colorscale,
      zmin,
      zmax,
      contours: boundaryLayer.contours ?? {
        ...contours,
        coloring: "none",
        showlines: true,
      },
      hovertemplate: boundaryLayer.hovertemplate ?? "",
      hoverinfo: boundaryLayer.hoverinfo ?? "skip",
      showscale: false,
      includeText: boundaryLayer.includeText ?? false,
      includeHoverMetadata: boundaryLayer.includeHoverMetadata ?? false,
    },
  ];
}

interface CategoricalBandLayersOptions {
  name: string;
  bands: readonly NumericBand[];
  hovertemplate: string;
  opacity?: number;
}

export function buildCategoricalBandLayers({
  name,
  bands,
  hovertemplate,
  opacity = 0.8,
}: CategoricalBandLayersOptions): GridContourLayerSpec[] {
  const contours = bands.length === 1
    ? {
      coloring: "fill",
      showlines: false,
      type: "levels",
    }
    : {
      coloring: "fill",
      showlines: false,
      type: "levels",
      start: 0.5,
      end: bands.length - 1.5,
      size: 1,
      smoothing: 0,
    };

  return buildZoneContourLayers({
    name,
    colorscale: buildZoneColorscale(bands),
    contours,
    zmin: -0.5,
    zmax: bands.length - 0.5,
    hovertemplate,
    opacity,
    isBackgroundZone: true,
    boundaryLayer: bands.length > 1
      ? {
        contours: {
          ...contours,
          coloring: "none",
          showlines: true,
          line: { width: 1, color: "#333333" },
        },
      }
      : undefined,
  });
}

interface ConstraintBandTracesOptions {
  name: string;
  bands: readonly NumericBand[];
  grid: GridEvaluationResult;
  hovertemplate: string;
  opacity?: number;
}

function getFiniteGridRange(grid: GridEvaluationResult): { min: number; max: number } | undefined {
  let min = Infinity;
  let max = -Infinity;

  grid.zValues.forEach((row) => {
    row.forEach((value) => {
      if (!Number.isFinite(value)) {
        return;
      }
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
  });

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : undefined;
}

function getFiniteUpperCoverValue(range: { min: number; max: number }): number {
  const scale = Math.max(1, Math.abs(range.min), Math.abs(range.max), range.max - range.min);
  const candidate = range.max + scale * 1e-9;
  return Number.isFinite(candidate) && candidate > range.max ? candidate : range.max;
}

function buildBandConstraint(
  band: NumericBand,
  finiteRange: { min: number; max: number },
): { operation: string; value: number | [number, number] } {
  const hasFiniteMin = Number.isFinite(band.min);
  const hasFiniteMax = Number.isFinite(band.max);

  if (!hasFiniteMin && !hasFiniteMax) {
    return {
      operation: ">=",
      value: getFiniteUpperCoverValue(finiteRange),
    };
  }
  if (!hasFiniteMin) {
    return { operation: ">=", value: band.max };
  }
  if (!hasFiniteMax) {
    return { operation: "<", value: band.min };
  }
  return { operation: "][", value: [band.min, band.max] };
}

interface BandHitVertex {
  x: number;
  y: number;
  z: number;
  hoverMetadata: unknown[];
}

function toHoverMetadataRow(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function interpolateHoverMetadata(
  start: unknown[],
  end: unknown[],
  fraction: number,
): unknown[] {
  const length = Math.max(start.length, end.length);
  return Array.from({ length }, (_, index) => {
    const startValue = start[index];
    const endValue = end[index];
    return typeof startValue === "number"
      && Number.isFinite(startValue)
      && typeof endValue === "number"
      && Number.isFinite(endValue)
      ? startValue + (endValue - startValue) * fraction
      : fraction < 0.5 ? startValue : endValue;
  });
}

function interpolateBandHitVertex(
  start: BandHitVertex,
  end: BandHitVertex,
  threshold: number,
): BandHitVertex {
  const zDifference = end.z - start.z;
  const fraction = zDifference === 0
    ? 0.5
    : Math.max(0, Math.min(1, (threshold - start.z) / zDifference));

  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
    z: threshold,
    hoverMetadata: interpolateHoverMetadata(
      start.hoverMetadata,
      end.hoverMetadata,
      fraction,
    ),
  };
}

function clipBandHitPolygon(
  polygon: BandHitVertex[],
  threshold: number,
  keepAbove: boolean,
): BandHitVertex[] {
  if (polygon.length === 0 || !Number.isFinite(threshold)) {
    return polygon;
  }

  const isInside = (vertex: BandHitVertex) => (
    keepAbove ? vertex.z >= threshold : vertex.z <= threshold
  );
  const clipped: BandHitVertex[] = [];
  let previous = polygon[polygon.length - 1];
  let previousInside = isInside(previous);

  polygon.forEach((current) => {
    const currentInside = isInside(current);
    if (currentInside !== previousInside) {
      clipped.push(interpolateBandHitVertex(previous, current, threshold));
    }
    if (currentInside) {
      clipped.push(current);
    }
    previous = current;
    previousInside = currentInside;
  });

  return clipped;
}

function getPolygonArea(polygon: BandHitVertex[]): number {
  return Math.abs(polygon.reduce((area, vertex, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return area + vertex.x * next.y - next.x * vertex.y;
  }, 0)) / 2;
}

function buildBandHitPolygons(
  grid: GridEvaluationResult,
  band: NumericBand,
): BandHitVertex[][] {
  const polygons: BandHitVertex[][] = [];

  for (let yIndex = 0; yIndex < grid.yValues.length - 1; yIndex += 1) {
    for (let xIndex = 0; xIndex < grid.xValues.length - 1; xIndex += 1) {
      const corners = [
        { xIndex, yIndex },
        { xIndex: xIndex + 1, yIndex },
        { xIndex: xIndex + 1, yIndex: yIndex + 1 },
        { xIndex, yIndex: yIndex + 1 },
      ].map(({ xIndex: cornerXIndex, yIndex: cornerYIndex }): BandHitVertex => ({
        x: grid.xValues[cornerXIndex],
        y: grid.yValues[cornerYIndex],
        z: grid.zValues[cornerYIndex][cornerXIndex],
        hoverMetadata: toHoverMetadataRow(
          grid.hoverMetadata[cornerYIndex][cornerXIndex],
        ),
      }));

      if (corners.some(({ z }) => !Number.isFinite(z))) {
        continue;
      }

      // Split each marching square along a stable diagonal. Clipping both
      // triangles against the band edges covers narrow isobands even when no
      // original grid corner lies inside the band.
      const triangles = [
        [corners[0], corners[1], corners[2]],
        [corners[0], corners[2], corners[3]],
      ];
      triangles.forEach((triangle) => {
        const aboveLower = clipBandHitPolygon(triangle, band.min, true);
        const insideBand = clipBandHitPolygon(aboveLower, band.max, false);
        if (insideBand.length >= 3 && getPolygonArea(insideBand) > 1e-12) {
          polygons.push(insideBand);
        }
      });
    }
  }

  return polygons;
}

function buildBandHitRegionTrace(
  name: string,
  band: NumericBand,
  grid: GridEvaluationResult,
  hovertemplate: string,
): PlotTraceDto | null {
  const polygons = buildBandHitPolygons(grid, band);
  if (polygons.length === 0) {
    return null;
  }

  const x: number[] = [];
  const y: number[] = [];
  const text: string[] = [];
  const hoverMetadata: unknown[][] = [];
  const classificationMatch = hovertemplate.match(/<b>([^:<]+): %\{text\}<\/b>/);
  const hoverName = classificationMatch
    ? `${classificationMatch[1]}: ${band.label}`
    : `${name}: ${band.label}`;

  polygons.forEach((polygon, polygonIndex) => {
    if (polygonIndex > 0) {
      x.push(NaN);
      y.push(NaN);
      text.push(band.label);
      hoverMetadata.push([]);
    }
    [...polygon, polygon[0]].forEach((vertex) => {
      x.push(vertex.x);
      y.push(vertex.y);
      text.push(band.label);
      hoverMetadata.push(vertex.hoverMetadata);
    });
  });

  return {
    type: "scatter",
    mode: "lines",
    name: hoverName,
    x,
    y,
    text,
    showlegend: false,
    fill: "toself",
    fillcolor: "rgba(0, 0, 0, 0)",
    line: { width: 0, color: "rgba(0, 0, 0, 0)" },
    marker: {},
    hoveron: "fills",
    hovertemplate,
    hoverMetadata,
    isBackgroundZone: true,
  };
}

/**
 * Builds smooth band regions from a continuous raw-output grid. Plotly constraint
 * traces own the visible fill, while marching-square hit regions own hover so
 * unclassified gaps do not acquire a full-grid hover surface.
 */
export function buildConstraintBandTraces({
  name,
  bands,
  grid,
  hovertemplate,
  opacity = 0.8,
}: ConstraintBandTracesOptions): PlotTraceDto[] {
  const finiteRange = getFiniteGridRange(grid);
  if (!finiteRange) {
    return [];
  }

  const fillTraces = bands.map((band) => {
    const constraint = buildBandConstraint(band, finiteRange);
    return buildGridContourTrace({
      name: `${name}: ${band.label}`,
      grid,
      fillcolor: band.color,
      contours: {
        type: "constraint",
        operation: constraint.operation,
        value: constraint.value,
        // Plotly shades the region that violates a constraint. The operation
        // therefore describes the complement of this band: outside for a
        // finite band and the opposite half-plane for an unbounded band.
        // `coloring: "none"` avoids adding a full-grid contour background.
        coloring: "none",
        showlines: false,
      },
      hovertemplate: "",
      hoverinfo: "skip",
      showscale: false,
      opacity,
      line: { width: 0 },
      isBackgroundZone: true,
      includeText: false,
      includeHoverMetadata: false,
    });
  });

  const finiteBoundaries = [...new Set(
    bands.flatMap((band) => [band.min, band.max]).filter(Number.isFinite),
  )].sort((left, right) => left - right);
  const boundaryTraces = finiteBoundaries.map((boundary) => buildGridContourTrace({
    name: `${name} boundary ${boundary}`,
    grid,
    contours: {
      type: "constraint",
      operation: "=",
      value: boundary,
      coloring: "none",
      showlines: true,
    },
    hovertemplate: "",
    hoverinfo: "skip",
    showscale: false,
    opacity,
    line: { width: 1, color: "#333333" },
    isBackgroundZone: true,
    includeText: false,
    includeHoverMetadata: false,
  }));

  const hitRegionTraces = bands.flatMap((band) => {
    const trace = buildBandHitRegionTrace(name, band, grid, hovertemplate);
    return trace ? [trace] : [];
  });

  return [...fillTraces, ...boundaryTraces, ...hitRegionTraces];
}
