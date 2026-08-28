/** Session ↔ share DTO. Snapshot encodes input+setting only. */
import type { ModelId as ModelIdType } from "../../../catalog/modelIds";
import {
  PhysicalQuantityId,
  physicalQuantityMetaById,
  primaryInputOrder,
  type AuxiliaryInputState,
  type ChartAxisQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PrimaryInputState,
} from "../../../catalog/quantities";
import type { OptionKey as OptionKeyType } from "../../../catalog/inputModes";
import {
  modifierOrder,
  type ModifierId as ModifierIdType,
} from "../../../catalog/inputModifiers";
import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../../catalog/inputSlots";
import { type NumericBand } from "../../../catalog/modelCapabilities";
import { type UnitSystem as UnitSystemType } from "../../../catalog/units";
import { syncDerivedStateIntoAuxiliary } from "../../../engines/comfort/syncState";
import { seedModelOutputSettings } from "../fieldChartState";
import { comfortModelOrder, getComfortModelConfig } from "../../modelRegistry";
import {
  setModelQuantity,
  setSlotQuantity,
} from "../../../engines/comfort/quantityStateRouting";
import { createDefaultModelInputsForModel } from "../initialPointSessionState";
import type {
  ActiveModifiersByInputState,
  PointSessionBuckets,
  ModelOutputSettings,
} from "../sessionTypes";

export type ShareAuxiliaryQuantitiesByInputState = Record<
  InputIdType,
  Partial<Record<PhysicalQuantityIdType, number>>
>;
export type ShareModelInputsByModelState = Record<
  ModelIdType,
  Partial<Record<PhysicalQuantityIdType, number>>
>;

export const modifierQuantityIds = Object.values(physicalQuantityMetaById)
  .filter((meta) => meta.modifierId !== undefined)
  .map((meta) => meta.id);

export function extraQuantityIdsForModel(
  modelId: ModelIdType,
): PhysicalQuantityIdType[] {
  return [...getComfortModelConfig(modelId).extraQuantities];
}

export interface ShareModelOutputSettings {
  xAxis: ChartAxisQuantityId;
  yAxis: ChartAxisQuantityId;
  baselineInputId: InputIdType;
  exploreOutput: PhysicalQuantityId | null;
  exploreBands: NumericBand[] | null;
}

export interface ShareStateSnapshot {
  version: 1;
  selectedModel: ModelIdType;
  models: Record<
    ModelIdType,
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

export type ShareModelSnapshot = ShareStateSnapshot["models"][ModelIdType];

export function cloneOutputSettings(
  settings: ModelOutputSettings,
): ShareModelOutputSettings {
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

export function createDefaultModelSnapshot(
  modelId: ModelIdType,
): ShareModelSnapshot {
  const config = getComfortModelConfig(modelId);
  return {
    selectedChartInstanceId: config.chartInstances.defaultInstanceId,
    options: { ...config.defaultOptions },
    outputSettings: cloneOutputSettings(seedModelOutputSettings(config)),
  };
}

function serializeAuxiliaryForWire(
  auxiliary: AuxiliaryInputState,
): Partial<Record<PhysicalQuantityIdType, number>> {
  return modifierQuantityIds.reduce(
    (wire, quantityId) => {
      const value = auxiliary[quantityId];
      if (value !== undefined) {
        wire[quantityId] = value;
      }
      return wire;
    },
    {} as Partial<Record<PhysicalQuantityIdType, number>>,
  );
}

function serializeModelInputsForWire(
  modelId: ModelIdType,
  modelInputs: Partial<Record<PhysicalQuantityIdType, number>>,
): Partial<Record<PhysicalQuantityIdType, number>> {
  const defaults = createDefaultModelInputsForModel(modelId);
  return extraQuantityIdsForModel(modelId).reduce(
    (wire, quantityId) => {
      const value = modelInputs[quantityId];
      if (value !== undefined && value !== defaults[quantityId]) {
        wire[quantityId] = value;
      }
      return wire;
    },
    {} as Partial<Record<PhysicalQuantityIdType, number>>,
  );
}

export function createShareStateSnapshot(
  session: Pick<PointSessionBuckets, "input" | "setting">,
): ShareStateSnapshot {
  return {
    version: 1,
    selectedModel: session.setting.selectedModel,
    models: comfortModelOrder.reduce(
      (accumulator, modelId) => {
        accumulator[modelId] = {
          selectedChartInstanceId:
            session.setting.selectedChartInstanceByModel[modelId],
          options: { ...session.setting.modelOptionsByModel[modelId] },
          outputSettings: cloneOutputSettings(
            session.setting.outputSettingsByModel[modelId],
          ),
        };
        return accumulator;
      },
      {} as ShareStateSnapshot["models"],
    ),
    compareEnabled: session.setting.compareEnabled,
    compareInputIds: [...session.setting.compareInputIds],
    activeInputId: session.setting.activeInputId,
    unitSystem: session.setting.unitSystem,
    quantitiesByInput: {
      [InputId.Input1]: { ...session.input.quantitiesByInput[InputId.Input1] },
      [InputId.Input2]: { ...session.input.quantitiesByInput[InputId.Input2] },
      [InputId.Input3]: { ...session.input.quantitiesByInput[InputId.Input3] },
    },
    auxiliaryQuantitiesByInput: inputOrder.reduce((byInput, inputId) => {
      byInput[inputId] = serializeAuxiliaryForWire(
        session.input.auxiliaryQuantitiesByInput[inputId],
      );
      return byInput;
    }, {} as ShareAuxiliaryQuantitiesByInputState),
    modelInputsByModel: comfortModelOrder.reduce((byModel, modelId) => {
      byModel[modelId] = serializeModelInputsForWire(
        modelId,
        session.input.modelInputsByModel[modelId],
      );
      return byModel;
    }, {} as ShareModelInputsByModelState),
    activeModifiersByInput: inputOrder.reduce((byInput, inputId) => {
      byInput[inputId] = modifierOrder.reduce(
        (byModifier, modifierId) => {
          byModifier[modifierId] =
            session.input.activeModifiersByInput[inputId][modifierId];
          return byModifier;
        },
        {} as Record<ModifierIdType, boolean>,
      );
      return byInput;
    }, {} as ActiveModifiersByInputState),
  };
}

export function applyShareSnapshotToState(
  session: Pick<PointSessionBuckets, "input" | "setting">,
  snapshot: ShareStateSnapshot,
) {
  session.setting.selectedModel = snapshot.selectedModel;
  for (const modelId of comfortModelOrder) {
    const modelSnapshot =
      snapshot.models[modelId] ?? createDefaultModelSnapshot(modelId);
    session.setting.selectedChartInstanceByModel[modelId] =
      modelSnapshot.selectedChartInstanceId;
    session.setting.modelOptionsByModel[modelId] = { ...modelSnapshot.options };
    session.setting.outputSettingsByModel[modelId] = cloneOutputSettings(
      modelSnapshot.outputSettings,
    );
    session.input.modelInputsByModel[modelId] = {
      ...createDefaultModelInputsForModel(modelId),
    };
    const sharedModelInputs = snapshot.modelInputsByModel[modelId] ?? {};
    for (const [quantityId, value] of Object.entries(sharedModelInputs)) {
      setModelQuantity(
        session.input.modelInputsByModel[modelId],
        quantityId as PhysicalQuantityIdType,
        value,
      );
    }
  }
  session.setting.compareEnabled = snapshot.compareEnabled;
  session.setting.compareInputIds = [...snapshot.compareInputIds];
  session.setting.activeInputId = snapshot.activeInputId;
  session.setting.unitSystem = snapshot.unitSystem;

  for (const inputId of inputOrder) {
    for (const quantityId of primaryInputOrder) {
      session.input.quantitiesByInput[inputId][quantityId] =
        snapshot.quantitiesByInput[inputId][quantityId];
    }
    for (const quantityId of modifierQuantityIds) {
      setSlotQuantity(
        session.input.auxiliaryQuantitiesByInput[inputId],
        quantityId,
        undefined,
      );
    }
    for (const [quantityId, value] of Object.entries(
      snapshot.auxiliaryQuantitiesByInput[inputId],
    )) {
      setSlotQuantity(
        session.input.auxiliaryQuantitiesByInput[inputId],
        quantityId as PhysicalQuantityIdType,
        value,
      );
    }
    for (const modifierId of modifierOrder) {
      session.input.activeModifiersByInput[inputId][modifierId] =
        snapshot.activeModifiersByInput[inputId][modifierId];
    }
  }
  syncDerivedStateIntoAuxiliary(
    session.input.quantitiesByInput,
    session.input.auxiliaryQuantitiesByInput,
  );
}
