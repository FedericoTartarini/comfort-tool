import type { FieldKey as FieldKeyType } from "./fieldKeys";
import type { ThermalZone } from "./thermalZone";

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

export interface ModelOutput {
  readonly key: ModelOutputKey;
  readonly label: string;
  readonly unit?: string;
  readonly defaultBands: readonly Band[];
}

export interface ComplianceSpec {
  readonly output: ModelOutputKey;
  readonly bands: readonly Band[];
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
  if (Number.isNaN(valueSi)) {
    return undefined;
  }

  for (const band of bands) {
    const min = resolveBandEdge(band.min, xValueSi, inputsSi);
    const max = resolveBandEdge(band.max, xValueSi, inputsSi);

    if (valueSi >= min && valueSi < max) {
      return band;
    }
  }

  return undefined;
}

export function bandsFromThermalZones(zones: readonly ThermalZone[]): readonly Band[] {
  return zones.map((zone) => ({
    min: zone.min,
    max: zone.max,
    label: zone.label,
    color: zone.color,
  }));
}
