import {
  InputId,
  inputDefaultsById,
  type InputId as InputIdType,
} from "../../catalog/inputSlots";
import { SurfaceId } from "../../catalog/surfaces";
import { ModelId } from "../../catalog/modelIds";
import { UnitSystem } from "../../catalog/units";
import { comfortModelConfigs, comfortModelOrder } from "../modelRegistry";
import {
  seedModelOutputSettings,
} from "./fieldChartState";
import { createActiveModifiersByInput } from "./modifierState";
import {
  type QuantitiesByInputState,
} from "../../engines/comfort/quantityStateRouting";
import { syncDerivedState } from "../../engines/comfort/syncState";
import type {
  PointChartState,
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
    ...inputDefaultsById[inputId],
  };
}

export function createQuantitiesByInput(): QuantitiesByInputState {
  const quantitiesByInput = {
    [InputId.Input1]: createInputState(InputId.Input1),
    [InputId.Input2]: createInputState(InputId.Input2),
    [InputId.Input3]: createInputState(InputId.Input3),
  };
  syncDerivedState(quantitiesByInput);
  return quantitiesByInput;
}

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
  ChartSourceType = unknown,
>(): ModelCalculationCache<ChartSourceType> {
  return {
    status: "empty",
    buildGeneration: 0,
    lastVisibleInputIds: [InputId.Input1],
    valuesByInput: createEmptyInputResultRecord(),
    chartSource: null,
  };
}

export function createCalculationCacheByModel(): ModelCalculationCacheByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = createEmptyCalculationCache();
    return accumulator;
  }, {} as ModelCalculationCacheByModelState);
}

export const defaultActiveSurface = SurfaceId.Standard;

export function createPointInputState(): PointInputState {
  return {
    quantitiesByInput: createQuantitiesByInput(),
    modelOptionsByModel: createModelOptionsByModel(),
    activeModifiersByInput: createActiveModifiersByInput(),
    compareEnabled: false,
    compareInputIds: createDefaultCompareInputIds(),
    activeInputId: InputId.Input1,
    unitSystem: UnitSystem.SI,
  };
}

export function createPointChartState(): PointChartState {
  return {
    selectedChartInstanceByModel: createSelectedChartInstanceByModel(),
    outputSettingsByModel: createOutputSettingsByModel(),
  };
}

export function createPointSettingState(): PointSettingState {
  return {
    selectedModel: ModelId.PmvAshrae,
    activeSurface: defaultActiveSurface,
    allowedModelIds: [],
    pendingModelSwitch: null,
  };
}

export function createPointOutputState(): PointOutputState {
  return {
    isLoading: false,
    errorMessage: "",
  };
}
