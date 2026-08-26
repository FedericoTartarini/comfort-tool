/**
 * Canonical comfort-tool state types.
 * `quantitiesByInput` stores base primary SI values, auxiliary slot quantities stay SI,
 * and `ui` stores selections, chart state, and calculation lifecycle flags.
 */
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ModelId as ModelIdType } from "../../models/modelIds";
import type { PlotlyChartSpec } from "../../services/plotlyTypes";
import type {
  PrimaryInputState,
  DerivedSlotQuantityState,
  ChartAxisQuantityId,
  AuxiliaryInputState,
  PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../models/quantities";
import type { InputControlKey as InputControlKeyType, InputControlViewModel } from "../../models/inputControls";
import type { ModelOptionsRecord, OptionKey as OptionKeyType } from "../../models/inputModes";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import type {
  ModifierId as ModifierIdType,
  ModifierInputValues,
} from "../../models/inputModifiers";
import type {
  ComplianceFeedback,
  ModelOutput,
  ModelOutputKey,
  NumericBand,
} from "../../models/modelCapabilities";
import type { FieldChartProfileKind } from "../../models/output/fieldChartProfile";
import type { ChartInstanceDeclaration } from "../../models/chartEngines";
import type { FieldChartProfile } from "../../models/output/fieldChartProfile";
import type { WorkspaceId as WorkspaceIdType } from "../../models/workspaces";
import type { ShareStateSnapshot } from "./shareState";
import type {
  AuxiliaryQuantitiesByInputState,
  ModelInputsByModelState,
  QuantitiesByInputState,
} from "../../services/comfort/quantityStateRouting";

export type InputState = PrimaryInputState;
export type ActiveModifiersByInputState = Record<
  InputIdType,
  Record<ModifierIdType, boolean>
>;

/** One modal-editing draft entry; modifier input values remain canonical SI. */
export interface InputModifierDraftEntry {
  inputId: InputIdType;
  modifierId: ModifierIdType;
  enabled: boolean;
  inputs: ModifierInputValues;
}
export type ModelOptionsState = ModelOptionsRecord;
export type ModelOptionsByModelState = Record<ModelIdType, ModelOptionsState>;
export type SelectedChartInstanceByModelState = Record<ModelIdType, string>;

import type {
  ResultCellViewModel,
  ResultSectionViewModel,
} from "../../models/output/resultSections";

export type { ResultCellViewModel, ResultSectionViewModel };

export type CalculationCacheStatus = "empty" | "stale" | "ready";

export type ModelCalculationCache<ResultType, ChartSourceType> = {
  status: CalculationCacheStatus;
  buildGeneration: number;
  lastVisibleInputIds: InputIdType[];
  resultsByInput: Record<InputIdType, ResultType | null>;
  chartSource: ChartSourceType | null;
};

export type ModelCalculationCacheByModelState = Record<
  ModelIdType,
  ModelCalculationCache<unknown, unknown>
>;
export interface ModelSwitchViolation {
  inputId: InputIdType;
  controlId: InputControlKeyType;
  label: string;
  currentValue: number;
  minAllowed: number;
  maxAllowed: number;
  displayUnits: string;
}

export type PendingModelSwitch = {
  targetModel: ModelIdType;
  violations: ModelSwitchViolation[];
};

/** Per-model output presentation state; numeric band edges remain canonical SI. */
export interface ModelOutputSettings {
  xAxis: ChartAxisQuantityId;
  yAxis: ChartAxisQuantityId;
  baselineInputId: InputIdType;
  exploreOutput: ModelOutputKey | null;
  exploreBands: NumericBand[] | null;
}

export type OutputSettingsByModelState = Record<ModelIdType, ModelOutputSettings>;

export interface ChartProfileBadgeViewModel {
  profileKind: FieldChartProfileKind;
  caption: string;
  feedback: (ComplianceFeedback & { inputLabel?: string }) | null;
}

export interface BaselineControl {
  selectedInputId: InputIdType;
  visibleInputIds: InputIdType[];
  onSelect: (inputId: InputIdType) => void;
}

export interface AxisControl {
  selectedField: ChartAxisQuantityId;
  options: ChartAxisQuantityId[];
  locked: boolean;
  onSelect: (fieldKey: ChartAxisQuantityId) => void;
}

export interface ExploreControls {
  profile: FieldChartProfile;
  outputs: readonly ModelOutput[];
  defaultBands: readonly NumericBand[];
  unitSystem: UnitSystemType;
  onSelectOutput: (outputKey: ModelOutputKey) => void;
  onApplyBands: (bands: readonly NumericBand[]) => boolean;
}

export interface ChartControlsViewModel {
  profileBadge: ChartProfileBadgeViewModel;
  baseline: BaselineControl | null;
  axes: {
    x: AxisControl;
    y: AxisControl;
  } | null;
  explore: ExploreControls | null;
}

export interface ModifierFieldControlViewModel {
  key: PhysicalQuantityIdType;
  label: string;
  displayUnits: string;
  step: number;
  decimals: number;
  minValue?: number;
  maxValue?: number;
  displayValuesByInput: Partial<Record<InputIdType, string>>;
}

export interface ModifierAffectedFieldViewModel {
  key: ChartAxisQuantityId;
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

export interface ToolControlsViewModel {
  selectedModel: ModelIdType;
  modelOptions: ReadonlyArray<{
    name: string;
    value: ModelIdType;
    description: string;
  }>;
  compareEnabled: boolean;
  unitSystem: UnitSystemType;
  onSelectModel: (modelId: ModelIdType) => void;
  onSetCompareEnabled: (enabled: boolean) => void;
  onToggleUnitSystem: () => void;
}

export interface CompareInputsViewModel {
  visibleInputIds: InputIdType[];
  onToggle: (inputId: InputIdType) => void;
}

export interface InputFieldRowViewModel {
  control: InputControlViewModel;
  visibleInputIds: InputIdType[];
  activeInputId: InputIdType;
  onActivateInput: (inputId: InputIdType) => void;
  onCommitValue: (inputId: InputIdType, rawValue: string) => string | null;
  onCommitPreset: (inputId: InputIdType, value: number) => void;
  onSelectOption: (optionKey: OptionKeyType, value: string) => void;
}

export interface ClothingBuilderViewModel {
  maxValue: number;
  activeInputId: InputIdType;
  visibleInputIds: InputIdType[];
  onSelectInput: (inputId: InputIdType) => void;
  onApplyClothingValue: (inputId: InputIdType, value: number) => void;
}

export interface InputModifiersViewModel {
  editorContextKey: string;
  visibleInputIds: InputIdType[];
  activeCount: number;
  availableCount: number;
  controls: InputModifierControlViewModel[];
  getDraft: () => InputModifierDraftEntry[];
  projectDraft: (
    draft: readonly InputModifierDraftEntry[],
  ) => InputModifierControlViewModel[];
  applyDraft: (draft: readonly InputModifierDraftEntry[]) => boolean;
  setDraftEnabled: (
    draft: readonly InputModifierDraftEntry[],
    inputId: InputIdType,
    modifierId: ModifierIdType,
    enabled: boolean,
  ) => InputModifierDraftEntry[] | null;
  updateDraftInput: (
    draft: readonly InputModifierDraftEntry[],
    inputId: InputIdType,
    modifierId: ModifierIdType,
    quantityId: PhysicalQuantityIdType,
    rawValue: string,
  ) => InputModifierDraftEntry[] | null;
}

export interface InputPanelViewModel {
  tool: ToolControlsViewModel;
  compare: CompareInputsViewModel | null;
  fields: InputFieldRowViewModel[];
  clothingBuilder: ClothingBuilderViewModel | null;
  modifiers: InputModifiersViewModel | null;
}

export type UiState = {
  selectedModel: ModelIdType;
  selectedChartInstanceByModel: SelectedChartInstanceByModelState;
  modelOptionsByModel: ModelOptionsByModelState;
  compareEnabled: boolean;
  compareInputIds: InputIdType[];
  activeInputId: InputIdType;
  unitSystem: UnitSystemType;
  activeWorkspace: WorkspaceIdType;
  outputSettingsByModel: OutputSettingsByModelState;
  isLoading: boolean;
  errorMessage: string;
  calculationCacheByModel: ModelCalculationCacheByModelState;
  pendingModelSwitch: PendingModelSwitch | null;
};

export type AnalysisStateSlice = {
  quantitiesByInput: QuantitiesByInputState;
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState;
  modelInputsByModel: ModelInputsByModelState;
  activeModifiersByInput: ActiveModifiersByInputState;
  ui: UiState;
};

export type AnalysisActions = {
  setSelectedModel: (
    nextModel: ModelIdType,
    options?: { validateRanges?: boolean; schedule?: boolean },
  ) => void;
  setSelectedChartInstance: (instanceId: string) => void;
  setModelOption: (optionKey: OptionKeyType, nextValue: string) => void;
  setCompareEnabled: (enabled: boolean) => void;
  setActiveInputId: (nextInputId: InputIdType) => void;
  toggleCompareInputVisibility: (inputId: InputIdType) => void;
  toggleUnitSystem: () => void;
  setActiveWorkspace: (workspace: WorkspaceIdType) => void;
  setDynamicXAxis: (fieldKey: ChartAxisQuantityId) => void;
  setDynamicYAxis: (fieldKey: ChartAxisQuantityId) => void;
  setExploreOutput: (outputKey: ModelOutputKey) => void;
  setExploreBands: (bands: readonly NumericBand[]) => boolean;
  setChartBaselineInputId: (inputId: InputIdType) => void;
  exportShareSnapshot: () => ShareStateSnapshot;
  applyShareSnapshot: (
    snapshot: ShareStateSnapshot,
    options?: { schedule?: boolean },
  ) => void;
  updateInput: (inputId: InputIdType, controlId: InputControlKeyType, rawValue: string) => void;
  updateBuiltinQuantity: (
    inputId: InputIdType,
    quantityId: PhysicalQuantityIdType,
    valueSi: number,
  ) => boolean;
  updateModelQuantity: (
    modelId: ModelIdType,
    quantityId: PhysicalQuantityIdType,
    valueSi: number,
  ) => boolean;
  updateModifierInput: (
    inputId: InputIdType,
    modifierId: ModifierIdType,
    quantityId: PhysicalQuantityIdType,
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

export type AnalysisSelectors = {
  getVisibleInputIds: () => InputIdType[];
  getInputControls: () => InputControlViewModel[];
  getInputPanelViewModel: (
    allowedModelIds: readonly ModelIdType[],
    onSelectModel: (modelId: ModelIdType) => void,
  ) => InputPanelViewModel;
  getInputModifierDraft: () => InputModifierDraftEntry[];
  getInputModifierControls: (
    draft?: readonly InputModifierDraftEntry[],
  ) => InputModifierControlViewModel[];
  getEffectiveQuantitiesByInput: (modelId?: ModelIdType) => QuantitiesByInputState;
  getResultSections: () => ResultSectionViewModel[];
  getCurrentChartResult: () => PlotlyChartSpec | null;
  getCurrentChartInstance: () => ChartInstanceDeclaration;
  getCurrentChartInstances: () => readonly ChartInstanceDeclaration[];
  getCurrentChartInstanceId: () => string;
  getCurrentCacheStatus: () => CalculationCacheStatus;
  getCurrentChartLegendZones: () => ReadonlyArray<{ label: string; color: string }> | null;
  getCurrentChartLegendTitle: () => string;
  getChartControlsViewModel: () => ChartControlsViewModel;
  getPendingModelSwitch: () => PendingModelSwitch | null;
};

export type AnalysisController = {
  state: AnalysisStateSlice;
  actions: AnalysisActions;
  selectors: AnalysisSelectors;
};

export type {
  AuxiliaryInputState,
  AuxiliaryQuantitiesByInputState,
  PrimaryInputState,
  DerivedSlotQuantityState,
  ModelInputsByModelState,
  QuantitiesByInputState,
};
