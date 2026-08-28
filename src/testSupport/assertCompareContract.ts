import { expect } from "vitest";

import {
  type ModelId as ModelIdType,
} from "../catalog/modelIds";
import { chartPoints } from "../charts";
import { inputDisplayMetaById } from "../catalog/inputSlotPresentation";
import { InputId, inputOrder } from "../catalog/inputSlots";
import {
  PhysicalQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PrimaryInputState,
} from "../catalog/quantities";
import { supportsStandardSurface, SurfaceId } from "../catalog/surfaces";
import { syncDerivedStateForInput } from "../engines/comfort/syncState";
import { createAnalysisState } from "../state/analysis/createAnalysisState.svelte";
import { comfortModelConfigs } from "../state/analysis/modelConfigs";
import type { AnalysisController } from "../state/analysis/types";
import {
  getGoldenInputOverrides,
  getGoldenModelInputOverrides,
} from "./goldenFixtures";

export { getGoldenInputOverrides };

const VISIBLE_INPUT_COUNTS = [1, 2, 3] as const;
const SLOT_DRY_BULB_OFFSETS_C = [0, 1, 2] as const;

async function waitForIdle(controller: AnalysisController) {
  const modelId = controller.state.setting.selectedModel;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cache = controller.state.output.calculationCacheByModel[modelId];
    if (!controller.state.output.isLoading && cache.status === "ready") {
      return;
    }
    if (controller.state.output.errorMessage) {
      throw new Error(controller.state.output.errorMessage);
    }
  }
  throw new Error("Controller did not finish calculating.");
}

function failSilently(modelId: ModelIdType, detail: string): never {
  throw new Error(`${modelId}: ${detail}`);
}

async function configureVisibleInputs(
  controller: AnalysisController,
  count: 1 | 2 | 3,
) {
  if (count === 1) {
    controller.actions.setCompareEnabled(false);
  } else {
    controller.actions.setCompareEnabled(true);
    await waitForIdle(controller);
    const input3Visible = controller.state.setting.compareInputIds.includes(
      InputId.Input3,
    );
    if (count === 2 && input3Visible) {
      controller.actions.toggleCompareInputVisibility(InputId.Input3);
    }
    if (count === 3 && !input3Visible) {
      controller.actions.toggleCompareInputVisibility(InputId.Input3);
    }
  }
  controller.actions.scheduleCalculation({ immediate: true, force: true });
  await waitForIdle(controller);
}

function applyGoldenInputs(
  controller: AnalysisController,
  modelId: ModelIdType,
) {
  const overrides = getGoldenInputOverrides(modelId);
  inputOrder.forEach((inputId, index) => {
    const quantities = controller.state.input.quantitiesByInput[inputId];
    for (const [quantityId, value] of Object.entries(overrides)) {
      if (value === undefined) continue;
      const applied =
        quantityId === PhysicalQuantityId.DryBulbTemperature
          ? value + SLOT_DRY_BULB_OFFSETS_C[index]
          : value;
      quantities[quantityId as keyof PrimaryInputState] = applied;
    }
    syncDerivedStateForInput(
      inputId,
      controller.state.input.quantitiesByInput,
      controller.state.input.auxiliaryQuantitiesByInput,
    );
  });
  for (const [quantityId, value] of Object.entries(getGoldenModelInputOverrides(modelId))) {
    if (value === undefined) continue;
    if (
      !controller.actions.updateModelQuantity(
        modelId,
        quantityId as PhysicalQuantityIdType,
        value,
      )
    ) {
      failSilently(
        modelId,
        `could not apply model input ${quantityId}=${value}.`,
      );
    }
  }
}

function assertTableColumnsFilled(
  controller: AnalysisController,
  modelId: ModelIdType,
  visibleInputIds: readonly string[],
) {
  const sections = controller.selectors.getResultSections();
  if (sections.length === 0) {
    failSilently(modelId, "result table has no rows.");
  }
  for (const section of sections) {
    for (const inputId of visibleInputIds) {
      const cell = section.valuesByInput[inputId as InputId];
      if (cell == null || cell.text.trim().length === 0) {
        failSilently(
          modelId,
          `table column for ${inputId} is empty in "${section.title}".`,
        );
      }
    }
  }
}

function assertChartMarkers(
  controller: AnalysisController,
  modelId: ModelIdType,
  visibleInputIds: readonly string[],
) {
  const instanceId = controller.selectors.getCurrentChartInstanceId();
  const chart = controller.selectors.getCurrentChartResult();
  if (chart == null) {
    failSilently(modelId, `chart ${instanceId} returned no figure.`);
  }
  const names = new Set(chartPoints(chart).map((point) => point.name));
  for (const inputId of visibleInputIds) {
    const label = inputDisplayMetaById[inputId as InputId].label;
    if (!names.has(label)) {
      failSilently(
        modelId,
        `chart ${instanceId} is missing a Compare marker for ${label}.`,
      );
    }
  }
}

/**
 * Asserts the Compare contract for one Analysis model: 1/2/3 visible inputs,
 * filled table columns, chart markers, and a baseline change that does not
 * invalidate a ready cache. Missing third-input results fail instead of
 * being skipped.
 */
export async function assertCompareContract(
  modelId: ModelIdType,
  controller: AnalysisController = createAnalysisState(),
): Promise<void> {
  const config = comfortModelConfigs[modelId];
  controller.actions.setActiveSurface(
    supportsStandardSurface(config.workspaceCapabilities)
      ? SurfaceId.Standard
      : SurfaceId.Explore,
  );
  controller.actions.setSelectedModel(modelId, {
    validateRanges: false,
    schedule: false,
  });
  if (controller.state.setting.pendingModelSwitch) {
    failSilently(modelId, "model switch is pending; Compare cannot run.");
  }
  applyGoldenInputs(controller, modelId);

  for (const count of VISIBLE_INPUT_COUNTS) {
    await configureVisibleInputs(controller, count);
    if (controller.state.output.errorMessage) {
      failSilently(
        modelId,
        `calculation error with ${count} inputs: ${controller.state.output.errorMessage}`,
      );
    }
    const visibleInputIds = controller.selectors.getVisibleInputIds();
    if (visibleInputIds.length !== count) {
      failSilently(
        modelId,
        `expected ${count} visible inputs, received ${visibleInputIds.join(", ")}.`,
      );
    }
    const cache = controller.state.output.calculationCacheByModel[modelId];
    if (cache.status !== "ready") {
      failSilently(
        modelId,
        `cache status is ${cache.status} with ${count} inputs.`,
      );
    }
    for (const inputId of visibleInputIds) {
      if (cache.resultsByInput[inputId] == null) {
        failSilently(
          modelId,
          `visible input ${inputId} produced no result with ${count} inputs.`,
        );
      }
    }
    assertTableColumnsFilled(controller, modelId, visibleInputIds);
    assertChartMarkers(controller, modelId, visibleInputIds);
  }

  const readyCache = controller.state.output.calculationCacheByModel[modelId];
  const visibleInputIds = controller.selectors.getVisibleInputIds();
  const nextBaseline =
    visibleInputIds.find((inputId) => inputId !== InputId.Input1) ??
    InputId.Input1;
  controller.actions.setChartBaselineInputId(nextBaseline);
  expect(controller.state.output.isLoading).toBe(false);
  expect(controller.state.output.calculationCacheByModel[modelId]).toBe(readyCache);
  expect(readyCache.status).toBe("ready");
  expect(controller.selectors.getCurrentCacheStatus()).toBe("ready");
  assertTableColumnsFilled(controller, modelId, visibleInputIds);
  assertChartMarkers(controller, modelId, visibleInputIds);
}
