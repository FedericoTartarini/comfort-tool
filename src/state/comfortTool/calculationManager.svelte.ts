import type { ComfortToolStateSlice } from "./types";
import { getComfortModelConfig } from "./modelConfigs";

function getTimerApi() {
  return typeof window !== "undefined" ? window : globalThis;
}

async function yieldToNextFrame() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    await Promise.resolve();
    return;
  }
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

export function createCalculationManager(state: ComfortToolStateSlice, getVisibleInputIds: () => string[]) {
  let calculationTimerId: ReturnType<typeof setTimeout> | null = null;
  let latestCalculationToken = 0;

  function clearScheduledCalculation() {
    if (calculationTimerId !== null) {
      getTimerApi().clearTimeout(calculationTimerId as never);
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
      // todo AI visibleInputIds is string[] here because getVisibleInputIds returns string[]. It should return InputIdType[] and this cast would not be needed.
      const calculationOutputs = modelConfig.calculate(state, visibleInputIds as any);

      state.ui.calculationCacheByModel[selectedModel] = {
        ...state.ui.calculationCacheByModel[selectedModel],
        status: "ready",
        lastVisibleInputIds: [...visibleInputIds] as any[], // todo AI same issue as above
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

    calculationTimerId = getTimerApi().setTimeout(runCalculation, 180);
  }

  return { scheduleCalculation };
}
