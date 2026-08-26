import type { ChartAxisQuantityId } from "../quantities";
import type { Band, ModelOutputKey, NumericBand } from "../modelCapabilities";

export const FieldChartProfileKind = {
  Compliance: "compliance",
  Explore: "explore",
} as const;

export type FieldChartProfileKind =
  (typeof FieldChartProfileKind)[keyof typeof FieldChartProfileKind];

interface FieldChartProfileBase {
  readonly kind: FieldChartProfileKind;
  readonly xField: ChartAxisQuantityId;
  readonly yField: ChartAxisQuantityId;
  readonly zOutput: ModelOutputKey;
}

export interface ComplianceFieldChartProfile<TBand extends Band = Band>
  extends FieldChartProfileBase {
  readonly kind: typeof FieldChartProfileKind.Compliance;
  readonly bands: readonly TBand[];
}

export interface ExploreFieldChartProfile extends FieldChartProfileBase {
  readonly kind: typeof FieldChartProfileKind.Explore;
  readonly bands: readonly NumericBand[];
}

export type FieldChartProfile<TBand extends Band = Band> =
  | ComplianceFieldChartProfile<TBand>
  | ExploreFieldChartProfile;
