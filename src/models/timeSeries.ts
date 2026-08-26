import type { ModelId as ModelIdType } from "./comfortModels";
import type { UnitSystem as UnitSystemType } from "./units";

export interface TimeSeriesPresetDefinition {
  readonly id: string;
  readonly label: string;
}

export interface TimeSeriesSelectItem {
  readonly name: string;
  readonly value: string;
}

interface TimeSeriesControlDefinitionBase {
  readonly id: string;
  readonly label: string;
}

export interface TimeSeriesNumberControlDefinition<TDraft>
  extends TimeSeriesControlDefinitionBase {
  readonly kind: "number";
  readonly getDisplayValue: (
    draft: TDraft,
    unitSystem: UnitSystemType,
    segmentId?: string,
  ) => number;
  readonly applyDisplayValue: (
    draft: TDraft,
    rawValue: string,
    unitSystem: UnitSystemType,
    segmentId?: string,
  ) => boolean;
  readonly getDisplayUnits: (unitSystem: UnitSystemType) => string;
  readonly getStep: (unitSystem: UnitSystemType) => number;
  readonly getMin?: (unitSystem: UnitSystemType) => number;
  readonly getMax?: (unitSystem: UnitSystemType) => number;
}

export interface TimeSeriesSelectControlDefinition<TDraft>
  extends TimeSeriesControlDefinitionBase {
  readonly kind: "select";
  readonly items: readonly TimeSeriesSelectItem[];
  readonly getValue: (draft: TDraft) => string;
  readonly applyValue: (draft: TDraft, value: string) => boolean;
}

export interface TimeSeriesToggleControlDefinition<TDraft>
  extends TimeSeriesControlDefinitionBase {
  readonly kind: "toggle";
  readonly getValue: (draft: TDraft) => boolean;
  readonly applyValue: (draft: TDraft, value: boolean) => boolean;
}

export type TimeSeriesControlDefinition<TDraft> =
  | TimeSeriesNumberControlDefinition<TDraft>
  | TimeSeriesSelectControlDefinition<TDraft>
  | TimeSeriesToggleControlDefinition<TDraft>;

export interface TimeSeriesSegmentReference {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
}

export interface TimeSeriesSettingsSectionDefinition<TDraft> {
  readonly id: string;
  readonly title: string;
  readonly testId?: string;
  readonly controls: readonly TimeSeriesControlDefinition<TDraft>[];
}

export interface TimeSeriesEditorDefinition<TDraft> {
  readonly presets: readonly TimeSeriesPresetDefinition[];
  readonly segmentControls: readonly TimeSeriesNumberControlDefinition<TDraft>[];
  readonly settingsSections: readonly TimeSeriesSettingsSectionDefinition<TDraft>[];
  readonly getSegments: (draft: TDraft) => readonly TimeSeriesSegmentReference[];
  readonly createSegmentId: (sequence: number) => string;
  readonly updateSegmentName: (
    draft: TDraft,
    segmentId: string,
    name: string,
  ) => boolean;
  readonly updateSegmentDuration: (
    draft: TDraft,
    segmentId: string,
    rawValue: string,
  ) => boolean;
  readonly addSegment: (
    draft: TDraft,
    segmentId: string,
    presetId: string,
  ) => boolean;
  readonly duplicateSegment: (
    draft: TDraft,
    sourceSegmentId: string,
    newSegmentId: string,
  ) => boolean;
  readonly removeSegment: (draft: TDraft, segmentId: string) => boolean;
  readonly moveSegment: (
    draft: TDraft,
    segmentId: string,
    direction: -1 | 1,
  ) => boolean;
}

export interface TimeSeriesSimulationControls {
  readonly signal: AbortSignal;
  readonly onProgress: (progress: number) => void;
}

export interface TimeSeriesModelReference {
  readonly label: string;
  readonly href: string;
  readonly note?: string;
}

export interface TimeSeriesModelDefinition<TDraft, TResult> {
  readonly id: ModelIdType;
  readonly label: string;
  readonly description: string;
  readonly standardLabel: string;
  readonly reference?: TimeSeriesModelReference;
  readonly createDefaultDraft: () => TDraft;
  readonly cloneDraft: (draft: TDraft) => TDraft;
  readonly validate: (draft: TDraft) => string[];
  readonly editor: TimeSeriesEditorDefinition<TDraft>;
  readonly simulate: (
    draft: TDraft,
    controls: TimeSeriesSimulationControls,
  ) => Promise<TResult>;
}

export type RuntimeTimeSeriesModelDefinition = TimeSeriesModelDefinition<
  unknown,
  unknown
>;
