import {
  FieldKey,
  type CanonicalInputState,
  type DerivedInputState,
} from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import type { InputControlId as InputControlIdType } from "../../../models/inputControls";
import {
  OptionKey,
  TemperatureMode,
  type ModelOptionsRecord,
  type TemperatureMode as TemperatureModeType,
} from "../../../models/inputModes";
import { inputOrder } from "../../../models/inputSlots";
import { temperatureMenuItems } from "../../../models/controlMenuMeta";
import { synchronizeTemperatureMode } from "../syncState";
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
  inputState: CanonicalInputState,
  derivedState: DerivedInputState,
  options: ModelOptionsRecord,
) => CanonicalInputState;

interface OperativeTemperatureControlOptions {
  minValue?: number;
  maxValue?: number;
  postSynchronize?: PostTemperatureSynchronizer;
}

function applyPostSynchronization(
  inputState: CanonicalInputState,
  context: ControlBehaviorContext,
  inputId: keyof ControlBehaviorContext["inputsByInput"],
  options: ModelOptionsRecord,
  synchronizer?: PostTemperatureSynchronizer,
): CanonicalInputState {
  return synchronizer?.(
    inputState,
    context.derivedByInput[inputId],
    options,
  ) ?? inputState;
}

export function createOperativeTemperatureControlBehavior(
  controlId: InputControlIdType,
  options: OperativeTemperatureControlOptions = {},
): InputControlBehavior {
  const temperatureMeta = fieldMetaByKey[FieldKey.DryBulbTemperature];
  return createControlBehavior({
    controlId,
    fieldKey: FieldKey.DryBulbTemperature,
    minValue: options.minValue,
    maxValue: options.maxValue,
    getPresentation: (context) => ({
      ...buildDefaultPresentation(context, temperatureMeta, options),
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
      const nextInputState: CanonicalInputState = {
        ...context.inputsByInput[inputId],
        [FieldKey.DryBulbTemperature]: nextValueSi,
        ...(mode === TemperatureMode.Operative
          ? { [FieldKey.MeanRadiantTemperature]: nextValueSi }
          : {}),
      };
      return {
        inputsPatch: {
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
    const inputsPatch: NonNullable<BehaviorPatch["inputsPatch"]> = {};
    for (const inputId of inputOrder) {
      const temperatureSynchronized = synchronizeTemperatureMode(
        context.inputsByInput[inputId],
        nextMode,
      ).inputState;
      inputsPatch[inputId] = applyPostSynchronization(
        temperatureSynchronized,
        context,
        inputId,
        nextOptions,
        options.postSynchronize,
      );
    }
    return {
      inputsPatch,
      optionsPatch: { [OptionKey.TemperatureMode]: nextMode },
    };
  };
}
