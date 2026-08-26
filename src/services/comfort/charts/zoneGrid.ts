import {
  findNumericBandIndexForValue,
  type NumericBand,
} from "../../../models/modelCapabilities";
import type {
  PlotColorScale,
  PlotConstraintOperation,
  PlotHoverInfo,
  PlotLevelContours,
  PlotTrace,
} from "../../plotlyTypes";
import {
  buildGridContourTrace,
  type GridContourLayerSpec,
} from "./gridEngine";
import type { GridEvaluationResult } from "./types";

type ZoneColorSource = {
  color: string;
};

interface BoundaryLayerOptions {
  name?: string;
  contours?: PlotLevelContours;
  hovertemplate?: string;
  hoverinfo?: PlotHoverInfo;
  includeText?: boolean;
  includeHoverMetadata?: boolean;
}

interface ZoneContourLayersOptions {
  name: string;
  colorscale: PlotColorScale;
  contours: PlotLevelContours;
  hovertemplate: string;
  showscale?: boolean;
  zmin?: number;
  zmax?: number;
  opacity?: number;
  line?: GridContourLayerSpec["line"];
  isBackgroundZone?: boolean;
  hoverinfo?: PlotHoverInfo;
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

function buildZoneContourLayers({
  name,
  colorscale,
  contours,
  hovertemplate,
  showscale = false,
  zmin,
  zmax,
  opacity,
  line,
  isBackgroundZone,
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
    opacity,
    line,
    isBackgroundZone,
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
  opacity?: number;
}

function buildCategoricalBandLayers({
  name,
  bands,
  opacity = 0.8,
}: CategoricalBandLayersOptions): GridContourLayerSpec[] {
  const contours: PlotLevelContours = bands.length === 1
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
    hovertemplate: "",
    hoverinfo: "skip",
    includeText: false,
    includeHoverMetadata: false,
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

interface CategoricalBandTracesOptions extends CategoricalBandLayersOptions {
  grid: GridEvaluationResult;
}

export function buildCategoricalBandTraces({
  name,
  bands,
  grid,
  opacity,
}: CategoricalBandTracesOptions): PlotTrace[] {
  const classifiedGrid: GridEvaluationResult = {
    ...grid,
    zValues: grid.zValues.map((row) => row.map((value) => (
      findNumericBandIndexForValue(bands, value) ?? NaN
    ))),
  };

  return buildCategoricalBandLayers({ name, bands, opacity }).map((layer) => (
    buildGridContourTrace({ ...layer, grid: classifiedGrid })
  ));
}

interface BandTooltipTraceOptions {
  name: string;
  grid: GridEvaluationResult;
  hovertemplate: string;
  includeHoverMetadata?: boolean;
}

const TRANSPARENT_COLORSCALE: PlotColorScale = [
  [0, "rgba(0, 0, 0, 0)"],
  [1, "rgba(0, 0, 0, 0)"],
];

export function buildBandTooltipTrace({
  name,
  grid,
  hovertemplate,
  includeHoverMetadata = true,
}: BandTooltipTraceOptions): PlotTrace {
  return buildGridContourTrace({
    name,
    grid,
    colorscale: TRANSPARENT_COLORSCALE,
    contours: {
      type: "levels",
      coloring: "heatmap",
      showlines: false,
    },
    hovertemplate,
    hoverOnGaps: false,
    showscale: false,
    line: { width: 0 },
    isBackgroundZone: true,
    includeHoverMetadata,
  });
}

interface ConstraintBandTracesOptions {
  name: string;
  bands: readonly NumericBand[];
  grid: GridEvaluationResult;
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
): { operation: PlotConstraintOperation; value: number | [number, number] } {
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

/**
 * Builds smooth visible band regions from a continuous raw-output grid.
 * A separate transparent contour owns hover for all banded-grid renderers.
 */
export function buildConstraintBandTraces({
  name,
  bands,
  grid,
  opacity = 0.8,
}: ConstraintBandTracesOptions): PlotTrace[] {
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

  return [...fillTraces, ...boundaryTraces];
}
