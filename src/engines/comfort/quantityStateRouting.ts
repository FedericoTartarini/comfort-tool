import {
  inputModifierCatalogue,
  modifierOrder,
  modifierQuantityIds,
  type ModifierId as ModifierIdType,
  type ModifierInputValues,
} from "../../catalog/inputModifiers";
import { InputId, inputOrder, type InputId as InputIdType } from "../../catalog/inputSlots";
import {
  PhysicalQuantityId,
  derivedHumidityQuantityIds,
  isPhysicalQuantityId,
  isPrimaryQuantityId,
  physicalQuantityMetaById,
  primaryInputOrder,
  type AuxiliaryInputState,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PrimaryInputState,
  type PrimaryQuantityId,
} from "../../catalog/quantities";
import { type ModelId as ModelIdType } from "../../catalog/modelIds";
import type { DerivedSlotQuantityState } from "./derivations/psychrometrics";

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
  return { [PhysicalQuantityId.DewPointTemperature]: auxiliary[PhysicalQuantityId.DewPointTemperature]
      ?? physicalQuantityMetaById[PhysicalQuantityId.DewPointTemperature].defaultSi, [PhysicalQuantityId.HumidityRatio]: auxiliary[PhysicalQuantityId.HumidityRatio]
      ?? physicalQuantityMetaById[PhysicalQuantityId.HumidityRatio].defaultSi, [PhysicalQuantityId.WetBulbTemperature]: auxiliary[PhysicalQuantityId.WetBulbTemperature]
      ?? physicalQuantityMetaById[PhysicalQuantityId.WetBulbTemperature].defaultSi, [PhysicalQuantityId.VaporPressure]: auxiliary[PhysicalQuantityId.VaporPressure]
      ?? physicalQuantityMetaById[PhysicalQuantityId.VaporPressure].defaultSi };
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
): void { auxiliary[PhysicalQuantityId.DewPointTemperature] = derived[PhysicalQuantityId.DewPointTemperature];
  auxiliary[PhysicalQuantityId.HumidityRatio] = derived[PhysicalQuantityId.HumidityRatio];
  auxiliary[PhysicalQuantityId.WetBulbTemperature] = derived[PhysicalQuantityId.WetBulbTemperature];
  auxiliary[PhysicalQuantityId.VaporPressure] = derived[PhysicalQuantityId.VaporPressure]; }

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

export { isPrimaryQuantityId };

export function isSlotQuantityId(value: string): value is PhysicalQuantityIdType {
  return isPhysicalQuantityId(value)
    && (
      derivedHumidityQuantityIds.some((id) => id === value)
      || modifierQuantityIds.some((id) => id === value)
    );
}

export function isAllowedExtraQuantityId(
  value: string,
): value is PhysicalQuantityIdType {
  if (!isPhysicalQuantityId(value) || isPrimaryQuantityId(value)) {
    return false;
  }
  return !derivedHumidityQuantityIds.some((id) => id === value)
    && !modifierQuantityIds.some((id) => id === value);
}

export function isExtraQuantityId(value: string): value is PhysicalQuantityIdType {
  return isAllowedExtraQuantityId(value);
}

export function slotQuantityIds(): readonly PhysicalQuantityIdType[] {
  return [...derivedHumidityQuantityIds, ...modifierQuantityIds];
}
