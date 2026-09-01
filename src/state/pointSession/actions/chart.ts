import { inputOrder, type InputId as InputIdType } from "../../../catalog/inputSlots";
import { type NumericBand } from "../../../catalog/modelCapabilities";
import type { PhysicalQuantityId, PhysicalQuantityId as PhysicalQuantityIdType } from "../../../catalog/quantities";
import type { RuntimeComfortModelDefinition } from "../../modelRegistry/definition";
import {
  normalizeDynamicAxisPair,
  resolveDynamicAxisSelection,
} from "../dynamicAxes";
import {
  findChartEngineRegistration,
  resolveChartInstanceCapabilities,
} from "../chartInstancePresentation";
import {
  normalizeExploreStateForChart,
  replaceExploreBands,
  selectExploreOutput,
} from "../fieldChartState";
import type { PointActions } from "../sessionTypes";
import type { PointActionContext } from "./context";

export function createChartActions({
  session,
  internals,
}: PointActionContext): Pick<
  PointActions,
  | "setSelectedChartInstance"
  | "setDynamicXAxis"
  | "setDynamicYAxis"
  | "setExploreOutput"
  | "setExploreBands"
  | "setChartBaselineInputId"
> {
  function ensureValidDynamicAxes(
    config: Pick<
      RuntimeComfortModelDefinition,
      "dynamicAxisFields" | "defaultDynamicAxes"
    >,
  ) {
    const pair = normalizeDynamicAxisPair(config, internals.getCurrentDynamicAxisPair());
    const settings = internals.getCurrentOutputSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  function setSelectedChartInstance(instanceId: string) {
    const config = internals.getActiveModelConfig();
    const nextInstance = config.chartInstances.entries.find(
      (entry) => entry.instanceId === instanceId,
    );
    if (!nextInstance) {
      return;
    }

    session.setting.selectedChartInstanceByModel[session.setting.selectedModel] = instanceId;

    const registration = findChartEngineRegistration(
      config.chartEngineRegistrations,
      instanceId,
    );
    const settings = internals.getCurrentOutputSettings();
    const normalized = normalizeExploreStateForChart(config, settings, registration);
    settings.exploreOutput = normalized.exploreOutput;
    settings.exploreBands = normalized.exploreBands;

    if (resolveChartInstanceCapabilities(nextInstance).allowsAxisSelection) {
      ensureValidDynamicAxes(config);
    }
  }

  function setDynamicXAxis(fieldKey: PhysicalQuantityId) {
    const pair = resolveDynamicAxisSelection(
      internals.getActiveModelConfig(),
      internals.getCurrentDynamicAxisPair(),
      "x",
      fieldKey,
    );
    if (!pair) {
      return;
    }

    const settings = internals.getCurrentOutputSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  function setDynamicYAxis(fieldKey: PhysicalQuantityId) {
    const pair = resolveDynamicAxisSelection(
      internals.getActiveModelConfig(),
      internals.getCurrentDynamicAxisPair(),
      "y",
      fieldKey,
    );
    if (!pair) {
      return;
    }

    const settings = internals.getCurrentOutputSettings();
    settings.xAxis = pair.xAxis;
    settings.yAxis = pair.yAxis;
  }

  function setExploreOutput(outputKey: PhysicalQuantityIdType) {
    const config = internals.getActiveModelConfig();
    const registration = findChartEngineRegistration(
      config.chartEngineRegistrations,
      internals.getCurrentSelectedChartInstanceId(),
    );
    const nextSettings = selectExploreOutput(
      config,
      internals.getCurrentOutputSettings(),
      outputKey,
      registration,
    );
    if (nextSettings) {
      const settings = internals.getCurrentOutputSettings();
      settings.exploreOutput = nextSettings.exploreOutput;
      settings.exploreBands = nextSettings.exploreBands;
    }
  }

  function setExploreBands(bands: readonly NumericBand[]): boolean {
    const nextSettings = replaceExploreBands(
      internals.getActiveModelConfig(),
      internals.getCurrentOutputSettings(),
      bands,
    );
    if (!nextSettings) {
      return false;
    }

    const settings = internals.getCurrentOutputSettings();
    settings.exploreOutput = nextSettings.exploreOutput;
    settings.exploreBands = nextSettings.exploreBands;
    return true;
  }

  function setChartBaselineInputId(inputId: InputIdType) {
    if (!inputOrder.includes(inputId)) {
      return;
    }
    internals.getCurrentOutputSettings().baselineInputId = inputId;
  }

  return {
    setSelectedChartInstance,
    setDynamicXAxis,
    setDynamicYAxis,
    setExploreOutput,
    setExploreBands,
    setChartBaselineInputId,
  };
}
