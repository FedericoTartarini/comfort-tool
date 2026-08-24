import type {
  TimeSeriesChartViewModel,
  TimeSeriesEditorViewModel,
  TimeSeriesModelReference,
} from "../../models/timeSeries";
import type { MetricSummaryItemViewModel } from "../../models/output/tableLayouts";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import type { TimeSeriesModelId } from "./modelConfigs";

export type TimeSeriesRunStatus =
  | "waiting"
  | "updating"
  | "ready"
  | "error";

export interface TimeSeriesStateSlice {
  selectedModel: TimeSeriesModelId;
  unitSystem: UnitSystemType;
  draftByModel: Record<TimeSeriesModelId, unknown>;
  resultByModel: Record<TimeSeriesModelId, unknown | null>;
  statusByModel: Record<TimeSeriesModelId, TimeSeriesRunStatus>;
  errorsByModel: Record<TimeSeriesModelId, string[]>;
  revisionByModel: Record<TimeSeriesModelId, number>;
  progressByModel: Record<TimeSeriesModelId, number>;
}

export interface TimeSeriesModelOption {
  readonly name: string;
  readonly value: TimeSeriesModelId;
}

export interface TimeSeriesModelViewModel {
  readonly label: string;
  readonly description: string;
  readonly standardLabel: string;
  readonly reference?: TimeSeriesModelReference;
}

export interface TimeSeriesActions {
  start: () => void;
  dispose: () => void;
  selectModel: (modelId: TimeSeriesModelId) => void;
  toggleUnitSystem: () => void;
  updateSegmentName: (segmentId: string, name: string) => void;
  updateSegmentDuration: (segmentId: string, rawValue: string) => boolean;
  updateSegmentControl: (
    segmentId: string,
    controlId: string,
    rawDisplayValue: string,
  ) => boolean;
  addSegment: (presetId: string) => void;
  duplicateSegment: (segmentId: string) => void;
  removeSegment: (segmentId: string) => void;
  moveSegment: (segmentId: string, direction: -1 | 1) => void;
  updateSettingControl: (
    controlId: string,
    value: string | boolean,
  ) => boolean;
  reset: () => void;
}

export interface TimeSeriesSelectors {
  getModelOptions: () => readonly TimeSeriesModelOption[];
  getCurrentModel: () => TimeSeriesModelViewModel;
  getEditor: () => TimeSeriesEditorViewModel;
  getTotalDurationMinutes: () => number;
  getSelectedResult: () => unknown | null;
  getStatus: () => TimeSeriesRunStatus;
  getErrors: () => readonly string[];
  getProgress: () => number;
  hasStaleResult: () => boolean;
  getSummary: () => readonly MetricSummaryItemViewModel[];
  getCharts: () => readonly TimeSeriesChartViewModel[];
}

export interface TimeSeriesController {
  state: TimeSeriesStateSlice;
  actions: TimeSeriesActions;
  selectors: TimeSeriesSelectors;
}
