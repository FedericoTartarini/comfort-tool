import { PhysicalQuantityId, getPhysicalQuantityMeta, type DerivedSlotQuantityState, type PrimaryInputState } from "../../../models/physicalQuantities";
import type { InputControlId as InputControlIdType } from "../../../models/inputControls";
import {
  OptionKey,
  TemperatureMode,
  type ModelOptionsRecord,
  type TemperatureMode as TemperatureModeType,
} from "../../../models/inputModes";
import { inputOrder, type InputId as InputIdType } from "../../../models/inputSlots";
import { temperatureMenuItems } from "../../../models/controlMenuMeta";
import { synchronizeTemperatureMode } from "../syncState";
import { getDerivedFromAuxiliary } from "../quantityStateRouting";
import type {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlBehavior,
} from "./types";
import {
  buildAdvancedOptionMenu,
  buildAdvancedOptionSection,
  buildDefaultPresentation,
  createControlBehavior,
  requireOptionValue,
  type OptionChangeHandler,
} from "./numericControl";

const temperatureModeValues = Object.values(TemperatureMode);

export function requireTemperatureMode(
  options: ModelOptionsRecord,
): TemperatureModeType {
  return requireOptionValue(
    options,
    OptionKey.TemperatureMode,
    temperatureModeValues,
  );
}

type PostTemperatureSynchronizer = (
  inputState: PrimaryInputState,
  derivedState: DerivedSlotQuantityState,
  options: ModelOptionsRecord,
) => PrimaryInputState;

interface OperativeTemperatureControlOptions {
  minValue?: number;
  maxValue?: number;
  postSynchronize?: PostTemperatureSynchronizer;
}

function applyPostSynchronization(
  inputState: PrimaryInputState,
  context: ControlBehaviorContext,
  inputId: InputIdType,
  options: ModelOptionsRecord,
  synchronizer?: PostTemperatureSynchronizer,
): PrimaryInputState {
  return synchronizer?.(
    inputState,
    getDerivedFromAuxiliary(context.auxiliaryQuantitiesByInput[inputId]),
    options,
  ) ?? inputState;
}

export function createOperativeTemperatureControlBehavior(
  controlId: InputControlIdType,
  options: OperativeTemperatureControlOptions = {},
): InputControlBehavior {
  const temperatureMeta = getPhysicalQuantityMeta(PhysicalQuantityId.DryBulbTemperature);
  return createControlBehavior({
    controlId,
    fieldKey: PhysicalQuantityId.DryBulbTemperature,
    minValue: options.minValue,
    maxValue: options.maxValue,
    getPresentation: (context) => ({
      ...buildDefaultPresentation(context, PhysicalQuantityId.DryBulbTemperature, options),
      label: requireTemperatureMode(context.options) === TemperatureMode.Operative
        ? "Operative temperature"
        : temperatureMeta.label,
    }),
    getMenu: (context) => buildAdvancedOptionMenu("Temperature input", [
      buildAdvancedOptionSection(
        undefined,
        OptionKey.TemperatureMode,
        requireTemperatureMode(context.options),
        temperatureMenuItems,
      ),
    ]),
    applyInput: (context, inputId, nextValueSi) => {
      const mode = requireTemperatureMode(context.options);
      const nextInputState: PrimaryInputState = {
        ...context.quantitiesByInput[inputId],
        [PhysicalQuantityId.DryBulbTemperature]: nextValueSi,
        ...(mode === TemperatureMode.Operative
          ? { [PhysicalQuantityId.MeanRadiantTemperature]: nextValueSi }
          : {}),
      };
      return {
        quantitiesPatch: {
          [inputId]: applyPostSynchronization(
            nextInputState,
            context,
            inputId,
            context.options,
            options.postSynchronize,
          ),
        },
      };
    },
  });
}

export function createTemperatureModeOptionHandler(
  options: Pick<OperativeTemperatureControlOptions, "postSynchronize"> = {},
): OptionChangeHandler {
  return (context, nextValue): BehaviorPatch | null => {
    const nextMode = requireOptionValue(
      { [OptionKey.TemperatureMode]: nextValue },
      OptionKey.TemperatureMode,
      temperatureModeValues,
    );
    if (requireTemperatureMode(context.options) === nextMode) return null;

    const nextOptions = {
      ...context.options,
      [OptionKey.TemperatureMode]: nextMode,
    };
    const quantitiesPatch: NonNullable<BehaviorPatch["quantitiesPatch"]> = {};
    for (const inputId of inputOrder) {
      const temperatureSynchronized = synchronizeTemperatureMode(
        context.quantitiesByInput[inputId],
        nextMode,
      ).inputState;
      quantitiesPatch[inputId] = applyPostSynchronization(
        temperatureSynchronized,
        context,
        inputId,
        nextOptions,
        options.postSynchronize,
      );
    }
    return {
      quantitiesPatch,
      optionsPatch: { [OptionKey.TemperatureMode]: nextMode },
    };
  };
}
