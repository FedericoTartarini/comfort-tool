import type { FieldKey as FieldKeyType } from "./fieldKeys";
import type { InputId as InputIdType } from "./inputSlots";
import type { ThermalZone } from "./thermalZone";
import type { UnitSystem as UnitSystemType } from "./units";

export const ChartMode = {
  Compliance: "compliance",
  Explore: "explore",
} as const;

export type ChartMode = (typeof ChartMode)[keyof typeof ChartMode];

export const ModelOutputKey = {
  Pmv: "pmv",
  Ppd: "ppd",
  Utci: "utci",
  HeatIndex: "heatIndex",
  Humidex: "humidex",
  WindChill: "windChill",
  OperativeTemperature: "operativeTemperature",
} as const;

export type ModelOutputKey = (typeof ModelOutputKey)[keyof typeof ModelOutputKey];

export type InputsSi = Readonly<Record<FieldKeyType, number>>;

/**
 * A numeric edge is already in canonical SI. A functional edge receives the
 * current chart X value and the model input record, both in canonical SI.
 */
export type BandEdge = number | ((xValueSi: number, inputsSi: InputsSi) => number);

/** Bands use half-open intervals: min <= value < max. */
export interface Band {
  readonly min: BandEdge;
  readonly max: BandEdge;
  readonly label: string;
  readonly color: string;
}

/** Explore bands are directly editable, so their edges must be numeric SI values. */
export interface NumericBand extends Band {
  readonly min: number;
  readonly max: number;
}

export interface ModelOutput {
  readonly key: ModelOutputKey;
  readonly label: string;
  readonly legendTitle?: string;
  readonly unit?: string;
  readonly defaultBands: readonly NumericBand[];
}

export interface ComplianceSpec {
  readonly output: ModelOutputKey;
  readonly bands: readonly Band[];
}

interface FieldChartConfigBase {
  readonly xField: FieldKeyType;
  readonly yField: FieldKeyType;
  readonly zOutput: ModelOutputKey;
}

export interface ExploreFieldChartConfig extends FieldChartConfigBase {
  readonly mode: typeof ChartMode.Explore;
  readonly bands: readonly NumericBand[];
}

/** Locked field-chart configuration declared by a compliance-capable model. */
export interface ComplianceFieldChartConfig extends FieldChartConfigBase {
  readonly mode: typeof ChartMode.Compliance;
  readonly bands: readonly Band[];
}

export type FieldChartConfig = ExploreFieldChartConfig | ComplianceFieldChartConfig;

/** Field-chart configuration accepted by the numeric grid/contour strategy. */
export type GridFieldChartConfig = FieldChartConfig & {
  readonly bands: readonly NumericBand[];
};

/** Generic presentation state supplied to every registered chart builder. */
export interface ChartBuildContext {
  readonly unitSystem: UnitSystemType;
  readonly dynamicAxes: {
    readonly xAxis: FieldKeyType;
    readonly yAxis: FieldKeyType;
  };
  readonly baselineInputId: InputIdType;
  readonly fieldChartConfig: FieldChartConfig | null;
}

export function resolveBandEdge(
  edge: BandEdge,
  xValueSi: number,
  inputsSi: InputsSi,
): number {
  return typeof edge === "function" ? edge(xValueSi, inputsSi) : edge;
}

/** Resolves each candidate's edges and returns the first array-ordered match. */
export function findBandForValue(
  bands: readonly Band[],
  valueSi: number,
  xValueSi: number,
  inputsSi: InputsSi,
): Band | undefined {
  const bandIndex = findBandIndexForValue(bands, valueSi, xValueSi, inputsSi);
  return bandIndex === undefined ? undefined : bands[bandIndex];
}

export function findBandIndexForValue(
  bands: readonly Band[],
  valueSi: number,
  xValueSi: number,
  inputsSi: InputsSi,
): number | undefined {
  if (Number.isNaN(valueSi)) {
    return undefined;
  }

  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const min = resolveBandEdge(band.min, xValueSi, inputsSi);
    const max = resolveBandEdge(band.max, xValueSi, inputsSi);

    if (valueSi >= min && valueSi < max) {
      return index;
    }
  }

  return undefined;
}

export function findNumericBandIndexForValue(
  bands: readonly NumericBand[],
  valueSi: number,
): number | undefined {
  if (Number.isNaN(valueSi)) {
    return undefined;
  }

  const index = bands.findIndex((band) => valueSi >= band.min && valueSi < band.max);
  return index === -1 ? undefined : index;
}

export function bandsFromThermalZones(zones: readonly ThermalZone[]): readonly NumericBand[] {
  return zones.map((zone) => ({
    min: zone.min,
    max: zone.max,
    label: zone.label,
    color: zone.color,
  }));
}
