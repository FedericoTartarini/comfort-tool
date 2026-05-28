/**
 * Serializable share-state snapshot helpers.
 * Snapshots only store canonical SI inputs plus UI selections that need to survive a reload or shared link.
 */
import { inputOrder, InputId, type InputId as InputIdType } from "../../models/inputSlots";
import type { ChartId as ChartIdType } from "../../models/chartOptions";
import { ComfortModel, type ComfortModel as ComfortModelType } from "../../models/comfortModels";
import { FieldKey, type FieldKey as FieldKeyType } from "../../models/fieldKeys";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { allFieldOrder } from "../../models/inputFieldsMeta";
import { getComfortModelConfig, comfortModelOrder } from "./modelConfigs";
import type { ComfortToolStateSlice } from "./types";
import { isFiniteNumber } from "../../services/comfort/helpers";

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
  dynamicXAxis?: FieldKeyType;
  dynamicYAxis?: FieldKeyType;
}

const SHARE_STATE_VERSION = 6;
const SHARE_STATE_PARAM = "state";
const comfortModelValues = new Set<ComfortModelType>(Object.values(ComfortModel));
const inputIdValues = new Set<InputIdType>(Object.values(InputId));
const unitSystemValues = new Set<UnitSystemType>(Object.values(UnitSystem));
const fieldKeyValues = allFieldOrder;

/**
 * Cleanses and reconstructs the compare slots array.
 * Ensures that Input 1 is always present as the baseline and that other elements
 * strictly conform to the canonical `inputOrder` structure, dropping invalid IDs.
 * @param inputIds The unsorted or incomplete list of input IDs.
 * @returns A sanitized and ordered array of input IDs.
 */
export function normalizeCompareInputIds(inputIds: InputIdType[]): InputIdType[] {
  return inputOrder.filter((inputId) => inputId === InputId.Input1 || inputIds.includes(inputId));
}

/**
 * Helper function to convert various location-like types into a standard URL object by checking the type of the source.
 * @param source The URL, Location, or string to convert.
 * @returns A native URL object.
 */
function toUrl(source: URL | Location | string): URL {
  return new URL(typeof source === "string" ? source : source.href);
}
/**
 * Encodes a string into a URL-safe Base64 string by using the browser's btoa function and replacing the characters that are not URL-safe.
 * @param value The string to encode.
 * @returns The Base64 encoded string.
 */
function encodeBase64Url(value: string): string {
  const encoded = globalThis.btoa(value);
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
/**
 * Decodes a URL-safe Base64 string into a string by using the browser's atob function and replacing the characters that are not URL-safe.
 * @param value The Base64 encoded string.
 * @returns The decoded string.
 */
function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${"=".repeat(paddingLength)}`;
  return globalThis.atob(padded);
}
/**
 * Checks if a value is a record (an object that is not null and not an array).
 * @param value The value to check.
 * @returns True if the value is a record, false otherwise.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


/**
 * Parses the inputsByInput object from the ShareStateSnapshot and validates it. This is used when deserializing the share state.
 * @param value The value to parse.
 * @returns The inputsByInput object or null if parsing fails.
 */
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
/**
 * Parses the models object from the ShareStateSnapshot and validates it. This is used when deserializing the share state.
 * @param value The value to parse.
 * @returns The models object or null if parsing fails.
 */
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
 * Serializes a tool state snapshot into a Base64URL encoded string by stringifying the snapshot 
 * and then encoding it using the encodeBase64Url function.
 * @param snapshot The data structure to serialize.
 * @returns A URL-safe string representation of the state.
 */
export function serializeShareState(snapshot: ShareStateSnapshot): string {
  return encodeBase64Url(JSON.stringify(snapshot));
}
/**
 * Parses the share state snapshot and validates it. This is used when deserializing the share state.
 * @param parsed The value to parse.
 * @returns The share state snapshot or null if parsing fails.
 */
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

  const validFieldKeys = new Set<FieldKeyType>(Object.values(FieldKey));
  let dynamicXAxis: FieldKeyType | undefined = undefined;
  let dynamicYAxis: FieldKeyType | undefined = undefined;

  if (parsed.dynamicXAxis !== undefined) {
    if (typeof parsed.dynamicXAxis !== "string" || !validFieldKeys.has(parsed.dynamicXAxis as FieldKeyType)) {
      return null;
    }
    dynamicXAxis = parsed.dynamicXAxis as FieldKeyType;
  }

  if (parsed.dynamicYAxis !== undefined) {
    if (typeof parsed.dynamicYAxis !== "string" || !validFieldKeys.has(parsed.dynamicYAxis as FieldKeyType)) {
      return null;
    }
    dynamicYAxis = parsed.dynamicYAxis as FieldKeyType;
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
    dynamicXAxis,
    dynamicYAxis,
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
 * Decompresses and validates a state snapshot from a Base64URL string by decoding it and then parsing it.
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
/**
 * Creates a share state snapshot from the current state by copying the relevant data.
 * @param state The current state.
 * @returns A share state snapshot.
 */
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
    dynamicXAxis: state.ui.dynamicXAxis,
    dynamicYAxis: state.ui.dynamicYAxis,
  };
}
/**
 * Applies a share state snapshot to the current state by copying the relevant data 
 * and updating the state immutably.
 * @param state The current state.
 * @param snapshot The share state snapshot to apply.
 */
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

  if (snapshot.dynamicXAxis) {
    state.ui.dynamicXAxis = snapshot.dynamicXAxis;
  }
  if (snapshot.dynamicYAxis) {
    state.ui.dynamicYAxis = snapshot.dynamicYAxis;
  }

  // Ensure dynamic axes are valid and unique for the loaded model
  const config = getComfortModelConfig(snapshot.selectedModel);
  if (config.dynamicAxisFields && config.dynamicAxisFields.length >= 2) {
    if (!config.dynamicAxisFields.includes(state.ui.dynamicXAxis as any)) {
      state.ui.dynamicXAxis = config.dynamicAxisFields[0];
    }

    if (!config.dynamicAxisFields.includes(state.ui.dynamicYAxis as any)) {
      state.ui.dynamicYAxis = config.dynamicAxisFields[config.dynamicAxisFields.length - 1];
    }

    if (state.ui.dynamicXAxis === state.ui.dynamicYAxis) {
      const fields = config.dynamicAxisFields;
      const currentIndex = fields.indexOf(state.ui.dynamicYAxis as any);
      const nextIndex = (currentIndex + 1) % fields.length;
      state.ui.dynamicYAxis = fields[nextIndex];
    }
  }
}

/**
 * Generates a fully qualified URL containing the serialized tool state by serializing the snapshot and then encoding it.
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
 * Attempts to extract and deserialize a state snapshot from the provided URL by getting the search param and then deserializing it.
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
