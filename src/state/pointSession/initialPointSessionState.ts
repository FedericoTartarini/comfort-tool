import {
  InputId,
  inputDefaultsById,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";
import { SurfaceId } from "../../catalog/surfaces";
import { ModelId } from "../../catalog/modelIds";
import { UnitSystem } from "../../catalog/units";
import { createDefaultExtraInputs, createDefaultPrimaryInputState } from "../../catalog/quantities";
import { comfortModelConfigs, comfortModelOrder, getComfortModelConfig } from "../modelRegistry";
import {
  seedModelOutputSettings,
} from "./fieldChartState";
import { createActiveModifiersByInput } from "./modifierState";
import {
  createAuxiliaryQuantitiesByInput,
  type ModelInputsByModelState,
  type QuantitiesByInputState,
} from "../../engines/comfort/quantityStateRouting";
import type {
  PointInputState,
  PointOutputState,
  PointSettingState,
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

export function createDefaultModelInputsForModel(
  modelId: (typeof comfortModelOrder)[number],
) {
  return createDefaultExtraInputs(getComfortModelConfig(modelId).extraQuantities);
}

export function createModelInputsByModel(): ModelInputsByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = createDefaultModelInputsForModel(modelId);
    return accumulator;
  }, {} as ModelInputsByModelState);
}

export { createAuxiliaryQuantitiesByInput };

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

export const defaultActiveSurface = SurfaceId.Standard;

export function createPointInputState(): PointInputState {
  return {
    quantitiesByInput: createQuantitiesByInput(),
    auxiliaryQuantitiesByInput: createAuxiliaryQuantitiesByInput(),
    modelInputsByModel: createModelInputsByModel(),
    activeModifiersByInput: createActiveModifiersByInput(),
  };
}

export function createPointSettingState(): PointSettingState {
  return {
    selectedModel: ModelId.PmvAshrae,
    selectedChartInstanceByModel: createSelectedChartInstanceByModel(),
    modelOptionsByModel: createModelOptionsByModel(),
    compareEnabled: false,
    compareInputIds: createDefaultCompareInputIds(),
    activeInputId: InputId.Input1,
    unitSystem: UnitSystem.SI,
    activeSurface: defaultActiveSurface,
    allowedModelIds: [],
    outputSettingsByModel: createOutputSettingsByModel(),
    pendingModelSwitch: null,
  };
}

export function createPointOutputState(): PointOutputState {
  return {
    isLoading: false,
    errorMessage: "",
  };
}
