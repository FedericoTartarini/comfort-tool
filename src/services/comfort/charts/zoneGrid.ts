import type { GridContourLayerSpec } from "./chartEngine";
import type { NumericBand } from "../../../models/modelCapabilities";

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
  colorscale: GridContourLayerSpec["colorscale"];
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
