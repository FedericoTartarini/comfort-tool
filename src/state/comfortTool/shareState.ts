/**
 * Serializable share-state snapshot helpers.
 * Snapshots only store canonical SI inputs plus UI selections that need to survive a reload or shared link.
 */
import { inputOrder, InputId, type InputId as InputIdType } from "../../models/inputSlots";
import type { ChartId as ChartIdType } from "../../models/chartOptions";
import { ComfortModel, comfortModelOrder, type ComfortModel as ComfortModelType } from "../../models/comfortModels";
import { FieldKey, type FieldKey as FieldKeyType } from "../../models/fieldKeys";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { allFieldOrder } from "../../models/inputFieldsMeta";
import { getComfortModelConfig } from "./modelConfigs";
import type { ComfortToolStateSlice } from "./types";

export interface ShareStateSnapshot {
  version: 6;
  selectedModel: ComfortModelType;
  models: Record<
    ComfortModelType,
    {
      selectedChart: ChartIdType;
      options: Partial<Record<OptionKeyType, string>>;
    }
  >;
  compareEnabled: boolean;
  compareInputIds: InputIdType[];
  activeInputId: InputIdType;
  unitSystem: UnitSystemType;
  inputsByInput: Record<InputIdType, Record<FieldKeyType, number>>;
}

const SHARE_STATE_VERSION = 6;
const SHARE_STATE_PARAM = "state";
const comfortModelValues = new Set<ComfortModelType>(Object.values(ComfortModel));
const inputIdValues = new Set<InputIdType>(Object.values(InputId));
const unitSystemValues = new Set<UnitSystemType>(Object.values(UnitSystem));
const fieldKeyValues = Object.values(FieldKey);

// todo AI normalizeCompareInputIds is defined identically in createComfortToolState.svelte.ts. One copy should be removed. Since this logic is stateless and not UI-specific, keeping it here and importing it from the controller is probably the right move.
/**
 * Cleanses and reconstructs the compare slots array.
 * Ensures that Input 1 is always present as the baseline and that other elements
 * strictly conform to the canonical `inputOrder` structure, dropping invalid IDs.
 * @param inputIds The unsorted or incomplete list of input IDs.
 * @returns A sanitized and ordered array of input IDs.
 */
function normalizeCompareInputIds(inputIds: InputIdType[]): InputIdType[] {
  return inputOrder.filter((inputId) => inputId === InputId.Input1 || inputIds.includes(inputId));
}

/**
 * Coerces various location-like types into a standard URL object.
 * @param source The URL, Location, or string to convert.
 * @returns A native URL object.
 */
function toUrl(source: URL | Location | string): URL {
  if (source instanceof URL) {
    return new URL(source.toString());
  }

  if (typeof source === "string") {
    return new URL(source);
  }

  return new URL(source.href);
}

function encodeBase64Url(value: string): string {
  const encoded = typeof globalThis.btoa === "function"
    ? globalThis.btoa(value)
    : Buffer.from(value, "utf8").toString("base64");

  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${"=".repeat(paddingLength)}`;

  return typeof globalThis.atob === "function"
    ? globalThis.atob(padded)
    : Buffer.from(padded, "base64").toString("utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseInputsByInput(value: unknown): ShareStateSnapshot["inputsByInput"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const inputsByInput = {} as ShareStateSnapshot["inputsByInput"];

  for (const inputId of inputOrder) {
    const inputValues = value[inputId];
    if (!isRecord(inputValues)) {
      return null;
    }

    const normalizedInputValues = {} as Record<FieldKeyType, number>;
    for (const fieldKey of fieldKeyValues) {
      const fieldValue = inputValues[fieldKey];
      if (!isFiniteNumber(fieldValue)) {
        return null;
      }
      normalizedInputValues[fieldKey] = fieldValue;
    }

    inputsByInput[inputId] = normalizedInputValues;
  }

  return inputsByInput;
}

function parseModelSnapshots(value: unknown): ShareStateSnapshot["models"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const parsed = {} as ShareStateSnapshot["models"];

  for (const modelId of comfortModelOrder) {
    const modelSnapshot = value[modelId];
    if (!isRecord(modelSnapshot)) {
      return null;
    }

    const selectedChart = modelSnapshot.selectedChart;
    if (typeof selectedChart !== "string") {
      return null;
    }

    const modelConfig = getComfortModelConfig(modelId);
    if (!modelConfig.chartIds.includes(selectedChart as ChartIdType)) {
      return null;
    }

    const options = modelConfig.normalizeOptions(modelSnapshot.options);
    if (!options) {
      return null;
    }

    parsed[modelId] = {
      selectedChart: selectedChart as ChartIdType,
      options,
    };
  }

  return parsed;
}

/**
 * Serializes a tool state snapshot into a Base64URL encoded string.
 * @param snapshot The data structure to serialize.
 * @returns A URL-safe string representation of the state.
 */
export function serializeShareState(snapshot: ShareStateSnapshot): string {
  return encodeBase64Url(JSON.stringify(snapshot));
}

function parseShareStateSnapshotV6(parsed: Record<string, unknown>): ShareStateSnapshot | null {
  if (
    !comfortModelValues.has(parsed.selectedModel as ComfortModelType) ||
    typeof parsed.compareEnabled !== "boolean" ||
    !Array.isArray(parsed.compareInputIds) ||
    !parsed.compareInputIds.every((inputId) => inputIdValues.has(inputId as InputIdType)) ||
    !inputIdValues.has(parsed.activeInputId as InputIdType) ||
    !unitSystemValues.has(parsed.unitSystem as UnitSystemType)
  ) {
    return null;
  }

  const models = parseModelSnapshots(parsed.models);
  if (!models) {
    return null;
  }

  const inputsByInput = parseInputsByInput(parsed.inputsByInput);
  if (!inputsByInput) {
    return null;
  }

  return {
    version: SHARE_STATE_VERSION,
    selectedModel: parsed.selectedModel as ComfortModelType,
    models,
    compareEnabled: parsed.compareEnabled,
    compareInputIds: parsed.compareInputIds as InputIdType[],
    activeInputId: parsed.activeInputId as InputIdType,
    unitSystem: parsed.unitSystem as UnitSystemType,
    inputsByInput,
  };
}

export function parseShareStateSnapshot(value: unknown): ShareStateSnapshot | null {
  if (!isRecord(value) || typeof value.version !== "number") {
    return null;
  }

  if (value.version === SHARE_STATE_VERSION) {
    return parseShareStateSnapshotV6(value);
  }

  return null;
}

/**
 * Decompresses and validates a state snapshot from a Base64URL string.
 * @param encodedSnapshot The string to decode.
 * @returns A validated ShareStateSnapshot object, or null if the input is invalid.
 */
export function deserializeShareState(encodedSnapshot: string): ShareStateSnapshot | null {
  try {
    return parseShareStateSnapshot(JSON.parse(decodeBase64Url(encodedSnapshot)));
  } catch {
    return null;
  }
}

export function createShareStateSnapshot(state: ComfortToolStateSlice): ShareStateSnapshot {
  return {
    version: SHARE_STATE_VERSION,
    selectedModel: state.ui.selectedModel,
    models: comfortModelOrder.reduce((accumulator, modelId) => {
      accumulator[modelId] = {
        selectedChart: state.ui.selectedChartByModel[modelId],
        options: { ...state.ui.modelOptionsByModel[modelId] },
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

export function applyShareSnapshotToState(state: ComfortToolStateSlice, snapshot: ShareStateSnapshot) {
  state.ui.selectedModel = snapshot.selectedModel;
  comfortModelOrder.forEach((modelId) => {
    state.ui.selectedChartByModel[modelId] = snapshot.models[modelId].selectedChart;
    state.ui.modelOptionsByModel[modelId] = { ...snapshot.models[modelId].options };
  });
  state.ui.compareEnabled = snapshot.compareEnabled;
  state.ui.compareInputIds = normalizeCompareInputIds(snapshot.compareInputIds);
  state.ui.activeInputId = snapshot.compareEnabled && state.ui.compareInputIds.includes(snapshot.activeInputId)
    ? snapshot.activeInputId
    : InputId.Input1;
  state.ui.unitSystem = snapshot.unitSystem;

  inputOrder.forEach((inputId) => {
    allFieldOrder.forEach((fieldKey) => {
      state.inputsByInput[inputId][fieldKey] = snapshot.inputsByInput[inputId][fieldKey];
    });
  });
}

/**
 * Generates a fully qualified URL containing the serialized tool state.
 * @param snapshot The state to include in the URL.
 * @param locationSource The current location context (to preserve the base URL).
 * @returns The shareable URL string.
 */
export function buildShareUrl(snapshot: ShareStateSnapshot, locationSource: URL | Location | string): string {
  const url = toUrl(locationSource);
  url.searchParams.set(SHARE_STATE_PARAM, serializeShareState(snapshot));
  return url.toString();
}

/**
 * Attempts to extract and deserialize a state snapshot from the provided URL.
 * @param locationSource The URL string or object to read from.
 * @returns The deserialized snapshot if successful, otherwise null.
 */
export function readShareStateFromUrl(locationSource: URL | Location | string): ShareStateSnapshot | null {
  const url = toUrl(locationSource);
  const encodedSnapshot = url.searchParams.get(SHARE_STATE_PARAM);
  if (!encodedSnapshot) {
    return null;
  }

  return deserializeShareState(encodedSnapshot);
}
