/**
 * Point-session view-models: read-only projections for one screen.
 * These are not a second store. Class `$derived` fields call the builders.
 */
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type {
  PhysicalQuantityId,
  PhysicalQuantityId as PhysicalQuantityIdType,
} from "../../catalog/quantities";
import type { InputControlViewModel } from "../../catalog/inputControls";
import type { OptionKey as OptionKeyType } from "../../catalog/inputModes";
import type { UnitSystem as UnitSystemType } from "../../catalog/units";
import type { ModifierId as ModifierIdType } from "../../catalog/inputModifiers";
import type {
  ComplianceFeedback,
  ModelOutput,
  NumericBand,
} from "../../catalog/modelCapabilities";
import type { FieldChartProfileKind } from "../../catalog/fieldChartProfile";
import type { FieldChartProfile } from "../../catalog/fieldChartProfile";
import type { InputModifierDraftEntry } from "./sessionTypes";

export type {
  ResultCellViewModel,
  ResultSectionViewModel,
} from "../../catalog/resultSections";

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
  selectedField: PhysicalQuantityId;
  options: PhysicalQuantityId[];
  locked: boolean;
  onSelect: (fieldKey: PhysicalQuantityId) => void;
}

export interface ExploreControls {
  profile: FieldChartProfile;
  outputs: readonly ModelOutput[];
  defaultBands: readonly NumericBand[];
  unitSystem: UnitSystemType;
  onSelectOutput: (outputKey: PhysicalQuantityIdType) => void;
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
  minValue?: number;
  maxValue?: number;
  displayValuesByInput: Partial<Record<InputIdType, string>>;
}

export interface ModifierAffectedFieldViewModel {
  key: PhysicalQuantityId;
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
  modifierInputs: ModifierFieldControlViewModel[];
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
