import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";
import type { AnalysisStateSlice, QuantitiesByInputState } from "./types";
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
  state: AnalysisStateSlice,
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
    const selectedModel = state.setting.selectedModel;
    const visibleInputIds = getVisibleInputIds();

    state.output.isLoading = true;
    state.output.errorMessage = "";

    await yieldToNextFrame();

    if (calculationToken !== latestCalculationToken) {
      return;
    }

    try {
      const modelConfig = getComfortModelConfig(selectedModel);
      const options = modelConfig.parseOptions(
        state.setting.modelOptionsByModel[selectedModel],
      );
      if (!options) {
        throw new Error(
          `Invariant violation: invalid options state for ${selectedModel}.`,
        );
      }
      const effectiveInputs = getEffectiveQuantitiesByInput(selectedModel);
      const calculationContext: ModelCalculationContext = {
        effectiveQuantitiesByInput: effectiveInputs,
        auxiliaryQuantitiesByInput: state.input.auxiliaryQuantitiesByInput,
        modelInputs: state.input.modelInputsByModel[selectedModel],
        options,
      };
      const calculationOutputs = modelConfig.calculate(calculationContext, visibleInputIds);

      const previousCache = state.output.calculationCacheByModel[selectedModel];
      const buildGeneration = previousCache.buildGeneration + 1;
      state.output.calculationCacheByModel = {
        ...state.output.calculationCacheByModel,
        [selectedModel]: {
          ...previousCache,
          status: "ready",
          buildGeneration,
          lastVisibleInputIds: [...visibleInputIds],
          resultsByInput: calculationOutputs.resultsByInput,
          chartSource: calculationOutputs.chartSource,
        },
      };
    } catch (error) {
      const cache = state.output.calculationCacheByModel[selectedModel];
      state.output.calculationCacheByModel = {
        ...state.output.calculationCacheByModel,
        [selectedModel]: {
          ...cache,
          status: cache.chartSource ? "stale" : "empty",
        },
      };
      state.output.errorMessage = error instanceof Error ? error.message : "Calculation failed.";
    } finally {
      if (calculationToken === latestCalculationToken) state.output.isLoading = false;
    }
  }

  function scheduleCalculation(options?: { immediate?: boolean; force?: boolean }) {
    if (!options?.force && state.output.calculationCacheByModel[state.setting.selectedModel].status === "ready") {
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
