import { ModelId, type ModelId as ModelIdType } from "../../models/comfortModels";
import {
  inputModifierCatalogue,
  modifierOrder,
  type ModifierId as ModifierIdType,
  type ModifierInputValues,
} from "../../models/inputModifiers";
import { InputId, inputOrder, type InputId as InputIdType } from "../../models/inputSlots";
import { PhysicalQuantityId, QuantityState, derivedQuantityIds, isPhysicalQuantityId, physicalQuantityMetaById, primaryInputOrder, resolveQuantityState, type AuxiliaryInputState, type DerivedSlotQuantityState, type PhysicalQuantityId as PhysicalQuantityIdType, type PrimaryInputState, type PrimaryQuantityId } from "../../models/physicalQuantities";
const comfortModelOrder = Object.values(ModelId) as ModelIdType[];

export type QuantitiesByInputState = Record<InputIdType, PrimaryInputState>;
export type AuxiliaryQuantitiesByInputState = Record<InputIdType, AuxiliaryInputState>;
export type ModelInputsByModelState = Record<
  ModelIdType,
  Partial<Record<PhysicalQuantityIdType, number>>
>;

export function createEmptyAuxiliaryInputState(): AuxiliaryInputState {
  return {};
}

export function createAuxiliaryQuantitiesByInput(): AuxiliaryQuantitiesByInputState {
  return inputOrder.reduce((byInput, inputId) => {
    byInput[inputId] = createEmptyAuxiliaryInputState();
    return byInput;
  }, {} as AuxiliaryQuantitiesByInputState);
}

export function createDefaultModelInputsForModel(
  modelId: ModelIdType,
): Partial<Record<PhysicalQuantityIdType, number>> {
  return Object.values(physicalQuantityMetaById)
    .filter((meta) => meta.ownerModelId === modelId && meta.state === QuantityState.Model)
    .reduce((accumulator, meta) => {
      accumulator[meta.id] = meta.defaultSi;
      return accumulator;
    }, {} as Partial<Record<PhysicalQuantityIdType, number>>);
}

export function createModelInputsByModel(): ModelInputsByModelState {
  return comfortModelOrder.reduce((accumulator, modelId) => {
    accumulator[modelId] = createDefaultModelInputsForModel(modelId);
    return accumulator;
  }, {} as ModelInputsByModelState);
}

export function getPrimaryQuantity(
  primary: PrimaryInputState,
  quantityId: PrimaryQuantityId,
): number {
  return primary[quantityId];
}

export function setPrimaryQuantity(
  primary: PrimaryInputState,
  quantityId: PrimaryQuantityId,
  value: number,
): void {
  primary[quantityId] = value;
}

export function getSlotQuantity(
  auxiliary: AuxiliaryInputState,
  quantityId: PhysicalQuantityIdType,
): number | undefined {
  return auxiliary[quantityId];
}

export function setSlotQuantity(
  auxiliary: AuxiliaryInputState,
  quantityId: PhysicalQuantityIdType,
  value: number | undefined,
): void {
  if (value === undefined) {
    delete auxiliary[quantityId];
    return;
  }
  auxiliary[quantityId] = value;
}

export function getModelQuantity(
  modelInputs: Partial<Record<PhysicalQuantityIdType, number>>,
  quantityId: PhysicalQuantityIdType,
): number | undefined {
  return modelInputs[quantityId];
}

export function setModelQuantity(
  modelInputs: Partial<Record<PhysicalQuantityIdType, number>>,
  quantityId: PhysicalQuantityIdType,
  value: number | undefined,
): void {
  if (value === undefined) {
    delete modelInputs[quantityId];
    return;
  }
  modelInputs[quantityId] = value;
}

export function getDerivedFromAuxiliary(auxiliary: AuxiliaryInputState): DerivedSlotQuantityState {
  return {
    [PhysicalQuantityId.DewPoint]: auxiliary[PhysicalQuantityId.DewPoint]
      ?? physicalQuantityMetaById[PhysicalQuantityId.DewPoint].defaultSi,
    [PhysicalQuantityId.DerivedHumidityRatio]: auxiliary[PhysicalQuantityId.DerivedHumidityRatio]
      ?? physicalQuantityMetaById[PhysicalQuantityId.DerivedHumidityRatio].defaultSi,
    [PhysicalQuantityId.WetBulb]: auxiliary[PhysicalQuantityId.WetBulb]
      ?? physicalQuantityMetaById[PhysicalQuantityId.WetBulb].defaultSi,
    [PhysicalQuantityId.VaporPressure]: auxiliary[PhysicalQuantityId.VaporPressure]
      ?? physicalQuantityMetaById[PhysicalQuantityId.VaporPressure].defaultSi,
  };
}

export function getDerivedByInputFromAuxiliary(
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState,
): Record<InputIdType, DerivedSlotQuantityState> {
  return {
    [InputId.Input1]: getDerivedFromAuxiliary(auxiliaryQuantitiesByInput[InputId.Input1]),
    [InputId.Input2]: getDerivedFromAuxiliary(auxiliaryQuantitiesByInput[InputId.Input2]),
    [InputId.Input3]: getDerivedFromAuxiliary(auxiliaryQuantitiesByInput[InputId.Input3]),
  };
}

export function syncDerivedQuantitiesIntoAuxiliary(
  primary: PrimaryInputState,
  auxiliary: AuxiliaryInputState,
  derived: DerivedSlotQuantityState,
): void {
  auxiliary[PhysicalQuantityId.DewPoint] = derived[PhysicalQuantityId.DewPoint];
  auxiliary[PhysicalQuantityId.DerivedHumidityRatio] = derived[PhysicalQuantityId.DerivedHumidityRatio];
  auxiliary[PhysicalQuantityId.WetBulb] = derived[PhysicalQuantityId.WetBulb];
  auxiliary[PhysicalQuantityId.VaporPressure] = derived[PhysicalQuantityId.VaporPressure];
}

export function syncAllDerivedQuantities(
  quantitiesByInput: QuantitiesByInputState,
  auxiliaryQuantitiesByInput: AuxiliaryQuantitiesByInputState,
  deriveForPrimary: (primary: PrimaryInputState) => DerivedSlotQuantityState,
): void {
  for (const inputId of inputOrder) {
    syncDerivedQuantitiesIntoAuxiliary(
      quantitiesByInput[inputId],
      auxiliaryQuantitiesByInput[inputId],
      deriveForPrimary(quantitiesByInput[inputId]),
    );
  }
}

export function collectModifierInputsForModifier(
  auxiliary: AuxiliaryInputState,
  modifierId: ModifierIdType,
): ModifierInputValues {
  return inputModifierCatalogue[modifierId].extraInputs.reduce((values, quantityId) => {
    const value = auxiliary[quantityId];
    if (value !== undefined) {
      values[quantityId] = value;
    }
    return values;
  }, {} as ModifierInputValues);
}

export function collectModifierInputsByModifier(
  auxiliary: AuxiliaryInputState,
): Partial<Record<ModifierIdType, ModifierInputValues>> {
  return modifierOrder.reduce((byModifier, modifierId) => {
    byModifier[modifierId] = collectModifierInputsForModifier(auxiliary, modifierId);
    return byModifier;
  }, {} as Partial<Record<ModifierIdType, ModifierInputValues>>);
}

export function applyPrimaryPatch(
  quantitiesByInput: QuantitiesByInputState,
  inputId: InputIdType,
  patch: Partial<PrimaryInputState>,
): void {
  for (const quantityId of primaryInputOrder) {
    const value = patch[quantityId];
    if (value !== undefined) {
      quantitiesByInput[inputId][quantityId] = value;
    }
  }
}

export function isPrimaryQuantityId(value: string): value is PrimaryQuantityId {
  return primaryInputOrder.some((quantityId) => quantityId === value);
}

export function isSlotQuantityId(value: string): value is PhysicalQuantityIdType {
  return isPhysicalQuantityId(value)
    && resolveQuantityState(value) === QuantityState.Slot;
}

export function isModelQuantityId(value: string): value is PhysicalQuantityIdType {
  return isPhysicalQuantityId(value)
    && resolveQuantityState(value) === QuantityState.Model;
}

export function slotQuantityIds(): readonly PhysicalQuantityIdType[] {
  return [
    ...derivedQuantityIds,
    ...Object.values(physicalQuantityMetaById)
      .filter((meta) => meta.modifierId !== undefined)
      .map((meta) => meta.id),
  ];
}
