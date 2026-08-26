import type { PlotlyChartSpec } from "../../services/plotlyTypes";
import type {
  TimeSeriesControlDefinition,
  TimeSeriesModelDefinition,
  TimeSeriesPresetDefinition,
  TimeSeriesSegmentReference,
  TimeSeriesSelectItem,
} from "../../models/timeSeries";
import type { UnitSystem as UnitSystemType } from "../../models/units";

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

export interface TimeSeriesChartViewModel {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly heightClass: string;
  readonly testId?: string;
  readonly chart: PlotlyChartSpec | null;
}

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
