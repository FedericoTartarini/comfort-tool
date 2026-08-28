import type { RuntimeTimeSeriesModelDefinition } from "../../catalog/timeSeries";
import {
  buildTimeSeriesEditorViewModel,
  type TimeSeriesChartViewModel,
} from "./viewModels";
import type { MetricSummaryItemViewModel } from "../../catalog/tableTypes";
import { buildMetricSummaryTable } from "../../engines/comfort/output/tableResolver";
import { resolveSimulationChartBuild } from "../../engines/comfort/charts/kinds/simulation";
import { getComfortModelConfig, getModelSimulationOutput } from "../analysis/modelConfigs";
import { UnitSystem } from "../../catalog/units";
import {
  getTimeSeriesModelConfig,
  timeSeriesModelOrder,
  type TimeSeriesModelId,
} from "./modelConfigs";
import type {
  TimeSeriesActions,
  TimeSeriesController,
  TimeSeriesRunStatus,
  TimeSeriesSelectors,
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

export class TimeSeriesSession implements TimeSeriesController {
  readonly state: TimeSeriesStateSlice;
  readonly actions: TimeSeriesActions;
  readonly selectors: TimeSeriesSelectors;

  constructor(options: CreateTimeSeriesStateOptions = {}) {
  const debounceMs = options.debounceMs ?? AUTO_CALCULATION_DEBOUNCE_MS;
  const defaultModel = timeSeriesModelOrder[0];
  if (!defaultModel) {
    throw new Error("The Time-series registry requires at least one enabled model.");
  }

  const state = $state<TimeSeriesStateSlice>({
    input: {
      draftByModel: createRecord((modelId) => (
        getTimeSeriesModelConfig(modelId).createDefaultDraft()
      )),
    },
    setting: {
      selectedModel: defaultModel,
      unitSystem: UnitSystem.SI,
    },
    output: {
      resultByModel: createRecord(() => null),
      statusByModel: createRecord(() => "waiting"),
      errorsByModel: createRecord(() => []),
      revisionByModel: createRecord(() => 0),
      progressByModel: createRecord(() => 0),
    },
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
      state.input.draftByModel[modelId],
    ).length + 1
  ));
  let started = false;
  let disposed = false;

  function getDefinition(
    modelId: TimeSeriesModelId = state.setting.selectedModel,
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
    if (disposed || revision !== state.output.revisionByModel[modelId]) return;

    const definition = getDefinition(modelId);
    const controller = new AbortController();
    abortControllerByModel[modelId] = controller;
    state.output.statusByModel[modelId] = "updating";
    state.output.progressByModel[modelId] = 0;
    const draft = definition.cloneDraft(state.input.draftByModel[modelId]);

    try {
      const result = await definition.simulate(draft, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (
            !controller.signal.aborted
            && revision === state.output.revisionByModel[modelId]
          ) {
            state.output.progressByModel[modelId] = Math.min(1, Math.max(0, progress));
          }
        },
      });
      if (
        controller.signal.aborted
        || disposed
        || revision !== state.output.revisionByModel[modelId]
      ) {
        return;
      }
      state.output.resultByModel[modelId] = result;
      state.output.errorsByModel[modelId] = [];
      state.output.statusByModel[modelId] = "ready";
      state.output.progressByModel[modelId] = 1;
    } catch (error) {
      if (
        controller.signal.aborted
        || disposed
        || revision !== state.output.revisionByModel[modelId]
      ) {
        return;
      }
      state.output.statusByModel[modelId] = "error";
      state.output.errorsByModel[modelId] = [
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
    const revision = state.output.revisionByModel[modelId] + 1;
    state.output.revisionByModel[modelId] = revision;
    state.output.progressByModel[modelId] = 0;

    const definition = getDefinition(modelId);
    const issues = definition.validate(state.input.draftByModel[modelId]);
    state.output.errorsByModel[modelId] = [...issues];
    if (issues.length > 0) {
      state.output.statusByModel[modelId] = "waiting";
      return;
    }

    state.output.statusByModel[modelId] = scheduleOptions.immediate
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
    const modelId = state.setting.selectedModel;
    if (
      state.output.resultByModel[modelId] === null
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
    if (!isTimeSeriesModelId(modelId) || modelId === state.setting.selectedModel) return;
    state.setting.selectedModel = modelId;
    if (
      started
      && state.output.resultByModel[modelId] === null
      && timerByModel[modelId] === undefined
      && !abortControllerByModel[modelId]
    ) {
      scheduleSimulation(modelId, { immediate: true });
    }
  }

  function toggleUnitSystem() {
    state.setting.unitSystem = state.setting.unitSystem === UnitSystem.SI
      ? UnitSystem.IP
      : UnitSystem.SI;
  }

  function updateSegmentName(segmentId: string, name: string) {
    getDefinition().editor.updateSegmentName(
      state.input.draftByModel[state.setting.selectedModel],
      segmentId,
      name,
    );
  }

  function updateSegmentDuration(
    segmentId: string,
    rawValue: string,
  ): boolean {
    const modelId = state.setting.selectedModel;
    const changed = getDefinition().editor.updateSegmentDuration(
      state.input.draftByModel[modelId],
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
    const modelId = state.setting.selectedModel;
    const definition = getDefinition();
    const control = definition.editor.segmentControls.find(
      ({ id }) => id === controlId,
    );
    if (!control) return false;
    const changed = control.applyDisplayValue(
      state.input.draftByModel[modelId],
      rawDisplayValue,
      state.setting.unitSystem,
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
    const modelId = state.setting.selectedModel;
    const changed = getDefinition().editor.addSegment(
      state.input.draftByModel[modelId],
      createSegmentId(modelId),
      presetId,
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
  }

  function duplicateSegment(segmentId: string) {
    const modelId = state.setting.selectedModel;
    const changed = getDefinition().editor.duplicateSegment(
      state.input.draftByModel[modelId],
      segmentId,
      createSegmentId(modelId),
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
  }

  function removeSegment(segmentId: string) {
    const modelId = state.setting.selectedModel;
    const changed = getDefinition().editor.removeSegment(
      state.input.draftByModel[modelId],
      segmentId,
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
  }

  function moveSegment(segmentId: string, direction: -1 | 1) {
    const modelId = state.setting.selectedModel;
    const changed = getDefinition().editor.moveSegment(
      state.input.draftByModel[modelId],
      segmentId,
      direction,
    );
    if (changed) scheduleAfterRelevantEdit(modelId);
  }

  function updateSettingControl(
    controlId: string,
    value: string | boolean,
  ): boolean {
    const modelId = state.setting.selectedModel;
    const definition = getDefinition();
    const control = definition.editor.settingsSections
      .flatMap(({ controls }) => controls)
      .find(({ id }) => id === controlId);
    if (!control) return false;

    let changed = false;
    if (control.kind === "number" && typeof value === "string") {
      changed = control.applyDisplayValue(
        state.input.draftByModel[modelId],
        value,
        state.setting.unitSystem,
      );
    } else if (control.kind === "select" && typeof value === "string") {
      changed = control.applyValue(state.input.draftByModel[modelId], value);
    } else if (control.kind === "toggle" && typeof value === "boolean") {
      changed = control.applyValue(state.input.draftByModel[modelId], value);
    }
    if (changed) scheduleAfterRelevantEdit(modelId);
    return changed;
  }

  function reset() {
    const modelId = state.setting.selectedModel;
    const definition = getDefinition();
    state.input.draftByModel[modelId] = definition.createDefaultDraft();
    nextSegmentSequenceByModel[modelId] = definition.editor.getSegments(
      state.input.draftByModel[modelId],
    ).length + 1;
    scheduleSimulation(modelId);
  }

  function getEditor() {
    const definition = getDefinition();
    return buildTimeSeriesEditorViewModel(
      definition,
      state.input.draftByModel[state.setting.selectedModel],
      state.setting.unitSystem,
    );
  }

  function getTotalDurationMinutes(): number {
    return getDefinition().editor.getSegments(
      state.input.draftByModel[state.setting.selectedModel],
    ).reduce((total, segment) => total + segment.durationMinutes, 0);
  }

  function getCharts(): readonly TimeSeriesChartViewModel[] {
    const modelId = state.setting.selectedModel;
    const result = state.output.resultByModel[modelId];
    const draft = state.input.draftByModel[modelId];
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
            state.setting.unitSystem,
          ),
    }));
  }

  function getStatus(): TimeSeriesRunStatus {
    return state.output.statusByModel[state.setting.selectedModel];
  }

  this.state = state;
  this.actions = {
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
    };
  this.selectors = {
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
      getSelectedResult: () => state.output.resultByModel[state.setting.selectedModel],
      getStatus,
      getErrors: () => state.output.errorsByModel[state.setting.selectedModel],
      getProgress: () => state.output.progressByModel[state.setting.selectedModel],
      hasStaleResult: () => (
        state.output.resultByModel[state.setting.selectedModel] !== null
        && getStatus() !== "ready"
      ),
      getSummary: (): readonly MetricSummaryItemViewModel[] => {
        const modelId = state.setting.selectedModel;
        const result = state.output.resultByModel[modelId];
        if (result === null) return [];
        const table = getComfortModelConfig(modelId).tables.timeSeries;
        if (!table) {
          throw new Error(`Time-series model ${modelId} is missing tables.timeSeries.`);
        }
        return buildMetricSummaryTable(
          table,
          result,
          state.setting.unitSystem,
        ).items;
      },
      getCharts,
    };
  }
}

export function createTimeSeriesState(
  options: CreateTimeSeriesStateOptions = {},
): TimeSeriesController {
  return new TimeSeriesSession(options);
}
