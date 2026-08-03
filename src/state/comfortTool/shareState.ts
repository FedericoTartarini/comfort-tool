/** Strict current-schema version-1 share snapshots. */
import type { ChartId as ChartIdType } from "../../models/chartOptions";
import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
import type { FieldKey as FieldKeyType } from "../../models/fieldKeys";
import { allFieldOrder } from "../../models/inputFieldsMeta";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import { InputId, inputOrder, type InputId as InputIdType } from "../../models/inputSlots";
import {
  type ChartMode as ChartModeType,
  type ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { validateNumericBands } from "../../services/comfort/charts/bands";
import { isFiniteNumber } from "../../services/comfort/helpers";
import { isDynamicAxisPairValid } from "./dynamicAxes";
import { comfortModelOrder, getComfortModelConfig } from "./modelConfigs";
import type { ComfortToolStateSlice, ModelChartSettings } from "./types";

interface ShareModelChartSettings {
  mode: ChartModeType;
  xAxis: FieldKeyType;
  yAxis: FieldKeyType;
  baselineInputId: InputIdType;
  explore: {
    zOutput: ModelOutputKey;
    bands: NumericBand[];
  } | null;
}

export interface ShareStateSnapshot {
  version: 1;
  selectedModel: ComfortModelType;
  models: Record<
    ComfortModelType,
    {
      selectedChart: ChartIdType;
      options: Partial<Record<OptionKeyType, string>>;
      chartSettings: ShareModelChartSettings;
    }
  >;
  compareEnabled: boolean;
  compareInputIds: InputIdType[];
  activeInputId: InputIdType;
  unitSystem: UnitSystemType;
  inputsByInput: Record<InputIdType, Record<FieldKeyType, number>>;
}

export const SHARE_STATE_VERSION = 1;
const SHARE_STATE_PARAM = "state";
const POSITIVE_INFINITY_WIRE = "__comfort_tool_positive_infinity__";
const NEGATIVE_INFINITY_WIRE = "__comfort_tool_negative_infinity__";
const comfortModelValues = new Set<ComfortModelType>(comfortModelOrder);
const inputIdValues = new Set<InputIdType>(Object.values(InputId));
const unitSystemValues = new Set<UnitSystemType>(Object.values(UnitSystem));
const fieldKeyValues = allFieldOrder;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  const expectedKeys = new Set(keys);
  return actualKeys.length === keys.length
    && actualKeys.every((key) => expectedKeys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeCompareInputIds(inputIds: InputIdType[]): InputIdType[] {
  return inputOrder.filter((inputId) => (
    inputId === InputId.Input1 || inputIds.includes(inputId)
  ));
}

function isCanonicalCompareInputIds(value: unknown): value is InputIdType[] {
  if (
    !Array.isArray(value)
    || !value.every((inputId) => inputIdValues.has(inputId as InputIdType))
    || !value.includes(InputId.Input1)
    || new Set(value).size !== value.length
  ) {
    return false;
  }

  const canonicalOrder = inputOrder.filter((inputId) => value.includes(inputId));
  return canonicalOrder.length === value.length
    && canonicalOrder.every((inputId, index) => value[index] === inputId);
}

function toUrl(source: URL | Location | string): URL {
  return new URL(typeof source === "string" ? source : source.href);
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(
    bytes,
    (byte) => String.fromCharCode(byte),
  ).join("");
  return globalThis.btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw new Error("Invalid Base64URL payload.");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const binary = globalThis.atob(`${normalized}${"=".repeat(paddingLength)}`);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parseInputsByInput(value: unknown): ShareStateSnapshot["inputsByInput"] | null {
  if (!isRecord(value) || !hasExactKeys(value, inputOrder)) {
    return null;
  }

  const inputsByInput = {} as ShareStateSnapshot["inputsByInput"];
  for (const inputId of inputOrder) {
    const inputValues = value[inputId];
    if (!isRecord(inputValues) || !hasExactKeys(inputValues, fieldKeyValues)) {
      return null;
    }

    const parsedInput = {} as Record<FieldKeyType, number>;
    for (const fieldKey of fieldKeyValues) {
      const fieldValue = inputValues[fieldKey];
      if (!isFiniteNumber(fieldValue)) {
        return null;
      }
      parsedInput[fieldKey] = fieldValue;
    }
    inputsByInput[inputId] = parsedInput;
  }
  return inputsByInput;
}

function parseBandEdge(value: unknown): number | null {
  if (value === POSITIVE_INFINITY_WIRE) return Infinity;
  if (value === NEGATIVE_INFINITY_WIRE) return -Infinity;
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

function parseNumericBands(value: unknown): NumericBand[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const bands: NumericBand[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate)
      || !hasExactKeys(candidate, ["min", "max", "label", "color"])
      || typeof candidate.label !== "string"
      || typeof candidate.color !== "string"
    ) {
      return null;
    }
    const min = parseBandEdge(candidate.min);
    const max = parseBandEdge(candidate.max);
    if (min === null || max === null) {
      return null;
    }
    bands.push({ min, max, label: candidate.label, color: candidate.color });
  }

  return validateNumericBands(bands).valid ? bands : null;
}

function parseChartSettings(
  value: unknown,
  modelId: ComfortModelType,
): ShareModelChartSettings | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["mode", "xAxis", "yAxis", "baselineInputId", "explore"])
    || typeof value.mode !== "string"
    || typeof value.xAxis !== "string"
    || typeof value.yAxis !== "string"
    || !inputIdValues.has(value.baselineInputId as InputIdType)
  ) {
    return null;
  }

  const config = getComfortModelConfig(modelId);
  const mode = value.mode as ChartModeType;
  const xAxis = value.xAxis as FieldKeyType;
  const yAxis = value.yAxis as FieldKeyType;
  if (
    !config.modes.includes(mode)
    || !isDynamicAxisPairValid(config, { xAxis, yAxis })
  ) {
    return null;
  }

  let explore: ShareModelChartSettings["explore"] = null;
  if (config.chartableOutputs.length > 0) {
    const exploreValue = value.explore;
    if (
      !isRecord(exploreValue)
      || !hasExactKeys(exploreValue, ["zOutput", "bands"])
      || typeof exploreValue.zOutput !== "string"
      || !config.chartableOutputs.some(({ key }) => key === exploreValue.zOutput)
    ) {
      return null;
    }
    const bands = parseNumericBands(exploreValue.bands);
    if (!bands) {
      return null;
    }
    explore = {
      zOutput: exploreValue.zOutput as ModelOutputKey,
      bands,
    };
  } else if (value.explore !== null) {
    return null;
  }

  return {
    mode,
    xAxis,
    yAxis,
    baselineInputId: value.baselineInputId as InputIdType,
    explore,
  };
}

function parseModelSnapshots(
  value: unknown,
): ShareStateSnapshot["models"] | null {
  if (!isRecord(value) || !hasExactKeys(value, comfortModelOrder)) {
    return null;
  }

  const parsed = {} as ShareStateSnapshot["models"];
  for (const modelId of comfortModelOrder) {
    const modelSnapshot = value[modelId];
    if (
      !isRecord(modelSnapshot)
      || !hasExactKeys(modelSnapshot, ["selectedChart", "options", "chartSettings"])
      || typeof modelSnapshot.selectedChart !== "string"
    ) {
      return null;
    }

    const config = getComfortModelConfig(modelId);
    if (!config.chartIds.includes(modelSnapshot.selectedChart as ChartIdType)) {
      return null;
    }
    const options = config.parseOptions(modelSnapshot.options);
    const chartSettings = parseChartSettings(modelSnapshot.chartSettings, modelId);
    if (!options || !chartSettings) {
      return null;
    }
    parsed[modelId] = {
      selectedChart: modelSnapshot.selectedChart as ChartIdType,
      options,
      chartSettings,
    };
  }
  return parsed;
}

export function serializeShareState(snapshot: ShareStateSnapshot): string {
  const json = JSON.stringify(snapshot, (_key, value: unknown) => {
    if (value === Infinity) return POSITIVE_INFINITY_WIRE;
    if (value === -Infinity) return NEGATIVE_INFINITY_WIRE;
    return value;
  });
  return encodeBase64Url(json);
}

export function parseShareStateSnapshot(value: unknown): ShareStateSnapshot | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      "version",
      "selectedModel",
      "models",
      "compareEnabled",
      "compareInputIds",
      "activeInputId",
      "unitSystem",
      "inputsByInput",
    ])
    || value.version !== SHARE_STATE_VERSION
    || !comfortModelValues.has(value.selectedModel as ComfortModelType)
    || typeof value.compareEnabled !== "boolean"
    || !isCanonicalCompareInputIds(value.compareInputIds)
    || !inputIdValues.has(value.activeInputId as InputIdType)
    || !unitSystemValues.has(value.unitSystem as UnitSystemType)
  ) {
    return null;
  }

  const activeInputId = value.activeInputId as InputIdType;
  if (
    (value.compareEnabled && !value.compareInputIds.includes(activeInputId))
    || (!value.compareEnabled && activeInputId !== InputId.Input1)
  ) {
    return null;
  }

  const models = parseModelSnapshots(value.models);
  const inputsByInput = parseInputsByInput(value.inputsByInput);
  if (!models || !inputsByInput) {
    return null;
  }

  return {
    version: SHARE_STATE_VERSION,
    selectedModel: value.selectedModel as ComfortModelType,
    models,
    compareEnabled: value.compareEnabled,
    compareInputIds: [...value.compareInputIds],
    activeInputId,
    unitSystem: value.unitSystem as UnitSystemType,
    inputsByInput,
  };
}

export function deserializeShareState(encodedSnapshot: string): ShareStateSnapshot | null {
  try {
    return parseShareStateSnapshot(JSON.parse(decodeBase64Url(encodedSnapshot)));
  } catch {
    return null;
  }
}

function cloneChartSettings(settings: ModelChartSettings): ShareModelChartSettings {
  return {
    mode: settings.mode,
    xAxis: settings.xAxis,
    yAxis: settings.yAxis,
    baselineInputId: settings.baselineInputId,
    explore: settings.explore
      ? {
          zOutput: settings.explore.zOutput,
          bands: settings.explore.bands.map((band) => ({ ...band })),
        }
      : null,
  };
}

export function createShareStateSnapshot(state: ComfortToolStateSlice): ShareStateSnapshot {
  return {
    version: SHARE_STATE_VERSION,
    selectedModel: state.ui.selectedModel,
    models: comfortModelOrder.reduce((accumulator, modelId) => {
      accumulator[modelId] = {
        selectedChart: state.ui.selectedChartByModel[modelId],
        options: { ...state.ui.modelOptionsByModel[modelId] },
        chartSettings: cloneChartSettings(state.ui.chartSettingsByModel[modelId]),
      };
      return accumulator;
    }, {} as ShareStateSnapshot["models"]),
    compareEnabled: state.ui.compareEnabled,
    compareInputIds: [...state.ui.compareInputIds],
    activeInputId: state.ui.activeInputId,
    unitSystem: state.ui.unitSystem,
    inputsByInput: inputOrder.reduce((accumulator, inputId) => {
      accumulator[inputId] = allFieldOrder.reduce((inputAccumulator, fieldKey) => {
        inputAccumulator[fieldKey] = state.inputsByInput[inputId][fieldKey];
        return inputAccumulator;
      }, {} as ShareStateSnapshot["inputsByInput"][typeof inputId]);
      return accumulator;
    }, {} as ShareStateSnapshot["inputsByInput"]),
  };
}

export function applyShareSnapshotToState(
  state: ComfortToolStateSlice,
  snapshot: ShareStateSnapshot,
) {
  state.ui.selectedModel = snapshot.selectedModel;
  for (const modelId of comfortModelOrder) {
    const modelSnapshot = snapshot.models[modelId];
    state.ui.selectedChartByModel[modelId] = modelSnapshot.selectedChart;
    state.ui.modelOptionsByModel[modelId] = { ...modelSnapshot.options };
    state.ui.chartSettingsByModel[modelId] = cloneChartSettings(
      modelSnapshot.chartSettings,
    );
  }
  state.ui.compareEnabled = snapshot.compareEnabled;
  state.ui.compareInputIds = [...snapshot.compareInputIds];
  state.ui.activeInputId = snapshot.activeInputId;
  state.ui.unitSystem = snapshot.unitSystem;

  for (const inputId of inputOrder) {
    for (const fieldKey of allFieldOrder) {
      state.inputsByInput[inputId][fieldKey] = snapshot.inputsByInput[inputId][fieldKey];
    }
  }
}

export function buildShareUrl(
  snapshot: ShareStateSnapshot,
  locationSource: URL | Location | string,
): string {
  const url = toUrl(locationSource);
  url.searchParams.set(SHARE_STATE_PARAM, serializeShareState(snapshot));
  return url.toString();
}

export function readShareStateFromUrl(
  locationSource: URL | Location | string,
): ShareStateSnapshot | null {
  const encodedSnapshot = toUrl(locationSource).searchParams.get(SHARE_STATE_PARAM);
  return encodedSnapshot ? deserializeShareState(encodedSnapshot) : null;
}
