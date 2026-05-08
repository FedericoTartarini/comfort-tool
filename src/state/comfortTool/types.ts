/**
 * Canonical comfort-tool state types.
 * `inputsByInput` stays canonical in SI units, while `ui` stores serializable selections,
 * chart state, and calculation lifecycle flags.
 */
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
import type {
  PlotlyChartResponseDto,
  PmvChartSourceDto,
  PmvResponseDto,
  UtciChartSourceDto,
  UtciResponseDto,
  AdaptiveResponseDto,
  AdaptiveChartSourceDto,
  ThermalIndicesResponseDto,
  ThermalIndicesChartSourceDto,
} from "../../models/comfortDtos";
import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import type { ChartId as ChartIdType } from "../../models/chartOptions";
import type { InputControlId as InputControlIdType, InputControlViewModel } from "../../models/inputControls";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import { ComfortModel } from "../../models/comfortModels";
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

// Defines the color coding for the result cells.
export type ResultTone = "default" | "success" | "danger" | "warning" | "hiCaution" | "hiExtremeCaution" | "hiDanger" | "hiExtremeDanger" | "wcSafe" | "wc30min" | "wc10min" | "wc2min" | "pmvCold" | "pmvCool" | "pmvSlightlyCool" | "pmvNeutral" | "pmvSlightlyWarm" | "pmvWarm" | "pmvHot" | "utciExtremeCold" | "utciVeryStrongCold" | "utciStrongCold" | "utciModerateCold" | "utciSlightCold" | "utciNoStress" | "utciModerateHeat" | "utciStrongHeat" | "utciVeryStrongHeat" | "utciExtremeHeat";

// View model for a single result cell.
export type ResultCellViewModel = {
  text: string;
  subtext?: string;
  tone?: ResultTone;
};

// View model for a single result section.
export type ResultSectionViewModel = {
  title: string;
  group?: string;
  valuesByInput: Partial<Record<InputIdType, ResultCellViewModel | null>>;
};

// Cache status for calculations.
export type CalculationCacheStatus = "empty" | "stale" | "ready";
// State for PMV results.
export type PmvResultsState = Record<InputIdType, PmvResponseDto | null>;
// State for UTCI results.
export type UtciResultsState = Record<InputIdType, UtciResponseDto | null>;

// Base type for model calculation caches.
type ModelCalculationCacheBase = {
  status: CalculationCacheStatus;
  lastVisibleInputIds: InputIdType[];
};

// PMV Calculation Cache
export type PmvCalculationCache = ModelCalculationCacheBase & {
  resultsByInput: PmvResultsState;
  chartSource: PmvChartSourceDto | null;
};

// UTCI Calculation Cache
export type UtciCalculationCache = ModelCalculationCacheBase & {
  resultsByInput: UtciResultsState;
  chartSource: UtciChartSourceDto | null;
};

// Adaptive Results State
export type AdaptiveResultsState = Record<InputIdType, AdaptiveResponseDto | null>;

// Adaptive Calculation Cache
export type AdaptiveCalculationCache = ModelCalculationCacheBase & {
  resultsByInput: AdaptiveResultsState;
  chartSource: AdaptiveChartSourceDto | null;
};

// Thermal Indices Results State
export type ThermalIndicesResultsState = Record<InputIdType, ThermalIndicesResponseDto | null>;

// Thermal Indices Calculation Cache
export type ThermalIndicesCalculationCache = ModelCalculationCacheBase & {
  resultsByInput: ThermalIndicesResultsState;
  chartSource: ThermalIndicesChartSourceDto | null;
};

// Mapping of models to their respective calculation caches.
export type ModelCalculationCacheByModelState = {
  [ComfortModel.Pmv]: PmvCalculationCache;
  [ComfortModel.Utci]: UtciCalculationCache;
  [ComfortModel.AdaptiveAshrae]: AdaptiveCalculationCache;
  [ComfortModel.AdaptiveEn]: AdaptiveCalculationCache;
  [ComfortModel.HeatIndex]: ThermalIndicesCalculationCache;
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
  scheduleCalculation: (options?: { immediate?: boolean }) => void;
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
  getDynamicAxisOptions: () => FieldKeyType[];
};

// Controller that combines state, actions, and selectors for the comfort tool.
export type ComfortToolController = {
  state: ComfortToolStateSlice;
  actions: ComfortToolActions;
  selectors: ComfortToolSelectors;
};
