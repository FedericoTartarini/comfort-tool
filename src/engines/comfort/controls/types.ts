import type { PhysicalQuantityId as PhysicalQuantityIdType, QuantityState } from "../../../catalog/quantities";
import type {
  InputControlViewModel,
  InputControlId as InputControlIdType,
} from "../../../catalog/inputControls";
import type { ModelOptionsRecord } from "../../../catalog/inputModes";
import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
import {
  QuantitiesByInputState,
} from "../quantityStateRouting";

export type BehaviorPatch = {
  quantitiesPatch?: Partial<Record<InputIdType, QuantityState>>;
  optionsPatch?: ModelOptionsRecord;
};

export type ControlBehaviorContext = {
  quantitiesByInput: QuantitiesByInputState;
  options: ModelOptionsRecord;
  unitSystem: UnitSystemType;
  visibleInputIds: InputIdType[];
};

export function createControlBehaviorContext(options: {
  quantitiesByInput: QuantitiesByInputState;
  options: ModelOptionsRecord;
  unitSystem: UnitSystemType;
  visibleInputIds: InputIdType[];
}): ControlBehaviorContext {
  return {
    quantitiesByInput: options.quantitiesByInput,
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
  inputState: QuantityState,
): BehaviorPatch {
  return {
    quantitiesPatch: {
      [inputId]: inputState,
    },
  };
}
