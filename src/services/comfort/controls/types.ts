/**
 * Control Behavior Type Definitions
 * 
 * This file defines the core interfaces and types for the sidebar input 
 * control system. It establishes the contract between raw application state 
 * and the reactive view models used to render sidebar components.
 */
import type { ChartId as ChartIdType } from "../../../models/chartOptions";
import type {
  DerivedInputId as DerivedInputIdType,
  FieldKey as FieldKeyType,
} from "../../../models/fieldKeys";
import type {
  InputControlViewModel,
  InputControlId as InputControlIdType,
} from "../../../models/inputControls";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import type { UnitSystem as UnitSystemType } from "../../../models/units";

type InputsByInputRecord = Record<InputIdType, Record<FieldKeyType, number>>;
type DerivedByInputRecord = Record<InputIdType, Partial<Record<DerivedInputIdType, number>>>;
export type ModelOptionsRecord = Partial<Record<OptionKeyType, string>>;

/**
 * A partial update to the application state, typically returned by control interactions, called a Behavior Patch.
 */
export type BehaviorPatch = {
  /** Map of input values keyed by InputId and FieldKey. */
  inputsPatch?: Partial<Record<InputIdType, Record<FieldKeyType, number>>>;
  /** Map of model configuration options. */
  optionsPatch?: ModelOptionsRecord;
};

/**
 * The snapshot of application state provided to control behavior functions.
 */
export type ControlBehaviorContext = {
  /** The current values for all input fields. */
  inputsByInput: InputsByInputRecord;
  /** Calculated values that are derived from primary inputs. */
  derivedByInput: DerivedByInputRecord;
  /** Active model configuration options (e.g., Temperature Mode). */
  options: ModelOptionsRecord;
  /** The active unit system (SI or IP). */
  unitSystem: UnitSystemType;
  /** List of input IDs currently visible in the UI. */
  visibleInputIds: InputIdType[];
  /** The ID of the currently selected chart. */
  selectedChartId: ChartIdType;
};

/**
 * Defines the reactive behavior and interaction handlers for an input control.
 */
export interface InputControlBehavior {
  /** Transforms current state into a serializable view model for rendering. */
  buildViewModel: (context: ControlBehaviorContext) => InputControlViewModel;
  /** 
   * Handles a raw input change and returns a state patch. 
   * Useful for complex multi-input synchronization.
   */
  applyInput?: (
    context: ControlBehaviorContext,
    inputId: InputIdType,
    rawValue: string,
  ) => BehaviorPatch | null;
  /** 
   * Handles an option selection change and returns a state patch.
   */
  applyOptionChange?: (
    context: ControlBehaviorContext,
    optionKey: OptionKeyType,
    nextValue: string,
  ) => BehaviorPatch | null;
}
/*
* Type for the control behavior config. Used to define the behavior of a control (e.g. how units are displayed).
*/
export type InputControlDefinition = {
  id: InputControlIdType;
  behavior: InputControlBehavior;
};

/**
 * Creates a behavior patch that updates a single input.
 * @param inputId - The ID of the input to update.
 * @param inputState - The state of the input.
 * @returns The behavior patch.
 */
export function createSingleInputPatch(
  inputId: InputIdType,
  inputState: Record<FieldKeyType, number>,
): BehaviorPatch {
  return {
    inputsPatch: {
      [inputId]: inputState,
    },
  };
}
