import type { RuntimeTimeSeriesModelDefinition } from "../../catalog/timeSeries";
import {
  buildTimeSeriesEditorViewModel,
  type TimeSeriesChartViewModel,
} from "./viewModels";
import type { MetricSummaryItemViewModel } from "../../catalog/tableTypes";
import { buildMetricSummaryTable } from "../../engines/comfort/output/tableResolver";
import { resolveSimulationChartBuild } from "../../engines/comfort/charts/kinds/simulation";
import { getComfortModelConfig, getModelSimulationOutput } from "../modelRegistry";
import { UnitSystem } from "../../catalog/units";
import {
  getTimeSeriesModelConfig,
  timeSeriesModelOrder,
  type TimeSeriesModelId,
} from "./modelConfigs";
import type {
  TimeSeriesActions,
  TimeSeriesInputPanelViewModel,
  TimeSeriesInputState,
  TimeSeriesModelOption,
  TimeSeriesModelViewModel,
  TimeSeriesOutputState,
  TimeSeriesResultsViewModel,
  TimeSeriesRunStatus,
  TimeSeriesSettingState,
  TimeSeriesStateSlice,
} from "./types";

const AUTO_CALCULATION_DEBOUNCE_MS = 300;

interface CreateTimeSeriesSessionOptions {
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

function getDefinition(
  modelId: TimeSeriesModelId,
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

function getModelOptions(): readonly TimeSeriesModelOption[] {
  return timeSeriesModelOrder.map((modelId) => ({
    name: getDefinition(modelId).label,
    value: modelId,
  }));
}

function getCurrentModelView(modelId: TimeSeriesModelId): TimeSeriesModelViewModel {
  const definition = getDefinition(modelId);
  return {
    label: definition.label,
    description: definition.description,
    standardLabel: definition.standardLabel,
    ...(definition.reference ? { reference: definition.reference } : {}),
  };
}

function getEditorView(
  input: TimeSeriesInputState,
  setting: TimeSeriesSettingState,
) {
  const definition = getDefinition(setting.selectedModel);
  return buildTimeSeriesEditorViewModel(
    definition,
    input.draftByModel[setting.selectedModel],
    setting.unitSystem,
  );
}

function getTotalDurationMinutes(
  input: TimeSeriesInputState,
  setting: TimeSeriesSettingState,
): number {
  return getDefinition(setting.selectedModel).editor.getSegments(
    input.draftByModel[setting.selectedModel],
  ).reduce((total, segment) => total + segment.durationMinutes, 0);
}

function getChartsView(
  input: TimeSeriesInputState,
  setting: TimeSeriesSettingState,
  output: TimeSeriesOutputState,
): readonly TimeSeriesChartViewModel[] {
  const modelId = setting.selectedModel;
  const result = output.resultByModel[modelId];
  const draft = input.draftByModel[modelId];
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
          setting.unitSystem,
        ),
  }));
}

function getStatus(output: TimeSeriesOutputState, modelId: TimeSeriesModelId): TimeSeriesRunStatus {
  return output.statusByModel[modelId];
}

function getErrors(output: TimeSeriesOutputState, modelId: TimeSeriesModelId): readonly string[] {
  return output.errorsByModel[modelId];
}

function getProgress(output: TimeSeriesOutputState, modelId: TimeSeriesModelId): number {
  return output.progressByModel[modelId];
}

function hasStaleResult(output: TimeSeriesOutputState, modelId: TimeSeriesModelId): boolean {
  return output.resultByModel[modelId] !== null && getStatus(output, modelId) !== "ready";
}

function getSummary(
  setting: TimeSeriesSettingState,
  output: TimeSeriesOutputState,
): readonly MetricSummaryItemViewModel[] {
  const modelId = setting.selectedModel;
  const result = output.resultByModel[modelId];
  if (result === null) return [];
  const table = getComfortModelConfig(modelId).tables.timeSeries;
  if (!table) {
    throw new Error(`Time-series model ${modelId} is missing tables.timeSeries.`);
  }
  return buildMetricSummaryTable(
    table,
    result,
    setting.unitSystem,
  ).items;
}

export class TimeSeriesSession {
  input: TimeSeriesInputState;
  setting: TimeSeriesSettingState;
  output: TimeSeriesOutputState;
  readonly actions: TimeSeriesActions;

  inputPanel = $derived.by((): TimeSeriesInputPanelViewModel => {
    const modelId = this.setting.selectedModel;
    return {
      selectedModel: modelId,
      unitSystem: this.setting.unitSystem,
      modelItems: getModelOptions(),
      currentModel: getCurrentModelView(modelId),
      editor: getEditorView(this.input, this.setting),
      totalDurationMinutes: getTotalDurationMinutes(this.input, this.setting),
      status: getStatus(this.output, modelId),
      progress: getProgress(this.output, modelId),
      errors: getErrors(this.output, modelId),
    };
  });

  results = $derived.by((): TimeSeriesResultsViewModel => {
    const modelId = this.setting.selectedModel;
    return {
      model: getCurrentModelView(modelId),
      summary: getSummary(this.setting, this.output),
      charts: getChartsView(this.input, this.setting, this.output),
      status: getStatus(this.output, modelId),
      errors: getErrors(this.output, modelId),
      hasStaleResult: hasStaleResult(this.output, modelId),
    };
  });

  constructor(options: CreateTimeSeriesSessionOptions = {}) {
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

  this.input = state.input;
  this.setting = state.setting;
  this.output = state.output;
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
  }
}

export function createTimeSeriesSession(
  options: CreateTimeSeriesSessionOptions = {},
): TimeSeriesSession {
  return new TimeSeriesSession(options);
}
