import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";
import type { PointSessionBuckets, QuantitiesByInputState } from "./types";
import { getComfortModelConfig } from "../modelRegistry";

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
  session: PointSessionBuckets,
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
    const selectedModel = session.setting.selectedModel;
    const visibleInputIds = getVisibleInputIds();

    session.output.isLoading = true;
    session.output.errorMessage = "";

    await yieldToNextFrame();

    if (calculationToken !== latestCalculationToken) {
      return;
    }

    try {
      const modelConfig = getComfortModelConfig(selectedModel);
      const options = modelConfig.parseOptions(
        session.setting.modelOptionsByModel[selectedModel],
      );
      if (!options) {
        throw new Error(
          `Invariant violation: invalid options state for ${selectedModel}.`,
        );
      }
      const effectiveInputs = getEffectiveQuantitiesByInput(selectedModel);
      const calculationContext: ModelCalculationContext = {
        effectiveQuantitiesByInput: effectiveInputs,
        auxiliaryQuantitiesByInput: session.input.auxiliaryQuantitiesByInput,
        modelInputs: session.input.modelInputsByModel[selectedModel],
        options,
      };
      const calculationOutputs = modelConfig.calculate(calculationContext, visibleInputIds);

      const previousCache = session.calculationCacheByModel[selectedModel];
      const buildGeneration = previousCache.buildGeneration + 1;
      session.calculationCacheByModel = {
        ...session.calculationCacheByModel,
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
      const cache = session.calculationCacheByModel[selectedModel];
      session.calculationCacheByModel = {
        ...session.calculationCacheByModel,
        [selectedModel]: {
          ...cache,
          status: cache.chartSource ? "stale" : "empty",
        },
      };
      session.output.errorMessage = error instanceof Error ? error.message : "Calculation failed.";
    } finally {
      if (calculationToken === latestCalculationToken) session.output.isLoading = false;
    }
  }

  function scheduleCalculation(options?: { immediate?: boolean; force?: boolean }) {
    if (
      !options?.force
      && session.calculationCacheByModel[session.setting.selectedModel].status === "ready"
    ) {
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
