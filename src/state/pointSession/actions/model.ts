import type { ModelId as ModelIdType } from "../../../catalog/modelIds";
import type { OptionKey as OptionKeyType } from "../../../catalog/inputModes";
import { getComfortModelConfig } from "../../modelRegistry";
import {
  buildModelSwitchClampPatches,
  findModelSwitchViolations,
} from "../modelSwitch";
import type { PointActions } from "../sessionTypes";
import type { PointActionContext } from "./context";

export function createModelActions({
  session,
  internals,
  scheduleCalculation,
}: PointActionContext): Pick<
  PointActions,
  "setSelectedModel" | "setModelOption" | "confirmModelSwitch" | "cancelModelSwitch"
> {
  function completeModelSelection(
    nextModel: ModelIdType,
    options?: { schedule?: boolean },
  ) {
    session.setting.selectedModel = nextModel;
    session.output.errorMessage = "";

    if (options?.schedule !== false) {
      scheduleCalculation({ immediate: true });
    }
  }

  function setSelectedModel(
    nextModel: ModelIdType,
    options?: { validateRanges?: boolean; schedule?: boolean },
  ) {
    if (session.setting.selectedModel === nextModel) {
      return;
    }

    const nextModelConfig = getComfortModelConfig(nextModel);
    const nextModelOptions = nextModelConfig.parseOptions(
      session.input.modelOptionsByModel[nextModel],
    );
    if (!nextModelOptions) {
      throw new Error(`Invariant violation: invalid options state for ${nextModel}.`);
    }
    const violations = options?.validateRanges === false
      ? []
      : findModelSwitchViolations(nextModelConfig, internals.getModelContext(nextModel));

    if (violations.length > 0) {
      session.setting.pendingModelSwitch = {
        targetModel: nextModel,
        violations,
      };
      return;
    }

    completeModelSelection(nextModel, options);
  }

  function confirmModelSwitch(options?: { schedule?: boolean }) {
    if (!session.setting.pendingModelSwitch) {
      return;
    }

    const { targetModel, violations } = session.setting.pendingModelSwitch;

    const modelConfig = getComfortModelConfig(targetModel);
    const context = internals.getModelContext(targetModel);
    for (const patch of buildModelSwitchClampPatches(
      modelConfig,
      context,
      violations,
    )) {
      internals.applyBehaviorPatch(targetModel, patch);
    }

    session.setting.pendingModelSwitch = null;
    internals.invalidateAllModels();
    completeModelSelection(targetModel, options);
  }

  function cancelModelSwitch() {
    session.setting.pendingModelSwitch = null;
  }

  function setModelOption(optionKey: OptionKeyType, nextValue: string) {
    const modelConfig = internals.getActiveModelConfig();
    const context = internals.getModelContext(session.setting.selectedModel);
    const patch = modelConfig.optionHandlersByKey[optionKey]?.(context, nextValue) ?? null;

    if (!patch) {
      return;
    }

    internals.applyBehaviorPatch(session.setting.selectedModel, patch);
    if (patch.quantitiesPatch) {
      internals.invalidateAllModels();
    } else {
      internals.invalidateModel(session.setting.selectedModel);
    }
    scheduleCalculation({ immediate: true });
  }

  return {
    setSelectedModel,
    setModelOption,
    confirmModelSwitch,
    cancelModelSwitch,
  };
}
