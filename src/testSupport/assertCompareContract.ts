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
} from "../catalog/quantities";
import { supportsStandardSurface, SurfaceId } from "../catalog/surfaces";
import { syncDerivedStateForInput } from "../engines/comfort/syncState";
import { createPointSession } from "../state/pointSession/createPointSession.svelte";
import { comfortModelConfigs } from "../state/modelRegistry";
import type { PointSession } from "../state/pointSession/types";
import {
  getGoldenInputOverrides,
  getGoldenModelInputOverrides,
} from "./goldenFixtures";

export { getGoldenInputOverrides };

const VISIBLE_INPUT_COUNTS = [1, 2, 3] as const;
const SLOT_DRY_BULB_OFFSETS_C = [0, 1, 2] as const;

async function waitForIdle(session: PointSession) {
  const modelId = session.setting.selectedModel;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const cache = session.calculationCacheByModel[modelId];
    if (!session.output.isLoading && cache.status === "ready") {
      return;
    }
    if (session.output.errorMessage) {
      throw new Error(session.output.errorMessage);
    }
  }
  throw new Error("Controller did not finish calculating.");
}

function failSilently(modelId: ModelIdType, detail: string): never {
  throw new Error(`${modelId}: ${detail}`);
}

async function configureVisibleInputs(
  session: PointSession,
  count: 1 | 2 | 3,
) {
  if (count === 1) {
    session.actions.setCompareEnabled(false);
  } else {
    session.actions.setCompareEnabled(true);
    await waitForIdle(session);
    const input3Visible = session.input.compareInputIds.includes(
      InputId.Input3,
    );
    if (count === 2 && input3Visible) {
      session.actions.toggleCompareInputVisibility(InputId.Input3);
    }
    if (count === 3 && !input3Visible) {
      session.actions.toggleCompareInputVisibility(InputId.Input3);
    }
  }
  session.actions.scheduleCalculation({ immediate: true, force: true });
  await waitForIdle(session);
}

function applyGoldenInputs(
  session: PointSession,
  modelId: ModelIdType,
) {
  const overrides = getGoldenInputOverrides(modelId);
  inputOrder.forEach((inputId, index) => {
    const quantities = session.input.quantitiesByInput[inputId];
    for (const [quantityId, value] of Object.entries(overrides)) {
      if (value === undefined) continue;
      const applied =
        quantityId === PhysicalQuantityId.DryBulbTemperature
          ? value + SLOT_DRY_BULB_OFFSETS_C[index]
          : value;
      quantities[quantityId as PhysicalQuantityIdType] = applied;
    }
    syncDerivedStateForInput(
      inputId,
      session.input.quantitiesByInput,
    );
  });
  for (const [quantityId, value] of Object.entries(getGoldenModelInputOverrides(modelId))) {
    if (value === undefined) continue;
    if (
      !session.actions.updateModelQuantity(
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
  session: PointSession,
  modelId: ModelIdType,
  visibleInputIds: readonly string[],
) {
  const sections = session.resultSections;
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
  session: PointSession,
  modelId: ModelIdType,
  visibleInputIds: readonly string[],
) {
  const instanceId = session.chartInstanceId;
  const chart = session.chartBuild.payload;
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
  session: PointSession = createPointSession(),
): Promise<void> {
  const config = comfortModelConfigs[modelId];
  session.actions.setActiveSurface(
    supportsStandardSurface(config.surfaceCapabilities)
      ? SurfaceId.Standard
      : SurfaceId.Explore,
  );
  session.actions.setSelectedModel(modelId, {
    validateRanges: false,
    schedule: false,
  });
  if (session.setting.pendingModelSwitch) {
    failSilently(modelId, "model switch is pending; Compare cannot run.");
  }
  applyGoldenInputs(session, modelId);

  for (const count of VISIBLE_INPUT_COUNTS) {
    await configureVisibleInputs(session, count);
    if (session.output.errorMessage) {
      failSilently(
        modelId,
        `calculation error with ${count} inputs: ${session.output.errorMessage}`,
      );
    }
    const visibleInputIds = session.visibleInputIds;
    if (visibleInputIds.length !== count) {
      failSilently(
        modelId,
        `expected ${count} visible inputs, received ${visibleInputIds.join(", ")}.`,
      );
    }
    const cache = session.calculationCacheByModel[modelId];
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
    assertTableColumnsFilled(session, modelId, visibleInputIds);
    assertChartMarkers(session, modelId, visibleInputIds);
  }

  const readyCache = session.calculationCacheByModel[modelId];
  const visibleInputIds = session.visibleInputIds;
  const nextBaseline =
    visibleInputIds.find((inputId) => inputId !== InputId.Input1) ??
    InputId.Input1;
  session.actions.setChartBaselineInputId(nextBaseline);
  expect(session.output.isLoading).toBe(false);
  expect(session.calculationCacheByModel[modelId]).toBe(readyCache);
  expect(readyCache.status).toBe("ready");
  expect(session.cacheStatus).toBe("ready");
  assertTableColumnsFilled(session, modelId, visibleInputIds);
  assertChartMarkers(session, modelId, visibleInputIds);
}
