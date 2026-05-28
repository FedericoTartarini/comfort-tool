/**
 * Canonical comfort-tool state types.
 * `inputsByInput` stays canonical in SI units, while `ui` stores serializable selections,
 * chart state, and calculation lifecycle flags.
 */
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
import type { PlotlyChartResponseDto } from "../../models/comfortDtos";
import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import type { ChartId as ChartIdType } from "../../models/chartOptions";
import type { InputControlId as InputControlIdType, InputControlViewModel } from "../../models/inputControls";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import type { ShareStateSnapshot } from "./shareState";

// State for a single input.
export type InputState = Record<FieldKeyType, number>;
// State for multiple inputs.
export type InputsByInputState = Record<InputIdType, InputState>;
// State for model options.
export type ModelOptionsState = Partial<Record<OptionKeyType, string>>;
// State for model options by model.
export type ModelOptionsByModelState = Record<ComfortModelType, ModelOptionsState>;
// State of the currently selected chart for each model.
export type SelectedChartByModelState = Record<ComfortModelType, ChartIdType>;

// View model for a single result cell.
export type ResultCellViewModel = {
  text: string;
  subtext?: string;
  color?: string;
};

// View model for a single result section.
export type ResultSectionViewModel = {
  title: string;
  group?: string;
  valuesByInput: Partial<Record<InputIdType, ResultCellViewModel | null>>;
};

// Cache status for calculations.
export type CalculationCacheStatus = "empty" | "stale" | "ready";

// Generic model calculation cache decoupled from individual model definitions.
export type ModelCalculationCache<ResultType, ChartSourceType> = {
  status: CalculationCacheStatus;
  lastVisibleInputIds: InputIdType[];
  resultsByInput: Record<InputIdType, ResultType | null>;
  chartSource: ChartSourceType | null;
};

// Mapping of models to their respective generic calculation caches.
export type ModelCalculationCacheByModelState = Record<
  ComfortModelType,
  ModelCalculationCache<unknown, unknown>
>;
// Reporting input range violations when switching models.
export interface ModelSwitchViolation {
  inputId: InputIdType;
  controlId: InputControlIdType;
  label: string;
  currentValue: number;
  minAllowed: number;
  maxAllowed: number;
  displayUnits: string;
}

// Temporary state for a model switch that has not yet been confirmed.
export type PendingModelSwitch = {
  targetModel: ComfortModelType;
  violations: ModelSwitchViolation[];
};

// UI state for the comfort tool.
export type UiState = {
  selectedModel: ComfortModelType;
  selectedChartByModel: SelectedChartByModelState;
  modelOptionsByModel: ModelOptionsByModelState;
  compareEnabled: boolean;
  compareInputIds: InputIdType[];
  activeInputId: InputIdType;
  unitSystem: UnitSystemType;
  dynamicXAxis: FieldKeyType;
  dynamicYAxis: FieldKeyType;
  chartBaselineInputId: InputIdType;
  isLoading: boolean;
  errorMessage: string;
  calculationCacheByModel: ModelCalculationCacheByModelState;
  pendingModelSwitch: PendingModelSwitch | null;
};

// The main state slice for the comfort tool, containing both input data and UI state.
export type ComfortToolStateSlice = {
  inputsByInput: InputsByInputState;
  ui: UiState;
};

// Actions for updating the comfort tool state.
export type ComfortToolActions = {
  setSelectedModel: (nextModel: ComfortModelType) => void;
  setSelectedChart: (nextChart: ChartIdType) => void;
  setModelOption: (optionKey: OptionKeyType, nextValue: string) => void;
  setCompareEnabled: (enabled: boolean) => void;
  setActiveInputId: (nextInputId: InputIdType) => void;
  toggleCompareInputVisibility: (inputId: InputIdType) => void;
  toggleUnitSystem: () => void;
  setDynamicXAxis: (fieldKey: FieldKeyType) => void;
  setDynamicYAxis: (fieldKey: FieldKeyType) => void;
  setChartBaselineInputId: (inputId: InputIdType) => void;
  exportShareSnapshot: () => ShareStateSnapshot;
  applyShareSnapshot: (snapshot: ShareStateSnapshot) => void;
  updateInput: (inputId: InputIdType, controlId: InputControlIdType, rawValue: string) => void;
  scheduleCalculation: (options?: { immediate?: boolean; force?: boolean }) => void;
  confirmModelSwitch: () => void;
  cancelModelSwitch: () => void;
};

// Selectors for retrieving computed values from the state.
export type ComfortToolSelectors = {
  getVisibleInputIds: () => InputIdType[];
  getInputControls: () => InputControlViewModel[];
  getResultSections: () => ResultSectionViewModel[];
  getCurrentChartResult: () => PlotlyChartResponseDto | null;
  getCurrentChartEmptyMessage: () => string;
  getCurrentChartOptions: () => Array<{ name: string; value: ChartIdType }>;
  getCurrentSelectedChart: () => ChartIdType;
  getCurrentChartHeightClass: () => string;
  getCurrentCacheStatus: () => CalculationCacheStatus;
  getCurrentChartLockYAxis: () => boolean;
  getCurrentChartLegendZones: () => ReadonlyArray<{ label: string; color: string }> | null;
  getCurrentChartLegendTitle: () => string;
  getDynamicAxisOptions: () => FieldKeyType[];
  getPendingModelSwitch: () => PendingModelSwitch | null;
};

// Controller that combines state, actions, and selectors for the comfort tool.
export type ComfortToolController = {
  state: ComfortToolStateSlice;
  actions: ComfortToolActions;
  selectors: ComfortToolSelectors;
};
