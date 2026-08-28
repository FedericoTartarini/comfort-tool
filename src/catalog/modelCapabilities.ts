import type { InputId as InputIdType } from "./inputSlots";
import {
  type ChartAxisQuantityId,
  type PhysicalQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
} from "./quantities";
import { FieldChartProfileKind } from "./output/fieldChartProfile";
import type { ThermalZone } from "./thermalZone";
import type { UnitSystem as UnitSystemType } from "./units";
import {
  resolveZoneAppearance,
  ZonePaletteKind,
  type ZoneToken,
} from "./zoneTokens";

export type BandInputsSi = Readonly<Partial<Record<ChartAxisQuantityId, number>>>;

/**
 * A numeric edge is already in canonical SI. A functional edge receives its
 * semantic boundary parameter and required model inputs in canonical SI.
 * Adaptive bands always receive outdoor temperature, regardless of chart direction.
 */
export type BandEdge = number | ((boundaryValueSi: number, inputsSi: BandInputsSi) => number);

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
  readonly key: PhysicalQuantityId;
  readonly label: string;
  readonly legendTitle?: string;
  readonly defaultBands: readonly NumericBand[];
}

export interface ComplianceFeedback {
  readonly text: string;
  readonly passes: boolean;
}

export interface ComplianceSpec<TBand extends Band = Band, TResult = unknown> {
  readonly output: PhysicalQuantityId;
  readonly bands: readonly TBand[];
  readonly legendTitle: string;
  readonly caption: string;
  readonly getFeedback: (result: TResult) => ComplianceFeedback;
}

interface FieldChartConfigBase {
  readonly xField: ChartAxisQuantityId;
  readonly yField: ChartAxisQuantityId;
  readonly zOutput: PhysicalQuantityId;
}

/** Numeric-band field chart shared by fixed charts and Explore charts. */
export interface NumericFieldChartConfig extends FieldChartConfigBase {
  readonly bands: readonly NumericBand[];
}

export interface ExploreFieldChartConfig extends NumericFieldChartConfig {
  readonly profileKind: typeof FieldChartProfileKind.Explore;
}

/** Locked field-chart configuration declared by a compliance-capable model. */
export interface ComplianceFieldChartConfig<
  TBand extends Band = Band,
> extends FieldChartConfigBase {
  readonly profileKind: typeof FieldChartProfileKind.Compliance;
  readonly bands: readonly TBand[];
}

/** Numeric Compliance charts can use the shared banded grid strategy directly. */
export type NumericComplianceFieldChartConfig =
  ComplianceFieldChartConfig<NumericBand> & NumericFieldChartConfig;

export type FieldChartConfig<TComplianceBand extends Band = Band> =
  | ExploreFieldChartConfig
  | ComplianceFieldChartConfig<TComplianceBand>;

/** Generic presentation state supplied to every registered chart builder. */
export interface ChartBuildContext<TComplianceBand extends Band = Band> {
  readonly unitSystem: UnitSystemType;
  readonly baselineInputId: InputIdType;
  readonly modelInputs?: Readonly<Partial<Record<PhysicalQuantityIdType, number>>>;
  readonly fieldChartConfig: FieldChartConfig<TComplianceBand>;
}

export function resolveChartModelInputs(
  context: ChartBuildContext,
): Readonly<Partial<Record<PhysicalQuantityIdType, number>>> {
  return context.modelInputs ?? {};
}

export function resolveBandEdge(
  edge: BandEdge,
  boundaryValueSi: number,
  inputsSi: BandInputsSi,
): number {
  return typeof edge === "function" ? edge(boundaryValueSi, inputsSi) : edge;
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

/** Build an Explore/Compliance numeric band from a zone token's screen fill. */
export function numericBandFromToken(
  token: ZoneToken,
  band: Omit<NumericBand, "color">,
): NumericBand {
  return {
    ...band,
    color: resolveZoneAppearance(token, ZonePaletteKind.Screen).fill,
  };
}
