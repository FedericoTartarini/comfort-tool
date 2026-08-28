/** Parse/validate share snapshots: infinity sentinels, sparse default omit, serialize/deserialize. */
import type { ModelId as ModelIdType } from "../../../catalog/modelIds";
import { PhysicalQuantityId } from "../../../catalog/quantities";
import type { OptionKey as OptionKeyType } from "../../../catalog/inputModes";
import {
  inputModifierCatalogue,
  modifierOrder,
  type ModifierId as ModifierIdType,
} from "../../../catalog/inputModifiers";
import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../../catalog/inputSlots";
import { type NumericBand } from "../../../catalog/modelCapabilities";
import {
  UnitSystem,
  type UnitSystem as UnitSystemType,
} from "../../../catalog/units";
import { validateNumericBands } from "../../../engines/comfort/charts/bands";
import { isFiniteNumber } from "../../../engines/comfort/helpers";
import {
  isModifierConfigurationComplete,
  isModifierFieldValueValid,
} from "../../../engines/comfort/inputModifiers";
import { isDynamicAxisPairValid } from "../dynamicAxes";
import { comfortModelOrder, getComfortModelConfig } from "../../modelRegistry";
import { collectModifierInputsForModifier } from "../../../engines/comfort/quantityStateRouting";
import {
  isPhysicalQuantityId,
  primaryInputOrder,
  type ChartAxisQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PrimaryInputState,
} from "../../../catalog/quantities";
import type { ActiveModifiersByInputState } from "../sessionTypes";
import {
  createDefaultModelSnapshot,
  extraQuantityIdsForModel,
  modifierQuantityIds,
  type ShareModelInputsByModelState,
  type ShareModelOutputSettings,
  type ShareModelSnapshot,
  type ShareStateSnapshot,
  type ShareAuxiliaryQuantitiesByInputState,
} from "./snapshot";

export const SHARE_STATE_VERSION = 1;
export const SHARE_STATE_PARAM = "state";
const POSITIVE_INFINITY_WIRE = "__comfort_tool_positive_infinity__";
const NEGATIVE_INFINITY_WIRE = "__comfort_tool_negative_infinity__";
const comfortModelValues = new Set<ModelIdType>(comfortModelOrder);
const inputIdValues = new Set<InputIdType>(Object.values(InputId));
const unitSystemValues = new Set<UnitSystemType>(Object.values(UnitSystem));
const modifierQuantityIdSet = new Set<PhysicalQuantityIdType>(
  modifierQuantityIds,
);

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  const expectedKeys = new Set(keys);
  return (
    actualKeys.length === keys.length &&
    actualKeys.every((key) => expectedKeys.has(key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimaryInputState(value: unknown): value is PrimaryInputState {
  return (
    isRecord(value) &&
    hasExactKeys(value, primaryInputOrder) &&
    primaryInputOrder.every((quantityId) => isFiniteNumber(value[quantityId]))
  );
}

function isCanonicalCompareInputIds(value: unknown): value is InputIdType[] {
  if (
    !Array.isArray(value) ||
    !value.every((inputId) => inputIdValues.has(inputId as InputIdType)) ||
    !value.includes(InputId.Input1) ||
    new Set(value).size !== value.length
  ) {
    return false;
  }

  const canonicalOrder = inputOrder.filter((inputId) =>
    value.includes(inputId),
  );
  return (
    canonicalOrder.length === value.length &&
    canonicalOrder.every((inputId, index) => value[index] === inputId)
  );
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    "",
  );
  return globalThis
    .btoa(binary)
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

function parseSparseModifierQuantities(
  value: unknown,
): Partial<Record<PhysicalQuantityIdType, number>> | null {
  if (!isRecord(value)) {
    return null;
  }

  const parsed: Partial<Record<PhysicalQuantityIdType, number>> = {};
  for (const [rawKey, fieldValue] of Object.entries(value)) {
    if (!isPhysicalQuantityId(rawKey) || !modifierQuantityIdSet.has(rawKey)) {
      return null;
    }
    if (!isModifierFieldValueValid(rawKey, fieldValue)) {
      return null;
    }
    parsed[rawKey] = fieldValue;
  }
  return parsed;
}

function parseQuantitiesByInput(
  value: unknown,
): ShareStateSnapshot["quantitiesByInput"] | null {
  if (!isRecord(value) || !hasExactKeys(value, inputOrder)) {
    return null;
  }

  const input1 = value[InputId.Input1];
  const input2 = value[InputId.Input2];
  const input3 = value[InputId.Input3];
  if (
    !isPrimaryInputState(input1) ||
    !isPrimaryInputState(input2) ||
    !isPrimaryInputState(input3)
  ) {
    return null;
  }

  return {
    [InputId.Input1]: input1,
    [InputId.Input2]: input2,
    [InputId.Input3]: input3,
  };
}

function parseAuxiliaryQuantitiesByInput(
  value: unknown,
  activeModifiersByInput: ActiveModifiersByInputState,
): ShareAuxiliaryQuantitiesByInputState | null {
  if (!isRecord(value) || !hasExactKeys(value, inputOrder)) return null;
  const parsed = {} as ShareAuxiliaryQuantitiesByInputState;

  for (const inputId of inputOrder) {
    const auxiliary = parseSparseModifierQuantities(value[inputId]);
    if (!auxiliary) return null;
    parsed[inputId] = auxiliary;

    for (const modifierId of modifierOrder) {
      if (!activeModifiersByInput[inputId][modifierId]) continue;
      const definition = inputModifierCatalogue[modifierId];
      const modifierInputs = collectModifierInputsForModifier(
        auxiliary,
        modifierId,
      );
      if (!isModifierConfigurationComplete(definition, modifierInputs)) {
        return null;
      }
    }
  }

  return parsed;
}

function isRegisteredModelId(value: string): value is ModelIdType {
  return comfortModelValues.has(value as ModelIdType);
}

function parseModelInputsForModel(
  modelId: ModelIdType,
  value: unknown,
): Partial<Record<PhysicalQuantityIdType, number>> | null {
  if (!isRecord(value)) {
    return null;
  }

  const allowedQuantityIds = new Set(extraQuantityIdsForModel(modelId));
  const parsedInputs: Partial<Record<PhysicalQuantityIdType, number>> = {};
  for (const [rawKey, fieldValue] of Object.entries(value)) {
    if (!isPhysicalQuantityId(rawKey) || !allowedQuantityIds.has(rawKey)) {
      return null;
    }
    if (!isModifierFieldValueValid(rawKey, fieldValue)) {
      return null;
    }
    parsedInputs[rawKey] = fieldValue;
  }
  return parsedInputs;
}

function parseModelInputsByModel(
  value: unknown,
): ShareModelInputsByModelState | null {
  if (!isRecord(value)) {
    return null;
  }

  const parsed = {} as ShareModelInputsByModelState;
  for (const [rawKey, modelInputs] of Object.entries(value)) {
    if (!isRegisteredModelId(rawKey)) {
      return null;
    }
    const parsedInputs = parseModelInputsForModel(rawKey, modelInputs);
    if (!parsedInputs) {
      return null;
    }
    parsed[rawKey] = parsedInputs;
  }

  for (const modelId of comfortModelOrder) {
    if (!(modelId in parsed)) {
      parsed[modelId] = {};
    }
  }

  return parsed;
}

function parseActiveModifiersByInput(
  value: unknown,
): ActiveModifiersByInputState | null {
  if (!isRecord(value) || !hasExactKeys(value, inputOrder)) return null;
  const parsed = {} as ActiveModifiersByInputState;

  for (const inputId of inputOrder) {
    const activeByModifier = value[inputId];
    if (
      !isRecord(activeByModifier) ||
      !hasExactKeys(activeByModifier, modifierOrder)
    ) {
      return null;
    }
    parsed[inputId] = {} as Record<ModifierIdType, boolean>;
    for (const modifierId of modifierOrder) {
      const enabled = activeByModifier[modifierId];
      if (typeof enabled !== "boolean") return null;
      parsed[inputId][modifierId] = enabled;
    }
  }

  return parsed;
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
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["min", "max", "label", "color"]) ||
      typeof candidate.label !== "string" ||
      typeof candidate.color !== "string"
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

function parseOutputSettings(
  value: unknown,
  modelId: ModelIdType,
): ShareModelOutputSettings | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "xAxis",
      "yAxis",
      "baselineInputId",
      "exploreOutput",
      "exploreBands",
    ]) ||
    typeof value.xAxis !== "string" ||
    typeof value.yAxis !== "string" ||
    !inputIdValues.has(value.baselineInputId as InputIdType)
  ) {
    return null;
  }

  const config = getComfortModelConfig(modelId);
  const xAxis = value.xAxis as ChartAxisQuantityId;
  const yAxis = value.yAxis as ChartAxisQuantityId;
  if (!isDynamicAxisPairValid(config, { xAxis, yAxis })) {
    return null;
  }

  let exploreOutput: ShareModelOutputSettings["exploreOutput"] = null;
  let exploreBands: ShareModelOutputSettings["exploreBands"] = null;
  if (config.exploreOutputs.length > 0) {
    if (typeof value.exploreOutput !== "string") {
      return null;
    }
    if (!config.exploreOutputs.some(({ key }) => key === value.exploreOutput)) {
      return null;
    }
    const bands = parseNumericBands(value.exploreBands);
    if (!bands) {
      return null;
    }
    exploreOutput = value.exploreOutput as PhysicalQuantityId;
    exploreBands = bands;
  } else if (value.exploreOutput !== null || value.exploreBands !== null) {
    return null;
  }

  return {
    xAxis,
    yAxis,
    baselineInputId: value.baselineInputId as InputIdType,
    exploreOutput,
    exploreBands,
  };
}

function parseModelSnapshot(
  modelId: ModelIdType,
  value: unknown,
): ShareModelSnapshot | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "selectedChartInstanceId",
      "options",
      "outputSettings",
    ]) ||
    typeof value.selectedChartInstanceId !== "string"
  ) {
    return null;
  }

  const config = getComfortModelConfig(modelId);
  const chartInstance = config.chartInstances.entries.find(
    ({ instanceId }) => instanceId === value.selectedChartInstanceId,
  );
  if (!chartInstance) {
    return null;
  }
  const options = config.parseOptions(value.options);
  const outputSettings = parseOutputSettings(value.outputSettings, modelId);
  if (!options || !outputSettings) {
    return null;
  }
  if (outputSettings.exploreOutput && chartInstance.instanceId) {
    const registration = config.chartEngineRegistrations.find(
      ({ instanceId }) => instanceId === chartInstance.instanceId,
    );
    if (
      registration?.supportedExploreOutputs &&
      !registration.supportedExploreOutputs.includes(
        outputSettings.exploreOutput,
      )
    ) {
      return null;
    }
  }
  return {
    selectedChartInstanceId: value.selectedChartInstanceId,
    options,
    outputSettings,
  };
}

function parseModelSnapshots(
  value: unknown,
): ShareStateSnapshot["models"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const parsed = {} as ShareStateSnapshot["models"];
  for (const [rawKey, modelSnapshot] of Object.entries(value)) {
    if (!isRegisteredModelId(rawKey)) {
      return null;
    }
    const parsedSnapshot = parseModelSnapshot(rawKey, modelSnapshot);
    if (!parsedSnapshot) {
      return null;
    }
    parsed[rawKey] = parsedSnapshot;
  }

  for (const modelId of comfortModelOrder) {
    if (!(modelId in parsed)) {
      parsed[modelId] = createDefaultModelSnapshot(modelId);
    }
  }
  return parsed;
}

function optionRecordsEqual(
  left: Partial<Record<OptionKeyType, string>>,
  right: Partial<Record<OptionKeyType, string>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => left[key as OptionKeyType] === right[key as OptionKeyType],
    )
  );
}

function exploreBandsEqual(
  left: NumericBand[] | null,
  right: NumericBand[] | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.length === right.length &&
    left.every((band, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        band.min === other.min &&
        band.max === other.max &&
        band.label === other.label &&
        band.color === other.color
      );
    })
  );
}

function modelSnapshotsEqual(
  left: ShareModelSnapshot,
  right: ShareModelSnapshot,
): boolean {
  return (
    left.selectedChartInstanceId === right.selectedChartInstanceId &&
    optionRecordsEqual(left.options, right.options) &&
    left.outputSettings.xAxis === right.outputSettings.xAxis &&
    left.outputSettings.yAxis === right.outputSettings.yAxis &&
    left.outputSettings.baselineInputId ===
      right.outputSettings.baselineInputId &&
    left.outputSettings.exploreOutput === right.outputSettings.exploreOutput &&
    exploreBandsEqual(
      left.outputSettings.exploreBands,
      right.outputSettings.exploreBands,
    )
  );
}

function toSparseShareWire(snapshot: ShareStateSnapshot): ShareStateSnapshot {
  const models = {} as ShareStateSnapshot["models"];
  for (const modelId of comfortModelOrder) {
    const modelSnapshot = snapshot.models[modelId];
    if (
      !modelSnapshotsEqual(modelSnapshot, createDefaultModelSnapshot(modelId))
    ) {
      models[modelId] = modelSnapshot;
    }
  }

  const modelInputsByModel = {} as ShareModelInputsByModelState;
  for (const modelId of comfortModelOrder) {
    const modelInputs = snapshot.modelInputsByModel[modelId];
    if (Object.keys(modelInputs).length > 0) {
      modelInputsByModel[modelId] = modelInputs;
    }
  }

  return {
    ...snapshot,
    models,
    modelInputsByModel,
  };
}

export function serializeShareState(snapshot: ShareStateSnapshot): string {
  const json = JSON.stringify(
    toSparseShareWire(snapshot),
    (_key, value: unknown) => {
      if (value === Infinity) return POSITIVE_INFINITY_WIRE;
      if (value === -Infinity) return NEGATIVE_INFINITY_WIRE;
      return value;
    },
  );
  return encodeBase64Url(json);
}

export function parseShareStateSnapshot(
  value: unknown,
): ShareStateSnapshot | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "selectedModel",
      "models",
      "compareEnabled",
      "compareInputIds",
      "activeInputId",
      "unitSystem",
      "quantitiesByInput",
      "auxiliaryQuantitiesByInput",
      "modelInputsByModel",
      "activeModifiersByInput",
    ]) ||
    value.version !== SHARE_STATE_VERSION ||
    !comfortModelValues.has(value.selectedModel as ModelIdType) ||
    typeof value.compareEnabled !== "boolean" ||
    !isCanonicalCompareInputIds(value.compareInputIds) ||
    !inputIdValues.has(value.activeInputId as InputIdType) ||
    !unitSystemValues.has(value.unitSystem as UnitSystemType)
  ) {
    return null;
  }

  const activeInputId = value.activeInputId as InputIdType;
  if (
    (value.compareEnabled && !value.compareInputIds.includes(activeInputId)) ||
    (!value.compareEnabled && activeInputId !== InputId.Input1)
  ) {
    return null;
  }

  const models = parseModelSnapshots(value.models);
  const quantitiesByInput = parseQuantitiesByInput(value.quantitiesByInput);
  const activeModifiersByInput = parseActiveModifiersByInput(
    value.activeModifiersByInput,
  );
  const auxiliaryQuantitiesByInput = activeModifiersByInput
    ? parseAuxiliaryQuantitiesByInput(
        value.auxiliaryQuantitiesByInput,
        activeModifiersByInput,
      )
    : null;
  const modelInputsByModel = parseModelInputsByModel(value.modelInputsByModel);
  if (
    !models ||
    !quantitiesByInput ||
    !activeModifiersByInput ||
    !auxiliaryQuantitiesByInput ||
    !modelInputsByModel
  ) {
    return null;
  }

  return {
    version: SHARE_STATE_VERSION,
    selectedModel: value.selectedModel as ModelIdType,
    models,
    compareEnabled: value.compareEnabled,
    compareInputIds: [...value.compareInputIds],
    activeInputId,
    unitSystem: value.unitSystem as UnitSystemType,
    quantitiesByInput,
    auxiliaryQuantitiesByInput,
    modelInputsByModel,
    activeModifiersByInput,
  };
}

export function deserializeShareState(
  encodedSnapshot: string,
): ShareStateSnapshot | null {
  try {
    return parseShareStateSnapshot(
      JSON.parse(decodeBase64Url(encodedSnapshot)),
    );
  } catch {
    return null;
  }
}
