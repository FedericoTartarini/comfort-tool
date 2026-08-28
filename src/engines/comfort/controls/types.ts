import type { PrimaryInputState, PhysicalQuantityId as PhysicalQuantityIdType } from "../../../catalog/quantities";
import type {
  InputControlViewModel,
  InputControlId as InputControlIdType,
} from "../../../catalog/inputControls";
import type { ModelOptionsRecord } from "../../../catalog/inputModes";
import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
import {
  AuxiliaryQuantitiesByInputState,
  QuantitiesByInputState,
} from "../quantityStateRouting";

export type BehaviorPatch = {
  /** Canonical-SI primary quantity changes keyed by input slot. */
  quantitiesPatch?: Partial<Record<InputIdType, Partial<PrimaryInputState>>>;
  optionsPatch?: ModelOptionsRecord;
  modelInputsPatch?: Partial<Record<PhysicalQuantityIdType, number>>;
};

export type ControlBehaviorContext = {
  quantitiesByInput: QuantitiesByInputState;
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState;
  modelInputs: Partial<Record<PhysicalQuantityIdType, number>>;
  options: ModelOptionsRecord;
  unitSystem: UnitSystemType;
  visibleInputIds: InputIdType[];
};

export function createControlBehaviorContext(options: {
  quantitiesByInput: QuantitiesByInputState;
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState;
  modelInputs: Partial<Record<PhysicalQuantityIdType, number>>;
  options: ModelOptionsRecord;
  unitSystem: UnitSystemType;
  visibleInputIds: InputIdType[];
}): ControlBehaviorContext {
  return {
    quantitiesByInput: options.quantitiesByInput,
    auxiliaryQuantitiesByInput: options.auxiliaryQuantitiesByInput,
    modelInputs: options.modelInputs,
    options: options.options,
    unitSystem: options.unitSystem,
    visibleInputIds: options.visibleInputIds,
  };
}

export interface InputControlBehavior {
  buildViewModel: (context: ControlBehaviorContext) => InputControlViewModel;
  applyInput?: (
    context: ControlBehaviorContext,
    inputId: InputIdType,
    rawValue: string,
  ) => BehaviorPatch | null;
}
export type InputControlDefinition = {
  id: InputControlIdType | PhysicalQuantityIdType;
  behavior: InputControlBehavior;
};

export function createSingleInputPatch(
  inputId: InputIdType,
  inputState: Partial<PrimaryInputState>,
): BehaviorPatch {
  return {
    quantitiesPatch: {
      [inputId]: inputState,
    },
  };
}
