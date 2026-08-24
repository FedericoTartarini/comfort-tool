/** Strict current-schema version-1 share snapshots. */
import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
import type { OptionKey as OptionKeyType } from "../../models/inputModes";
import {
  inputModifierCatalogue,
  modifierOrder,
  type ModifierId as ModifierIdType,
} from "../../models/inputModifiers";
import { InputId, inputOrder, type InputId as InputIdType } from "../../models/inputSlots";
import {
  type ModelOutputKey,
  type NumericBand,
} from "../../models/modelCapabilities";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { validateNumericBands } from "../../services/comfort/charts/bands";
import { isFiniteNumber } from "../../services/comfort/helpers";
import {
  isModifierConfigurationComplete,
  isModifierFieldValueValid,
} from "../../services/comfort/inputModifiers";
import { syncDerivedStateIntoAuxiliary } from "../../services/comfort/syncState";
import { isDynamicAxisPairValid } from "./dynamicAxes";
import { comfortModelOrder, getComfortModelConfig } from "./modelConfigs";
import {
  collectModifierInputsForModifier,
  createDefaultModelInputsForModel,
  setModelQuantity,
  setSlotQuantity,
} from "../../services/comfort/quantityStateRouting";
import {
  QuantityState,
  isPhysicalQuantityId,
  physicalQuantityMetaById,
  primaryInputOrder,
  type AuxiliaryInputState,
  type ChartAxisQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PrimaryInputState,
} from "../../models/physicalQuantities";
import type {
  ActiveModifiersByInputState,
  ComfortToolStateSlice,
  ModelOutputSettings,
} from "./types";
type ShareAuxiliaryQuantitiesByInputState = Record<
  InputIdType,
  Partial<Record<PhysicalQuantityIdType, number>>
>;
type ShareModelInputsByModelState = Record<
  ComfortModelType,
  Partial<Record<PhysicalQuantityIdType, number>>
>;

const modifierQuantityIds = Object.values(physicalQuantityMetaById)
  .filter((meta) => meta.modifierId !== undefined)
  .map((meta) => meta.id);

function modelQuantityIdsForModel(modelId: ComfortModelType): PhysicalQuantityIdType[] {
  return Object.values(physicalQuantityMetaById)
    .filter((meta) => meta.ownerModelId === modelId && meta.state === QuantityState.Model)
    .map((meta) => meta.id);
}

interface ShareModelOutputSettings {
  xAxis: ChartAxisQuantityId;
  yAxis: ChartAxisQuantityId;
  baselineInputId: InputIdType;
  exploreOutput: ModelOutputKey | null;
  exploreBands: NumericBand[] | null;
}

export interface ShareStateSnapshot {
  version: 1;
  selectedModel: ComfortModelType;
  models: Record<
    ComfortModelType,
    {
      selectedChartInstanceId: string;
      options: Partial<Record<OptionKeyType, string>>;
      outputSettings: ShareModelOutputSettings;
    }
  >;
  compareEnabled: boolean;
  compareInputIds: InputIdType[];
  activeInputId: InputIdType;
  unitSystem: UnitSystemType;
  quantitiesByInput: Record<InputIdType, PrimaryInputState>;
  auxiliaryQuantitiesByInput: ShareAuxiliaryQuantitiesByInputState;
  modelInputsByModel: ShareModelInputsByModelState;
  activeModifiersByInput: ActiveModifiersByInputState;
}

export const SHARE_STATE_VERSION = 1;
const SHARE_STATE_PARAM = "state";
const POSITIVE_INFINITY_WIRE = "__comfort_tool_positive_infinity__";
const NEGATIVE_INFINITY_WIRE = "__comfort_tool_negative_infinity__";
const comfortModelValues = new Set<ComfortModelType>(comfortModelOrder);
const inputIdValues = new Set<InputIdType>(Object.values(InputId));
const unitSystemValues = new Set<UnitSystemType>(Object.values(UnitSystem));
const modifierQuantityIdSet = new Set<PhysicalQuantityIdType>(modifierQuantityIds);

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  const expectedKeys = new Set(keys);
  return actualKeys.length === keys.length
    && actualKeys.every((key) => expectedKeys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimaryInputState(value: unknown): value is PrimaryInputState {
  return isRecord(value)
    && hasExactKeys(value, primaryInputOrder)
    && primaryInputOrder.every((quantityId) => isFiniteNumber(value[quantityId]));
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
    !isPrimaryInputState(input1)
    || !isPrimaryInputState(input2)
    || !isPrimaryInputState(input3)
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
      const modifierInputs = collectModifierInputsForModifier(auxiliary, modifierId);
      if (!isModifierConfigurationComplete(definition, modifierInputs)) {
        return null;
      }
    }
  }

  return parsed;
}

function parseModelInputsByModel(value: unknown): ShareModelInputsByModelState | null {
  if (!isRecord(value) || !hasExactKeys(value, comfortModelOrder)) {
    return null;
  }

  const parsed = {} as ShareModelInputsByModelState;
  for (const modelId of comfortModelOrder) {
    const modelInputs = value[modelId];
    if (!isRecord(modelInputs)) {
      return null;
    }

    const allowedQuantityIds = new Set(modelQuantityIdsForModel(modelId));
    const parsedInputs: Partial<Record<PhysicalQuantityIdType, number>> = {};
    for (const [rawKey, fieldValue] of Object.entries(modelInputs)) {
      if (!isPhysicalQuantityId(rawKey) || !allowedQuantityIds.has(rawKey)) {
        return null;
      }
      if (!isModifierFieldValueValid(rawKey, fieldValue)) {
        return null;
      }
      parsedInputs[rawKey] = fieldValue;
    }
    parsed[modelId] = parsedInputs;
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
    if (!isRecord(activeByModifier) || !hasExactKeys(activeByModifier, modifierOrder)) {
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

function parseOutputSettings(
  value: unknown,
  modelId: ComfortModelType,
): ShareModelOutputSettings | null {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["xAxis", "yAxis", "baselineInputId", "exploreOutput", "exploreBands"])
    || typeof value.xAxis !== "string"
    || typeof value.yAxis !== "string"
    || !inputIdValues.has(value.baselineInputId as InputIdType)
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
    exploreOutput = value.exploreOutput as ModelOutputKey;
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
      || !hasExactKeys(modelSnapshot, ["selectedChartInstanceId", "options", "outputSettings"])
      || typeof modelSnapshot.selectedChartInstanceId !== "string"
    ) {
      return null;
    }

    const config = getComfortModelConfig(modelId);
    const chartInstance = config.outputCharts.entries.find(
      ({ instanceId }) => instanceId === modelSnapshot.selectedChartInstanceId,
    );
    if (!chartInstance) {
      return null;
    }
    const options = config.parseOptions(modelSnapshot.options);
    const outputSettings = parseOutputSettings(modelSnapshot.outputSettings, modelId);
    if (!options || !outputSettings) {
      return null;
    }
    if (
      outputSettings.exploreOutput
      && chartInstance.instanceId
    ) {
      const registration = config.chartKindRegistrations.find(
        ({ instanceId }) => instanceId === chartInstance.instanceId,
      );
      if (
        registration?.supportedExploreOutputs
        && !registration.supportedExploreOutputs.includes(outputSettings.exploreOutput)
      ) {
        return null;
      }
    }
    parsed[modelId] = {
      selectedChartInstanceId: modelSnapshot.selectedChartInstanceId,
      options,
      outputSettings,
    };
  }
  return parsed;
}

function serializeAuxiliaryForWire(
  auxiliary: AuxiliaryInputState,
): Partial<Record<PhysicalQuantityIdType, number>> {
  return modifierQuantityIds.reduce((wire, quantityId) => {
    const value = auxiliary[quantityId];
    if (value !== undefined) {
      wire[quantityId] = value;
    }
    return wire;
  }, {} as Partial<Record<PhysicalQuantityIdType, number>>);
}

function serializeModelInputsForWire(
  modelId: ComfortModelType,
  modelInputs: Partial<Record<PhysicalQuantityIdType, number>>,
): Partial<Record<PhysicalQuantityIdType, number>> {
  const defaults = createDefaultModelInputsForModel(modelId);
  return modelQuantityIdsForModel(modelId).reduce((wire, quantityId) => {
    const value = modelInputs[quantityId];
    if (value !== undefined && value !== defaults[quantityId]) {
      wire[quantityId] = value;
    }
    return wire;
  }, {} as Partial<Record<PhysicalQuantityIdType, number>>);
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
      "quantitiesByInput",
      "auxiliaryQuantitiesByInput",
      "modelInputsByModel",
      "activeModifiersByInput",
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
    !models
    || !quantitiesByInput
    || !activeModifiersByInput
    || !auxiliaryQuantitiesByInput
    || !modelInputsByModel
  ) {
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
    quantitiesByInput,
    auxiliaryQuantitiesByInput,
    modelInputsByModel,
    activeModifiersByInput,
  };
}

export function deserializeShareState(encodedSnapshot: string): ShareStateSnapshot | null {
  try {
    return parseShareStateSnapshot(JSON.parse(decodeBase64Url(encodedSnapshot)));
  } catch {
    return null;
  }
}

function cloneOutputSettings(settings: ModelOutputSettings): ShareModelOutputSettings {
  return {
    xAxis: settings.xAxis,
    yAxis: settings.yAxis,
    baselineInputId: settings.baselineInputId,
    exploreOutput: settings.exploreOutput,
    exploreBands: settings.exploreBands
      ? settings.exploreBands.map((band) => ({ ...band }))
      : null,
  };
}

export function createShareStateSnapshot(state: ComfortToolStateSlice): ShareStateSnapshot {
  return {
    version: SHARE_STATE_VERSION,
    selectedModel: state.ui.selectedModel,
    models: comfortModelOrder.reduce((accumulator, modelId) => {
      accumulator[modelId] = {
        selectedChartInstanceId: state.ui.selectedChartInstanceByModel[modelId],
        options: { ...state.ui.modelOptionsByModel[modelId] },
        outputSettings: cloneOutputSettings(state.ui.outputSettingsByModel[modelId]),
      };
      return accumulator;
    }, {} as ShareStateSnapshot["models"]),
    compareEnabled: state.ui.compareEnabled,
    compareInputIds: [...state.ui.compareInputIds],
    activeInputId: state.ui.activeInputId,
    unitSystem: state.ui.unitSystem,
    quantitiesByInput: {
      [InputId.Input1]: { ...state.quantitiesByInput[InputId.Input1] },
      [InputId.Input2]: { ...state.quantitiesByInput[InputId.Input2] },
      [InputId.Input3]: { ...state.quantitiesByInput[InputId.Input3] },
    },
    auxiliaryQuantitiesByInput: inputOrder.reduce((byInput, inputId) => {
      byInput[inputId] = serializeAuxiliaryForWire(
        state.auxiliaryQuantitiesByInput[inputId],
      );
      return byInput;
    }, {} as ShareAuxiliaryQuantitiesByInputState),
    modelInputsByModel: comfortModelOrder.reduce((byModel, modelId) => {
      byModel[modelId] = serializeModelInputsForWire(
        modelId,
        state.modelInputsByModel[modelId],
      );
      return byModel;
    }, {} as ShareModelInputsByModelState),
    activeModifiersByInput: inputOrder.reduce((byInput, inputId) => {
      byInput[inputId] = modifierOrder.reduce((byModifier, modifierId) => {
        byModifier[modifierId] = state.activeModifiersByInput[inputId][modifierId];
        return byModifier;
      }, {} as Record<ModifierIdType, boolean>);
      return byInput;
    }, {} as ActiveModifiersByInputState),
  };
}

export function applyShareSnapshotToState(
  state: ComfortToolStateSlice,
  snapshot: ShareStateSnapshot,
) {
  state.ui.selectedModel = snapshot.selectedModel;
  for (const modelId of comfortModelOrder) {
    const modelSnapshot = snapshot.models[modelId];
    state.ui.selectedChartInstanceByModel[modelId] = modelSnapshot.selectedChartInstanceId;
    state.ui.modelOptionsByModel[modelId] = { ...modelSnapshot.options };
    state.ui.outputSettingsByModel[modelId] = cloneOutputSettings(
      modelSnapshot.outputSettings,
    );
    state.modelInputsByModel[modelId] = {
      ...createDefaultModelInputsForModel(modelId),
    };
    for (const [quantityId, value] of Object.entries(snapshot.modelInputsByModel[modelId])) {
      setModelQuantity(
        state.modelInputsByModel[modelId],
        quantityId as PhysicalQuantityIdType,
        value,
      );
    }
  }
  state.ui.compareEnabled = snapshot.compareEnabled;
  state.ui.compareInputIds = [...snapshot.compareInputIds];
  state.ui.activeInputId = snapshot.activeInputId;
  state.ui.unitSystem = snapshot.unitSystem;

  for (const inputId of inputOrder) {
    for (const quantityId of primaryInputOrder) {
      state.quantitiesByInput[inputId][quantityId] =
        snapshot.quantitiesByInput[inputId][quantityId];
    }
    for (const quantityId of modifierQuantityIds) {
      setSlotQuantity(
        state.auxiliaryQuantitiesByInput[inputId],
        quantityId,
        undefined,
      );
    }
    for (const [quantityId, value] of Object.entries(
      snapshot.auxiliaryQuantitiesByInput[inputId],
    )) {
      setSlotQuantity(
        state.auxiliaryQuantitiesByInput[inputId],
        quantityId as PhysicalQuantityIdType,
        value,
      );
    }
    for (const modifierId of modifierOrder) {
      state.activeModifiersByInput[inputId][modifierId] =
        snapshot.activeModifiersByInput[inputId][modifierId];
    }
  }
  syncDerivedStateIntoAuxiliary(state.quantitiesByInput, state.auxiliaryQuantitiesByInput);
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
