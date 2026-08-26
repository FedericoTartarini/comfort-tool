import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ModelId as ModelIdType } from "../../models/comfortModels";
import type { ModelCalculationContext } from "../../models/modelCalculation";
import type { ComfortToolStateSlice, QuantitiesByInputState } from "./types";
import { getComfortModelConfig } from "./modelConfigs";

type TimerId = ReturnType<typeof globalThis.setTimeout>;

async function yieldToNextFrame() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    await Promise.resolve();
    return;
  }
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export function createCalculationManager(
  state: ComfortToolStateSlice,
  getVisibleInputIds: () => InputIdType[],
  getEffectiveQuantitiesByInput: (modelId: ModelIdType) => QuantitiesByInputState,
) {
  let calculationTimerId: TimerId | null = null;
  let latestCalculationToken = 0;

  function clearScheduledCalculation() {
    if (calculationTimerId !== null) {
      globalThis.clearTimeout(calculationTimerId);
      calculationTimerId = null;
    }
  }

  async function calculate(calculationToken: number) {
    const selectedModel = state.ui.selectedModel;
    const visibleInputIds = getVisibleInputIds();

    state.ui.isLoading = true;
    state.ui.errorMessage = "";

    await yieldToNextFrame();

    if (calculationToken !== latestCalculationToken) {
      return;
    }

    try {
      const modelConfig = getComfortModelConfig(selectedModel);
      const options = modelConfig.parseOptions(
        state.ui.modelOptionsByModel[selectedModel],
      );
      if (!options) {
        throw new Error(
          `Invariant violation: invalid options state for ${selectedModel}.`,
        );
      }
      const effectiveInputs = getEffectiveQuantitiesByInput(selectedModel);
      const calculationContext: ModelCalculationContext = {
        effectiveQuantitiesByInput: effectiveInputs,
        auxiliaryQuantitiesByInput: state.auxiliaryQuantitiesByInput,
        modelInputs: state.modelInputsByModel[selectedModel],
        options,
      };
      const calculationOutputs = modelConfig.calculate(calculationContext, visibleInputIds);

      const previousCache = state.ui.calculationCacheByModel[selectedModel];
      const buildGeneration = previousCache.buildGeneration + 1;
      state.ui.calculationCacheByModel[selectedModel] = {
        ...previousCache,
        status: "ready",
        buildGeneration,
        lastVisibleInputIds: [...visibleInputIds],
        resultsByInput: calculationOutputs.resultsByInput,
        chartSource: calculationOutputs.chartSource,
      };
    } catch (error) {
      const cache = state.ui.calculationCacheByModel[selectedModel];
      cache.status = cache.chartSource ? "stale" : "empty";
      state.ui.errorMessage = error instanceof Error ? error.message : "Calculation failed.";
    } finally {
      if (calculationToken === latestCalculationToken) state.ui.isLoading = false;
    }
  }

  function scheduleCalculation(options?: { immediate?: boolean; force?: boolean }) {
    if (!options?.force && state.ui.calculationCacheByModel[state.ui.selectedModel].status === "ready") {
      return;
    }

    const runCalculation = () => {
      calculationTimerId = null;
      latestCalculationToken += 1;
      void calculate(latestCalculationToken);
    };

    clearScheduledCalculation();

    if (options?.immediate) {
      runCalculation();
      return;
    }

    calculationTimerId = globalThis.setTimeout(runCalculation, 180);
  }

  return { scheduleCalculation };
}
