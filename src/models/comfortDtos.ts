/**
 * Data transfer objects (DTOs) for comfort calculations.
 * Defines the expected structure for requests and responses
 * across comfort models and thermal indices.
 */

import type { CalculationSource, ComfortStandard } from "./calculationMetadata";
import type { InputId as InputIdType } from "./inputSlots";
import type { UtciStressCategory } from "../services/comfort/helpers";
import type { UnitSystem } from "./units";
import type { FieldKey } from "./fieldKeys";

// PMV Request DTO, contains dry-bulb temperature, mean radiant temperature, air speed,
// relative humidity, metabolic rate, clothing insulation, weighted clothing insulation
// and whether the occupant has air speed control
export interface PmvRequestDto {
  tdb: number;
  tr: number;
  vr: number;
  rh: number;
  met: number;
  clo: number;
  wme: number;
  occupantHasAirSpeedControl: boolean;
  units: UnitSystem;
}

// PMV Response DTO, contains predicted mean vote (pmv), predicted percentage of dissatisfied (ppd),
// air speed (vr) and compliance status
export interface PmvResponseDto {
  pmv: number;
  ppd: number;
  vr: number;
  isCompliant: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

// Comfort Point DTO, contains dry-bulb temperature and relative humidity
export interface ComfortPointDto {
  tdb: number;
  rh: number;
}

// Comfort Zone Request DTO, contains relative humidity range and number of points
export interface ComfortZoneRequestDto extends PmvRequestDto {
  rhMin: number;
  rhMax: number;
  rhPoints: number;
}

// Comfort Zone Response DTO, contains comfort zones boundaries (cool and warm edges)
export interface ComfortZoneResponseDto {
  coolEdge: ComfortPointDto[];
  warmEdge: ComfortPointDto[];
  source: CalculationSource;
}

// UTCI Request DTO, contains dry-bulb temperature, mean radiant temperature, wind speed and relative humidity
export interface UtciRequestDto {
  tdb: number;
  tr: number;
  v: number;
  rh: number;
  units: UnitSystem;
}

// UTCI Response DTO, contains utci and stress category
export interface UtciResponseDto {
  utci: number;
  stressCategory: UtciStressCategory;
  source: CalculationSource;
}

// todo AI ThermalIndicesRequestDto and ThermalIndicesResponseDto bundle three separate models (Heat Index, Humidex, Wind Chill) into one DTO. This means the Heat Index calculator receives a wind speed field it does not use, and the Humidex calculator receives fields it ignores. Each model should have its own request and response DTO once the calculation files are split.
// Thermal Indices Request DTO, contains heat index, humidex and wind chill index
export interface ThermalIndicesRequestDto {
  tdb: number;
  rh: number;
  v?: number;
  units: UnitSystem;
}

// Thermal Indices Response DTO, contains heat index, humidex and wind chill index
export interface ThermalIndicesResponseDto {
  hi: number;
  category: string;
  humidex?: number;
  humidexDiscomfort?: string;
  wci?: number;
  wciTemp?: number;
  wciZone?: string;
  source: CalculationSource;
}

// Adaptive Request DTO, contains dry-bulb temperature, mean radiant temperature, 
// running mean outdoor temperature, air speed and units
export interface AdaptiveRequestDto {
  tdb: number;
  tr: number;
  trm: number;
  v: number;
  units: UnitSystem;
}

// Adaptive Response DTO, contains operative temperature (t_cmf), acceptability (*_80, *_90, *_cat_*),
// temperature range (tmp_cmf_*_low, tmp_cmf_*_up) and compliance status
export interface AdaptiveResponseDto {
  t_cmf: number;
  acceptability_80?: boolean;
  acceptability_90?: boolean;
  acceptability_cat_i?: boolean;
  acceptability_cat_ii?: boolean;
  acceptability_cat_iii?: boolean;
  status_80?: string;
  status_90?: string;
  status_cat_i?: string;
  status_cat_ii?: string;
  status_cat_iii?: string;
  tmp_cmf_80_low?: number;
  tmp_cmf_80_up?: number;
  tmp_cmf_90_low?: number;
  tmp_cmf_90_up?: number;
  tmp_cmf_cat_i_low?: number;
  tmp_cmf_cat_i_up?: number;
  tmp_cmf_cat_ii_low?: number;
  tmp_cmf_cat_ii_up?: number;
  tmp_cmf_cat_iii_low?: number;
  tmp_cmf_cat_iii_up?: number;
  isCompliant: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

// Chart Range DTO, contains dry-bulb temperature range and humidity ratio range
interface ChartRangeDto {
  tdbMin: number;
  tdbMax: number;
  tdbPoints: number;
  humidityRatioMin: number;
  humidityRatioMax: number;
}

// Compare Input Map DTO, contains comfort zone requests for each input
export type CompareInputMap<T> = Partial<Record<InputIdType, T>>;

// PMV Chart Inputs Request DTO, contains comfort zone requests for each input
export interface PmvChartInputsRequestDto {
  inputs: CompareInputMap<ComfortZoneRequestDto>;
  chartRange: ChartRangeDto;
  rhCurves: number[];
}

// PMV Chart Source DTO, contains chart requests for each input,
// comfort zones by input, dynamic x-axis, dynamic y-axis, and baseline input
export interface PmvChartSourceDto {
  chartRequest: PmvChartInputsRequestDto;
  comfortZonesByInput: CompareInputMap<ComfortZoneResponseDto>;
  dynamicXAxis?: string;
  dynamicYAxis?: string;
  baselineInputId?: InputIdType;
}


// Utci Chart Inputs Request DTO, contains utci requests for each input
export interface UtciChartInputsRequestDto {
  inputs: CompareInputMap<UtciRequestDto>;
}

// Utci Chart Source DTO, contains chart requests for each input,
// dynamic x-axis, dynamic y-axis, and baseline input
export interface UtciChartSourceDto {
  chartRequest: UtciChartInputsRequestDto;
  dynamicXAxis?: FieldKey;
  dynamicYAxis?: FieldKey;
  baselineInputId?: InputIdType;
}

// Thermal Indices Chart Inputs Request DTO, contains thermal indices requests for each input
export interface ThermalIndicesChartInputsRequestDto {
  inputs: CompareInputMap<ThermalIndicesRequestDto>;
}

// Thermal Indices Chart Source DTO, contains chart requests for each input
export interface ThermalIndicesChartSourceDto {
  chartRequest: ThermalIndicesChartInputsRequestDto;
  dynamicXAxis?: FieldKey;
  dynamicYAxis?: FieldKey;
}

// Adaptive Chart Inputs Request DTO, contains adaptive requests for each input
export interface AdaptiveChartInputsRequestDto {
  inputs: CompareInputMap<AdaptiveRequestDto>;
}

// Adaptive Chart Source DTO, contains chart requests for each input,
// results by input, standard mode, dynamic x-axis, dynamic y-axis, and baseline input
export interface AdaptiveChartSourceDto {
  chartRequest: AdaptiveChartInputsRequestDto;
  resultsByInput: CompareInputMap<AdaptiveResponseDto>;
  standardMode: string;
  dynamicXAxis?: string;
  dynamicYAxis?: string;
  baselineInputId?: InputIdType;
}

// Plot Trace DTO, contains plot trace data, including type, mode, name, x, y, z, text, 
// showlegend, fill, fillcolor, line, marker, colorscale, contours, zmin, zmax, showscale,
// hoverinfo and hovertemplate
export interface PlotTraceDto {
  type: "scatter" | "contour" | "heatmap";
  mode?: string;
  name: string;
  x: number[];
  y: number[];
  z?: number[][];
  text?: string[] | string[][];
  showlegend?: boolean | null;
  fill?: string | null;
  fillcolor?: string | null;
  line?: any;
  marker?: any;
  colorscale?: any[];
  contours?: any;
  zmin?: number;
  zmax?: number;
  showscale?: boolean;
  colorbar?: any;
  opacity?: number;
  hoverinfo?: string;
  hovertemplate?: string | null;
  /** When true, this trace is a background zone overlay that can be hidden via the Zones toggle. */
  isZone?: boolean;
  /** Custom data associated with each point in the trace, often used in hovertemplates. */
  customdata?: any[] | any[][];
}

// Plot Annotation DTO, contains plot annotation data, including x, y, text, showarrow and font
export interface PlotAnnotationDto {
  x: number;
  y: number;
  text: string;
  showarrow: boolean;
  font: Record<string, string | number>;
}

// Plot Layout DTO, contains plot layout data, including title, paper_bgcolor, plot_bgcolor,
// showlegend, margin, xaxis, yaxis, shapes, legend and height
export interface PlotLayoutDto {
  title: string;
  paper_bgcolor: string;
  plot_bgcolor: string;
  showlegend: boolean;
  margin: Record<string, number>;
  xaxis: Record<string, unknown>;
  yaxis: Record<string, unknown>;
  shapes?: Record<string, unknown>[];
  legend?: Record<string, unknown> | null;
  height?: number | null;
}

// Plotly Chart Response DTO, contains plot trace data, plot layout data, plot annotation data, and source
export interface PlotlyChartResponseDto {
  traces: PlotTraceDto[];
  layout: PlotLayoutDto;
  annotations: PlotAnnotationDto[];
  source: CalculationSource;
}
