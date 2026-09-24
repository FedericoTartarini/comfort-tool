/**
 * Point-session buckets, cache, pending switch, and action types.
 * Calculation cache belongs to the output bucket; the class stores it as
 * `$state.raw` beside `output` because deep `$state` would proxy large objects.
 */
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type { ChartBuildResult } from "../../engines/comfort/charts/chartBuildResult";
import type {
  PhysicalQuantityId,
  PhysicalQuantityId as PhysicalQuantityIdType,
  QuantityState,
} from "../../catalog/quantities";
import type { DerivedSlotQuantityState } from "../../engines/comfort/derivations/psychrometrics";
import type { InputControlKey as InputControlKeyType } from "../../catalog/inputControls";
import type { ModelOptionsRecord, OptionKey as OptionKeyType } from "../../catalog/inputModes";
import type { UnitSystem as UnitSystemType } from "../../catalog/units";
import type {
  ModifierId as ModifierIdType,
  ModifierInputValues,
} from "../../catalog/inputModifiers";
import type { NumericBand } from "../../catalog/modelCapabilities";
import type { ChartInstanceDeclaration } from "../../catalog/chartTypes";
import type { SurfaceId as SurfaceIdType } from "../../catalog/surfaces";
import type { ShareStateSnapshot } from "./share/snapshot";
import type { QuantitiesByInputState } from "../../engines/comfort/quantityStateRouting";
import type {
  ChartControlsViewModel,
  InputModifierControlViewModel,
  InputPanelViewModel,
} from "./viewModels";
import type { ResultSectionViewModel } from "../../catalog/resultSections";
import type { InputControlViewModel } from "../../catalog/inputControls";

export type InputState = QuantityState;
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

export type CalculationCacheStatus = "empty" | "stale" | "ready";

export type ModelCalculationCache<ChartSourceType = unknown> = {
  status: CalculationCacheStatus;
  buildGeneration: number;
  lastVisibleInputIds: InputIdType[];
  valuesByInput: Record<InputIdType, QuantityState | null>;
  chartSource: ChartSourceType | null;
};

export type ModelCalculationCacheByModelState = Record<
  ModelIdType,
  ModelCalculationCache
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
  xAxis: PhysicalQuantityId;
  yAxis: PhysicalQuantityId;
  baselineInputId: InputIdType;
  exploreOutput: PhysicalQuantityIdType | null;
  exploreBands: NumericBand[] | null;
}

export type OutputSettingsByModelState = Record<ModelIdType, ModelOutputSettings>;

export type PointInputState = {
  quantitiesByInput: QuantitiesByInputState;
  modelOptionsByModel: ModelOptionsByModelState;
  activeModifiersByInput: ActiveModifiersByInputState;
  compareEnabled: boolean;
  compareInputIds: InputIdType[];
  activeInputId: InputIdType;
  unitSystem: UnitSystemType;
};

export type PointChartState = {
  selectedChartInstanceByModel: SelectedChartInstanceByModelState;
  outputSettingsByModel: OutputSettingsByModelState;
};

export type PointSettingState = {
  selectedModel: ModelIdType;
  activeSurface: SurfaceIdType;
  allowedModelIds: readonly ModelIdType[];
  pendingModelSwitch: PendingModelSwitch | null;
};

export type PointOutputState = {
  isLoading: boolean;
  errorMessage: string;
};

export type PointSessionBuckets = {
  input: PointInputState;
  chart: PointChartState;
  setting: PointSettingState;
  output: PointOutputState;
  calculationCacheByModel: ModelCalculationCacheByModelState;
};

export type PointActions = {
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
  setActiveSurface: (workspace: SurfaceIdType) => void;
  setAllowedModelIds: (modelIds: readonly ModelIdType[]) => void;
  setDynamicXAxis: (fieldKey: PhysicalQuantityId) => void;
  setDynamicYAxis: (fieldKey: PhysicalQuantityId) => void;
  setExploreOutput: (outputKey: PhysicalQuantityIdType) => void;
  setExploreBands: (bands: readonly NumericBand[]) => boolean;
  setChartBaselineInputId: (inputId: InputIdType) => void;
  exportShareSnapshot: () => ShareStateSnapshot;
  exportShareUrl: (locationSource: URL | Location | string) => string;
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

export type PointSession = PointSessionBuckets & {
  actions: PointActions;
  visibleInputIds: InputIdType[];
  inputControls: InputControlViewModel[];
  inputModifierDraft: InputModifierDraftEntry[];
  resultSections: ResultSectionViewModel[];
  chartBuild: ChartBuildResult;
  chartInstance: ChartInstanceDeclaration;
  chartInstances: readonly ChartInstanceDeclaration[];
  chartInstanceId: string;
  cacheStatus: CalculationCacheStatus;
  chartLegendZones: ReadonlyArray<{ label: string; color: string }> | null;
  chartLegendTitle: string;
  chartControls: ChartControlsViewModel;
  pendingModelSwitch: PendingModelSwitch | null;
  inputPanel: InputPanelViewModel;
  isLoading: boolean;
  bindSelectModel: (handler: (modelId: ModelIdType) => void) => void;
  inputModifierControls: (
    draft?: readonly InputModifierDraftEntry[],
  ) => InputModifierControlViewModel[];
  effectiveQuantities: (modelId?: ModelIdType) => QuantitiesByInputState;
};

export type {
  DerivedSlotQuantityState,
  QuantitiesByInputState,
  QuantityState,
};
