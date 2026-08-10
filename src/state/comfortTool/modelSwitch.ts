import type {
  BehaviorPatch,
  ControlBehaviorContext,
} from "../../services/comfort/controls/types";
import type { RuntimeComfortModelDefinition } from "./modelConfigs/definition";
import type { ModelSwitchViolation } from "./types";

const RANGE_EPSILON = 0.0001;

export function findModelSwitchViolations(
  config: RuntimeComfortModelDefinition,
  context: ControlBehaviorContext,
): ModelSwitchViolation[] {
  const violations: ModelSwitchViolation[] = [];

  for (const inputId of context.visibleInputIds) {
    const inputContext = { ...context, visibleInputIds: [inputId] };
    for (const control of config.controls) {
      const viewModel = control.behavior.buildViewModel(inputContext);
      if (viewModel.hidden) continue;

      const currentValue = viewModel.numericValuesByInput[inputId];
      if (currentValue === undefined) continue;
      const underMinimum = viewModel.minValue !== undefined
        && currentValue < viewModel.minValue - RANGE_EPSILON;
      const overMaximum = viewModel.maxValue !== undefined
        && currentValue > viewModel.maxValue + RANGE_EPSILON;
      if (!underMinimum && !overMaximum) continue;

      violations.push({
        inputId,
        controlId: control.id,
        label: viewModel.label,
        currentValue,
        minAllowed: viewModel.minValue ?? -Infinity,
        maxAllowed: viewModel.maxValue ?? Infinity,
        displayUnits: viewModel.displayUnits,
      });
    }
  }

  return violations;
}

export function buildModelSwitchClampPatches(
  config: RuntimeComfortModelDefinition,
  context: ControlBehaviorContext,
  violations: readonly ModelSwitchViolation[],
): BehaviorPatch[] {
  return violations.flatMap((violation) => {
    const control = config.controls.find(({ id }) => id === violation.controlId);
    if (!control?.behavior.applyInput) return [];

    const viewModel = control.behavior.buildViewModel(context);
    const clampedValue = Math.max(
      viewModel.minValue ?? -Infinity,
      Math.min(viewModel.maxValue ?? Infinity, violation.currentValue),
    );
    const patch = control.behavior.applyInput(
      context,
      violation.inputId,
      clampedValue.toString(),
    );
    return patch ? [patch] : [];
  });
}
