import type {
  CanonicalInputState,
  DerivedInputState,
} from "../../../models/fieldKeys";
import type {
  InputControlViewModel,
  InputControlId as InputControlIdType,
} from "../../../models/inputControls";
import type { ModelOptionsRecord } from "../../../models/inputModes";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../../models/units";

type InputsByInputRecord = Record<InputIdType, CanonicalInputState>;
type DerivedByInputRecord = Record<InputIdType, DerivedInputState>;

export type BehaviorPatch = {
  /** Canonical-SI field changes keyed by input slot. */
  inputsPatch?: Partial<Record<InputIdType, Partial<CanonicalInputState>>>;
  optionsPatch?: ModelOptionsRecord;
};

export type ControlBehaviorContext = {
  inputsByInput: InputsByInputRecord;
  derivedByInput: DerivedByInputRecord;
  options: ModelOptionsRecord;
  unitSystem: UnitSystemType;
  visibleInputIds: InputIdType[];
};

export interface InputControlBehavior {
  buildViewModel: (context: ControlBehaviorContext) => InputControlViewModel;
  applyInput?: (
    context: ControlBehaviorContext,
    inputId: InputIdType,
    rawValue: string,
  ) => BehaviorPatch | null;
}
export type InputControlDefinition = {
  id: InputControlIdType;
  behavior: InputControlBehavior;
};

export function createSingleInputPatch(
  inputId: InputIdType,
  inputState: Partial<CanonicalInputState>,
): BehaviorPatch {
  return {
    inputsPatch: {
      [inputId]: inputState,
    },
  };
}
