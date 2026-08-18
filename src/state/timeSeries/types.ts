import type {
  PhsPersonSettingsSi,
  PhsPosture,
  PhsTimeSeriesResult,
  PhsTimeSeriesSegment,
} from "../../models/phs";
import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import type {
  PhsSegmentPreset,
  TimeSeriesChartSet,
} from "../../models/timeSeries";
import type { TimeSeriesModelId } from "./modelConfigs";

export type TimeSeriesRunStatus =
  | "idle"
  | "dirty"
  | "running"
  | "ready"
  | "error";

export interface TimeSeriesStateSlice {
  selectedModel: TimeSeriesModelId;
  unitSystem: UnitSystemType;
  segments: PhsTimeSeriesSegment[];
  person: PhsPersonSettingsSi;
  status: TimeSeriesRunStatus;
  validationIssues: string[];
  lastSuccessfulResult: PhsTimeSeriesResult | null;
}

export interface TimeSeriesActions {
  toggleUnitSystem: () => void;
  updateSegmentName: (segmentId: string, name: string) => void;
  updateSegmentField: (
    segmentId: string,
    field: FieldKeyType,
    rawDisplayValue: string,
  ) => boolean;
  updateSegmentDuration: (
    segmentId: string,
    rawValue: string,
  ) => boolean;
  addSegment: (preset: PhsSegmentPreset) => void;
  duplicateSegment: (segmentId: string) => void;
  removeSegment: (segmentId: string) => void;
  moveSegment: (segmentId: string, direction: -1 | 1) => void;
  updatePersonNumber: (
    field: "weightKg" | "heightM",
    rawDisplayValue: string,
  ) => boolean;
  setPosture: (posture: PhsPosture) => void;
  setAcclimatized: (value: boolean) => void;
  setDrinkingAllowed: (value: boolean) => void;
  reset: () => void;
  runSimulation: () => boolean;
}

export interface TimeSeriesSelectors {
  getSegmentDisplayValue: (
    segment: PhsTimeSeriesSegment,
    field: FieldKeyType,
  ) => number;
  getPersonDisplayValue: (field: "weightKg" | "heightM") => number;
  getTotalDurationMinutes: () => number;
  hasStaleResult: () => boolean;
  getCharts: () => TimeSeriesChartSet | null;
}

export interface TimeSeriesController {
  state: TimeSeriesStateSlice;
  actions: TimeSeriesActions;
  selectors: TimeSeriesSelectors;
}
