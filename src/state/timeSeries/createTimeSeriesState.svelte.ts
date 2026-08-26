import type { RuntimeTimeSeriesModelDefinition } from "../../models/timeSeries";
import {
  buildTimeSeriesEditorViewModel,
  type TimeSeriesChartViewModel,
} from "./viewModels";
import type { MetricSummaryItemViewModel } from "../../models/tableTypes";
import { buildMetricSummaryTable } from "../../services/comfort/output/tableResolver";
import { resolveSimulationChartBuild } from "../../services/comfort/charts/kinds/simulation";
import { getComfortModelConfig, getModelSimulationOutput } from "../analysis/modelConfigs";
import { UnitSystem } from "../../models/units";
import {
  getTimeSeriesModelConfig,
  timeSeriesModelOrder,
  type TimeSeriesModelId,
} from "./modelConfigs";
import type {
  TimeSeriesController,
  TimeSeriesRunStatus,
  TimeSeriesStateSlice,
} from "./types";

const AUTO_CALCULATION_DEBOUNCE_MS = 300;

interface CreateTimeSeriesStateOptions {
  debounceMs?: number;
}

function createRecord<T>(factory: (modelId: TimeSeriesModelId) => T): Record<
  TimeSeriesModelId,
  T
> {
  return timeSeriesModelOrder.reduce((record, modelId) => {
    record[modelId] = factory(modelId);
    return record;
  }, {} as Record<TimeSeriesModelId, T>);
}

function isTimeSeriesModelId(value: string): value is TimeSeriesModelId {
  return timeSeriesModelOrder.includes(value as TimeSeriesModelId);
}

export function createTimeSeriesState(
  options: CreateTimeSeriesStateOptions = {},
): TimeSeriesController {
  const debounceMs = options.debounceMs ?? AUTO_CALCULATION_DEBOUNCE_MS;
  const defaultModel = timeSeriesModelOrder[0];
  if (!defaultModel) {
    throw new Error("The Time-series registry requires at least one enabled model.");
  }

  const state = $state<TimeSeriesStateSlice>({
    selectedModel: defaultModel,
    unitSystem: UnitSystem.SI,
    draftByModel: createRecord((modelId) => (
      getTimeSeriesModelConfig(modelId).createDefaultDraft()
    )),
    resultByModel: createRecord(() => null),
    statusByModel: createRecord(() => "waiting"),
    errorsByModel: createRecord(() => []),
    revisionByModel: createRecord(() => 0),
    progressByModel: createRecord(() => 0),
  });
  const timerByModel: Partial<Record<
    TimeSeriesModelId,
    ReturnType<typeof setTimeout>
  >> = {};
  const abortControllerByModel: Partial<Record<
    TimeSeriesModelId,
    AbortController
  >> = {};
  const nextSegmentSequenceByModel = createRecord((modelId) => (
    getTimeSeriesModelConfig(modelId).editor.getSegments(
      state.draftByModel[modelId],
    ).length + 1
  ));
  let started = false;
  let disposed = false;

  function getDefinition(
    modelId: TimeSeriesModelId = state.selectedModel,
  ): RuntimeTimeSeriesModelDefinition {
    return getTimeSeriesModelConfig(modelId);
  }

  function getSimulationOutput(modelId: TimeSeriesModelId) {
    const simulation = getModelSimulationOutput(modelId);
    if (!simulation) {
      throw new Error(`Time-series model ${modelId} is missing simulation output metadata.`);
    }
    return simulation;
  }

  function cancelWork(modelId: TimeSeriesModelId) {
    const timer = timerByModel[modelId];
    if (timer !== undefined) {
      clearTimeout(timer);
      delete timerByModel[modelId];
    }
    abortControllerByModel[modelId]?.abort();
    delete abortControllerByModel[modelId];
  }

  async function runSimulation(modelId: TimeSeriesModelId, revision: number) {
    if (disposed || revision !== state.revisionByModel[modelId]) return;

    const definition = getDefinition(modelId);
    const controller = new AbortController();
    abortControllerByModel[modelId] = controller;
    state.statusByModel[modelId] = "updating";
    state.progressByModel[modelId] = 0;
    const draft = definition.cloneDraft(state.draftByModel[modelId]);

    try {
      const result = await definition.simulate(draft, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (
            !controller.signal.aborted
            && revision === state.revisionByModel[modelId]
          ) {
            state.progressByModel[modelId] = Math.min(1, Math.max(0, progress));
          }
        },
      });
      if (
        controller.signal.aborted
        || disposed
        || revision !== state.revisionByModel[modelId]
      ) {
        return;
      }
      state.resultByModel[modelId] = result;
      state.errorsByModel[modelId] = [];
      state.statusByModel[modelId] = "ready";
      state.progressByModel[modelId] = 1;
    } catch (error) {
      if (
        controller.signal.aborted
        || disposed
        || revision !== state.revisionByModel[modelId]
      ) {
        return;
      }
      state.statusByModel[modelId] = "error";
      state.errorsByModel[modelId] = [
        error instanceof Error
          ? error.message
          : "Time-series calculation failed.",
      ];
    } finally {
      if (abortControllerByModel[modelId] === controller) {
        delete abortControllerByModel[modelId];
      }
    }
  }

  function scheduleSimulation(
    modelId: TimeSeriesModelId,
    scheduleOptions: { immediate?: boolean } = {},
  ) {
    cancelWork(modelId);
    const revision = state.revisionByModel[modelId] + 1;
    state.revisionByModel[modelId] = revision;
    state.progressByModel[modelId] = 0;

    const definition = getDefinition(modelId);
    const issues = definition.validate(state.draftByModel[modelId]);
    state.errorsByModel[modelId] = [...issues];
    if (issues.length > 0) {
      state.statusByModel[modelId] = "waiting";
      return;
    }

    state.statusByModel[modelId] = scheduleOptions.immediate
      ? "updating"
      : "waiting";
    if (!started) return;

    if (scheduleOptions.immediate || debounceMs <= 0) {
      void runSimulation(modelId, revision);
      return;
    }
    timerByModel[modelId] = setTimeout(() => {
      delete timerByModel[modelId];
      void runSimulation(modelId, revision);
    }, debounceMs);
  }

  function scheduleAfterRelevantEdit(modelId: TimeSeriesModelId) {
    scheduleSimulation(modelId);
  }

  function start() {
    if (disposed) return;
    started = true;
    const modelId = state.selectedModel;
    if (
      state.resultByModel[modelId] === null
      && timerByModel[modelId] === undefined
      && !abortControllerByModel[modelId]
    ) {
      scheduleSimulation(modelId, { immediate: true });
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const modelId of timeSeriesModelOrder) cancelWork(modelId);
  }

  function selectModel(modelId: TimeSeriesModelId) {
    if (!isTimeSeriesModelId(modelId) || modelId === state.selectedModel) return;
    state.selectedModel = modelId;
    if (
      started
      && state.resultByModel[modelId] === null
      && timerByModel[modelId] === undefined
      && !abortControllerByModel[modelId]
    ) {
      scheduleSimulation(modelId, { immediate: true });
    }
  }

  function toggleUnitSystem() {
    state.unitSystem = state.unitSystem === UnitSystem.SI
      ? UnitSystem.IP
      : UnitSystem.SI;
  }

  function updateSegmentName(segmentId: string, name: string) {
    getDefinition().editor.updateSegmentName(
      state.draftByModel[state.selectedModel],
      segmentId,
      name,
    );
  }

  function updateSegmentDuration(
    segmentId: string,
    rawValue: string,
  ): boolean {
    const modelId = state.selectedModel;
    const changed = getDefinition().editor.updateSegmentDuration(
      state.draftByModel[modelId],
      segmentId,
      rawValue,
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
    return changed;
  }

  function updateSegmentControl(
    segmentId: string,
    controlId: string,
    rawDisplayValue: string,
  ): boolean {
    const modelId = state.selectedModel;
    const definition = getDefinition();
    const control = definition.editor.segmentControls.find(
      ({ id }) => id === controlId,
    );
    if (!control) return false;
    const changed = control.applyDisplayValue(
      state.draftByModel[modelId],
      rawDisplayValue,
      state.unitSystem,
      segmentId,
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
    return changed;
  }

  function createSegmentId(modelId: TimeSeriesModelId): string {
    const sequence = nextSegmentSequenceByModel[modelId];
    nextSegmentSequenceByModel[modelId] += 1;
    return getDefinition(modelId).editor.createSegmentId(sequence);
  }

  function addSegment(presetId: string) {
    const modelId = state.selectedModel;
    const changed = getDefinition().editor.addSegment(
      state.draftByModel[modelId],
      createSegmentId(modelId),
      presetId,
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
  }

  function duplicateSegment(segmentId: string) {
    const modelId = state.selectedModel;
    const changed = getDefinition().editor.duplicateSegment(
      state.draftByModel[modelId],
      segmentId,
      createSegmentId(modelId),
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
  }

  function removeSegment(segmentId: string) {
    const modelId = state.selectedModel;
    const changed = getDefinition().editor.removeSegment(
      state.draftByModel[modelId],
      segmentId,
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
  }

  function moveSegment(segmentId: string, direction: -1 | 1) {
    const modelId = state.selectedModel;
    const changed = getDefinition().editor.moveSegment(
      state.draftByModel[modelId],
      segmentId,
      direction,
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
  }

  function updateSettingControl(
    controlId: string,
    value: string | boolean,
  ): boolean {
    const modelId = state.selectedModel;
    const definition = getDefinition();
    const control = definition.editor.settingsSections
      .flatMap(({ controls }) => controls)
      .find(({ id }) => id === controlId);
    if (!control) return false;

    let changed = false;
    if (control.kind === "number" && typeof value === "string") {
      changed = control.applyDisplayValue(
        state.draftByModel[modelId],
        value,
        state.unitSystem,
      );
    } else if (control.kind === "select" && typeof value === "string") {
      changed = control.applyValue(state.draftByModel[modelId], value);
    } else if (control.kind === "toggle" && typeof value === "boolean") {
      changed = control.applyValue(state.draftByModel[modelId], value);
    }
    if (changed) scheduleAfterRelevantEdit(modelId);
    return changed;
  }

  function reset() {
    const modelId = state.selectedModel;
    const definition = getDefinition();
    state.draftByModel[modelId] = definition.createDefaultDraft();
    nextSegmentSequenceByModel[modelId] = definition.editor.getSegments(
      state.draftByModel[modelId],
    ).length + 1;
    scheduleSimulation(modelId);
  }

  function getEditor() {
    const definition = getDefinition();
    return buildTimeSeriesEditorViewModel(
      definition,
      state.draftByModel[state.selectedModel],
      state.unitSystem,
    );
  }

  function getTotalDurationMinutes(): number {
    return getDefinition().editor.getSegments(
      state.draftByModel[state.selectedModel],
    ).reduce((total, segment) => total + segment.durationMinutes, 0);
  }

  function getCharts(): readonly TimeSeriesChartViewModel[] {
    const modelId = state.selectedModel;
    const result = state.resultByModel[modelId];
    const draft = state.draftByModel[modelId];
    return getSimulationOutput(modelId).charts.map((chartDefinition) => ({
      id: chartDefinition.id,
      title: chartDefinition.title,
      description: chartDefinition.description,
      emptyMessage: chartDefinition.emptyMessage,
      heightClass: chartDefinition.heightClass,
      ...(chartDefinition.testId ? { testId: chartDefinition.testId } : {}),
      chart: result === null
        ? null
        : resolveSimulationChartBuild(
            chartDefinition,
            result,
            draft,
            state.unitSystem,
          ),
    }));
  }

  function getStatus(): TimeSeriesRunStatus {
    return state.statusByModel[state.selectedModel];
  }

  return {
    state,
    actions: {
      start,
      dispose,
      selectModel,
      toggleUnitSystem,
      updateSegmentName,
      updateSegmentDuration,
      updateSegmentControl,
      addSegment,
      duplicateSegment,
      removeSegment,
      moveSegment,
      updateSettingControl,
      reset,
    },
    selectors: {
      getModelOptions: () => timeSeriesModelOrder.map((modelId) => ({
        name: getDefinition(modelId).label,
        value: modelId,
      })),
      getCurrentModel: () => {
        const definition = getDefinition();
        return {
          label: definition.label,
          description: definition.description,
          standardLabel: definition.standardLabel,
          ...(definition.reference ? { reference: definition.reference } : {}),
        };
      },
      getEditor,
      getTotalDurationMinutes,
      getSelectedResult: () => state.resultByModel[state.selectedModel],
      getStatus,
      getErrors: () => state.errorsByModel[state.selectedModel],
      getProgress: () => state.progressByModel[state.selectedModel],
      hasStaleResult: () => (
        state.resultByModel[state.selectedModel] !== null
        && getStatus() !== "ready"
      ),
      getSummary: (): readonly MetricSummaryItemViewModel[] => {
        const modelId = state.selectedModel;
        const result = state.resultByModel[modelId];
        if (result === null) return [];
        const table = getComfortModelConfig(modelId).tables.timeSeries;
        if (!table) {
          throw new Error(`Time-series model ${modelId} is missing tables.timeSeries.`);
        }
        return buildMetricSummaryTable(
          table,
          result,
          state.unitSystem,
        ).items;
      },
      getCharts,
    },
  };
}
