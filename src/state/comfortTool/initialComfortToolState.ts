import {
  InputId,
  inputDefaultsById,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import { WorkspaceId } from "../../models/workspaces";
import { createDefaultPrimaryInputState } from "../../models/physicalQuantities";
import { comfortModelConfigs, comfortModelOrder } from "./modelConfigs";
import {
  seedModelOutputSettings,
} from "./fieldChartState";
import {
  createAuxiliaryQuantitiesByInput,
  createModelInputsByModel,
  type QuantitiesByInputState,
} from "../../services/comfort/quantityStateRouting";
import type {
  OutputSettingsByModelState,
  InputState,
  ModelCalculationCache,
  ModelCalculationCacheByModelState,
  ModelOptionsByModelState,
  SelectedChartInstanceByModelState,
} from "./types";

export function createInputState(inputId: InputIdType): InputState {
  return {
    ...createDefaultPrimaryInputState(),
    ...inputDefaultsById[inputId],
  };
}

export function createQuantitiesByInput(): QuantitiesByInputState {
  return {
    [InputId.Input1]: createInputState(InputId.Input1),
    [InputId.Input2]: createInputState(InputId.Input2),
    [InputId.Input3]: createInputState(InputId.Input3),
  };
}

export { createAuxiliaryQuantitiesByInput, createModelInputsByModel };

export function createDefaultCompareInputIds(): InputIdType[] {
  return [InputId.Input1, InputId.Input2];
}

export function createSelectedChartInstanceByModel(): SelectedChartInstanceByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = comfortModelConfigs[modelId].chartInstances.defaultInstanceId;
    return accumulator;
  }, {} as SelectedChartInstanceByModelState);
}

export function createModelOptionsByModel(): ModelOptionsByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = { ...comfortModelConfigs[modelId].defaultOptions };
    return accumulator;
  }, {} as ModelOptionsByModelState);
}

export function createOutputSettingsByModel(): OutputSettingsByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = seedModelOutputSettings(comfortModelConfigs[modelId]);
    return accumulator;
  }, {} as OutputSettingsByModelState);
}

function createEmptyInputResultRecord<T>(): Record<InputIdType, T | null> {
  return {
    [InputId.Input1]: null,
    [InputId.Input2]: null,
    [InputId.Input3]: null,
  };
}

export function createEmptyCalculationCache<
  ResultType,
  ChartSourceType,
>(): ModelCalculationCache<ResultType, ChartSourceType> {
  return {
    status: "empty",
    buildGeneration: 0,
    lastVisibleInputIds: [InputId.Input1],
    resultsByInput: createEmptyInputResultRecord(),
    chartSource: null,
  };
}

export function createCalculationCacheByModel(): ModelCalculationCacheByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = createEmptyCalculationCache<unknown, unknown>();
    return accumulator;
  }, {} as ModelCalculationCacheByModelState);
}

export const defaultActiveWorkspace = WorkspaceId.Standard;
