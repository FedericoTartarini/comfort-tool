import type { ComfortModel as ComfortModelType } from "./comfortModels";
import type { PlotlyChartResponseDto } from "./comfortDtos";
import type { UnitSystem as UnitSystemType } from "./units";

export const PhsSegmentPreset = {
  Work: "work",
  Rest: "rest",
} as const;

export type PhsSegmentPreset =
  (typeof PhsSegmentPreset)[keyof typeof PhsSegmentPreset];

export interface TimeSeriesChartSet {
  readonly primary: PlotlyChartResponseDto;
  readonly secondary: PlotlyChartResponseDto;
}

export interface TimeSeriesModelDefinition<TSegment, TSettings, TResult> {
  readonly id: ComfortModelType;
  readonly label: string;
  readonly description: string;
  readonly standardLabel: string;
  readonly createDefaultSegments: () => TSegment[];
  readonly createDefaultSettings: () => TSettings;
  readonly createPresetSegment: (
    id: string,
    preset: PhsSegmentPreset,
    previous?: TSegment,
  ) => TSegment;
  readonly validate: (
    segments: readonly TSegment[],
    settings: TSettings,
  ) => string[];
  readonly calculate: (
    segments: readonly TSegment[],
    settings: TSettings,
  ) => TResult;
  readonly buildCharts: (
    result: TResult,
    unitSystem: UnitSystemType,
  ) => TimeSeriesChartSet;
}

export type RuntimeTimeSeriesModelDefinition = TimeSeriesModelDefinition<
  unknown,
  unknown,
  unknown
>;
