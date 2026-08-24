import type { ComfortModel as ComfortModelType } from "./comfortModels";
import type { PlotlyChartResponseDto } from "./comfortDtos";
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

export interface TimeSeriesNumberControlViewModel {
  readonly kind: "number";
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly displayUnits: string;
  readonly step: number;
  readonly min?: number;
  readonly max?: number;
}

export interface TimeSeriesSelectControlViewModel {
  readonly kind: "select";
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly items: readonly TimeSeriesSelectItem[];
}

export interface TimeSeriesToggleControlViewModel {
  readonly kind: "toggle";
  readonly id: string;
  readonly label: string;
  readonly value: boolean;
}

export type TimeSeriesControlViewModel =
  | TimeSeriesNumberControlViewModel
  | TimeSeriesSelectControlViewModel
  | TimeSeriesToggleControlViewModel;

export interface TimeSeriesSegmentViewModel extends TimeSeriesSegmentReference {
  readonly controls: readonly TimeSeriesNumberControlViewModel[];
}

export interface TimeSeriesSettingsSectionViewModel {
  readonly id: string;
  readonly title: string;
  readonly testId?: string;
  readonly controls: readonly TimeSeriesControlViewModel[];
}

export interface TimeSeriesEditorViewModel {
  readonly presets: readonly TimeSeriesPresetDefinition[];
  readonly segments: readonly TimeSeriesSegmentViewModel[];
  readonly settingsSections: readonly TimeSeriesSettingsSectionViewModel[];
}

export interface TimeSeriesSimulationControls {
  readonly signal: AbortSignal;
  readonly onProgress: (progress: number) => void;
}


export interface TimeSeriesChartViewModel {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly heightClass: string;
  readonly testId?: string;
  readonly chart: PlotlyChartResponseDto | null;
}

export interface TimeSeriesModelReference {
  readonly label: string;
  readonly href: string;
  readonly note?: string;
}

export interface TimeSeriesModelDefinition<TDraft, TResult> {
  readonly id: ComfortModelType;
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

function buildControlViewModel<TDraft>(
  control: TimeSeriesControlDefinition<TDraft>,
  draft: TDraft,
  unitSystem: UnitSystemType,
  segmentId?: string,
): TimeSeriesControlViewModel {
  if (control.kind === "number") {
    return {
      kind: control.kind,
      id: control.id,
      label: control.label,
      value: control.getDisplayValue(draft, unitSystem, segmentId),
      displayUnits: control.getDisplayUnits(unitSystem),
      step: control.getStep(unitSystem),
      ...(control.getMin ? { min: control.getMin(unitSystem) } : {}),
      ...(control.getMax ? { max: control.getMax(unitSystem) } : {}),
    };
  }
  if (control.kind === "select") {
    return {
      kind: control.kind,
      id: control.id,
      label: control.label,
      value: control.getValue(draft),
      items: control.items,
    };
  }
  return {
    kind: control.kind,
    id: control.id,
    label: control.label,
    value: control.getValue(draft),
  };
}

export function buildTimeSeriesEditorViewModel<TDraft>(
  definition: TimeSeriesModelDefinition<TDraft, unknown>,
  draft: TDraft,
  unitSystem: UnitSystemType,
): TimeSeriesEditorViewModel {
  return {
    presets: definition.editor.presets,
    segments: definition.editor.getSegments(draft).map((segment) => ({
      ...segment,
      controls: definition.editor.segmentControls.map((control) => (
        buildControlViewModel(
          control,
          draft,
          unitSystem,
          segment.id,
        ) as TimeSeriesNumberControlViewModel
      )),
    })),
    settingsSections: definition.editor.settingsSections.map((section) => ({
      id: section.id,
      title: section.title,
      ...(section.testId ? { testId: section.testId } : {}),
      controls: section.controls.map((control) => (
        buildControlViewModel(control, draft, unitSystem)
      )),
    })),
  };
}
