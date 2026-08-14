/**
 * Canonical comfort-tool state types.
 * `inputsByInput` stores base SI values, modifier inputs stay SI, and `ui` stores
 * selections, chart state, and calculation lifecycle flags.
 */
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
import type { PlotlyChartResponseDto } from "../../models/comfortDtos";
import type {
  CanonicalInputState,
  FieldKey as FieldKeyType,
} from "../../models/fieldKeys";
import type {
  ChartId as ChartIdType,
  ModelChartDefinition,
} from "../../models/chartOptions";
import type { InputControlId as InputControlIdType, InputControlViewModel } from "../../models/inputControls";
import type { ModelOptionsRecord, OptionKey as OptionKeyType } from "../../models/inputModes";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import type {
  ModifierFieldKey as ModifierFieldKeyType,
  ModifierId as ModifierIdType,
  ModifierInputValues,
} from "../../models/inputModifiers";
import type {
  ChartMode as ChartModeType,
  ComplianceFeedback,
  ExploreFieldChartConfig,
  ModelOutput,
  ModelOutputKey,
  NumericBand,
} from "../../models/modelCapabilities";
import type { ShareStateSnapshot } from "./shareState";

export type InputState = CanonicalInputState;
export type InputsByInputState = Record<InputIdType, InputState>;
export type ActiveModifiersByInputState = Record<
  InputIdType,
  Record<ModifierIdType, boolean>
>;
export type ModifierInputsByInputState = Record<
  InputIdType,
  Record<ModifierIdType, ModifierInputValues>
>;

/** One modal-editing draft entry; modifier input values remain canonical SI. */
export interface InputModifierDraftEntry {
  inputId: InputIdType;
  modifierId: ModifierIdType;
  enabled: boolean;
  inputs: ModifierInputValues;
}
export type ModelOptionsState = ModelOptionsRecord;
export type ModelOptionsByModelState = Record<ComfortModelType, ModelOptionsState>;
export type SelectedChartByModelState = Record<ComfortModelType, ChartIdType>;

export type ResultCellViewModel = {
  text: string;
  subtext?: string;
  color?: string;
};

export type ResultSectionViewModel = {
  title: string;
  group?: string;
  valuesByInput: Partial<Record<InputIdType, ResultCellViewModel | null>>;
};

export type CalculationCacheStatus = "empty" | "stale" | "ready";

export type ModelCalculationCache<ResultType, ChartSourceType> = {
  status: CalculationCacheStatus;
  lastVisibleInputIds: InputIdType[];
  resultsByInput: Record<InputIdType, ResultType | null>;
  chartSource: ChartSourceType | null;
};

export type ModelCalculationCacheByModelState = Record<
  ComfortModelType,
  ModelCalculationCache<unknown, unknown>
>;
export interface ModelSwitchViolation {
  inputId: InputIdType;
  controlId: InputControlIdType;
  label: string;
  currentValue: number;
  minAllowed: number;
  maxAllowed: number;
  displayUnits: string;
}

export type PendingModelSwitch = {
  targetModel: ComfortModelType;
  violations: ModelSwitchViolation[];
};

/** Transient Explore selections; numeric band edges remain canonical SI. */
export interface ExploreChartState {
  zOutput: ModelOutputKey;
  bands: NumericBand[];
}

/** Per-model field-chart presentation state; all numeric values remain canonical SI. */
export interface ModelChartSettings {
  mode: ChartModeType;
  xAxis: FieldKeyType;
  yAxis: FieldKeyType;
  explore: ExploreChartState | null;
  baselineInputId: InputIdType;
}

export type ChartSettingsByModelState = Record<ComfortModelType, ModelChartSettings>;

export interface ChartModeControlViewModel {
  selectedMode: ChartModeType;
  caption: string;
  feedback: (ComplianceFeedback & { inputLabel?: string }) | null;
}

export interface BaselineControl {
  selectedInputId: InputIdType;
  visibleInputIds: InputIdType[];
  onSelect: (inputId: InputIdType) => void;
}

export interface AxisControl {
  selectedField: FieldKeyType;
  options: FieldKeyType[];
  locked: boolean;
  onSelect: (fieldKey: FieldKeyType) => void;
}

export interface ExploreControls {
  config: ExploreFieldChartConfig;
  outputs: readonly ModelOutput[];
  defaultBands: readonly NumericBand[];
  unitSystem: UnitSystemType;
  onSelectOutput: (outputKey: ModelOutputKey) => void;
  onApplyBands: (bands: readonly NumericBand[]) => boolean;
}

export interface ChartControlsViewModel {
  mode: ChartModeControlViewModel;
  baseline: BaselineControl | null;
  axes: {
    x: AxisControl;
    y: AxisControl;
  } | null;
  explore: ExploreControls | null;
}

export interface ModifierFieldControlViewModel {
  key: ModifierFieldKeyType;
  label: string;
  displayUnits: string;
  step: number;
  decimals: number;
  minValue?: number;
  maxValue?: number;
  displayValuesByInput: Partial<Record<InputIdType, string>>;
}

export interface ModifierAffectedFieldViewModel {
  key: FieldKeyType;
  label: string;
  displayUnits: string;
  displayValuesByInput: Partial<Record<InputIdType, string>>;
}

export interface InputModifierControlViewModel {
  id: ModifierIdType;
  label: string;
  description: string;
  activeByInput: Partial<Record<InputIdType, boolean>>;
  completeByInput: Partial<Record<InputIdType, boolean>>;
  extraInputs: ModifierFieldControlViewModel[];
  affectedFields: ModifierAffectedFieldViewModel[];
}

export type UiState = {
  selectedModel: ComfortModelType;
  selectedChartByModel: SelectedChartByModelState;
  modelOptionsByModel: ModelOptionsByModelState;
  compareEnabled: boolean;
  compareInputIds: InputIdType[];
  activeInputId: InputIdType;
  unitSystem: UnitSystemType;
  chartSettingsByModel: ChartSettingsByModelState;
  isLoading: boolean;
  errorMessage: string;
  calculationCacheByModel: ModelCalculationCacheByModelState;
  pendingModelSwitch: PendingModelSwitch | null;
};

export type ComfortToolStateSlice = {
  inputsByInput: InputsByInputState;
  activeModifiersByInput: ActiveModifiersByInputState;
  modifierInputsByInput: ModifierInputsByInputState;
  ui: UiState;
};

export type ComfortToolActions = {
  setSelectedModel: (
    nextModel: ComfortModelType,
    options?: { validateRanges?: boolean; schedule?: boolean },
  ) => void;
  setSelectedChart: (nextChart: ChartIdType) => void;
  setModelOption: (optionKey: OptionKeyType, nextValue: string) => void;
  setCompareEnabled: (enabled: boolean) => void;
  setActiveInputId: (nextInputId: InputIdType) => void;
  toggleCompareInputVisibility: (inputId: InputIdType) => void;
  toggleUnitSystem: () => void;
  setChartMode: (mode: ChartModeType) => void;
  setDynamicXAxis: (fieldKey: FieldKeyType) => void;
  setDynamicYAxis: (fieldKey: FieldKeyType) => void;
  setExploreOutput: (outputKey: ModelOutputKey) => void;
  setExploreBands: (bands: readonly NumericBand[]) => boolean;
  setChartBaselineInputId: (inputId: InputIdType) => void;
  exportShareSnapshot: () => ShareStateSnapshot;
  applyShareSnapshot: (
    snapshot: ShareStateSnapshot,
    options?: { schedule?: boolean },
  ) => void;
  updateInput: (inputId: InputIdType, controlId: InputControlIdType, rawValue: string) => void;
  updateModifierInput: (
    inputId: InputIdType,
    modifierId: ModifierIdType,
    fieldKey: ModifierFieldKeyType,
    rawValue: string,
  ) => boolean;
  setModifierEnabled: (
    inputId: InputIdType,
    modifierId: ModifierIdType,
    enabled: boolean,
  ) => boolean;
  applyInputModifierDraft: (
    draft: readonly InputModifierDraftEntry[],
  ) => boolean;
  scheduleCalculation: (options?: { immediate?: boolean; force?: boolean }) => void;
  confirmModelSwitch: (options?: { schedule?: boolean }) => void;
  cancelModelSwitch: () => void;
};

export type ComfortToolSelectors = {
  getVisibleInputIds: () => InputIdType[];
  getInputControls: () => InputControlViewModel[];
  getInputModifierDraft: () => InputModifierDraftEntry[];
  getInputModifierControls: (
    draft?: readonly InputModifierDraftEntry[],
  ) => InputModifierControlViewModel[];
  getEffectiveInputsByInput: (modelId?: ComfortModelType) => InputsByInputState;
  getResultSections: () => ResultSectionViewModel[];
  getCurrentChartResult: () => PlotlyChartResponseDto | null;
  getCurrentChartDefinition: () => ModelChartDefinition;
  getCurrentChartOptions: () => readonly ModelChartDefinition[];
  getCurrentSelectedChart: () => ChartIdType;
  getCurrentCacheStatus: () => CalculationCacheStatus;
  getCurrentChartLegendZones: () => ReadonlyArray<{ label: string; color: string }> | null;
  getCurrentChartLegendTitle: () => string;
  getChartControlsViewModel: () => ChartControlsViewModel;
  getPendingModelSwitch: () => PendingModelSwitch | null;
};

export type ComfortToolController = {
  state: ComfortToolStateSlice;
  actions: ComfortToolActions;
  selectors: ComfortToolSelectors;
};
