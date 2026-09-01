import { InputId, inputOrder, type InputId as InputIdType } from "../../catalog/inputSlots";
import {
  PhysicalQuantityId,
  isDerivedHumidityQuantityId,
  isPhysicalQuantityId,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type QuantityState,
} from "../../catalog/quantities";
import {
  inputModifierCatalogue,
  modifierOrder,
  modifierQuantityIds,
  type ModifierId as ModifierIdType,
  type ModifierInputValues,
} from "../../catalog/inputModifiers";
import type { DerivedSlotQuantityState } from "./derivations/psychrometrics";

export type QuantitiesByInputState = Record<InputIdType, QuantityState>;

export function createEmptyQuantityState(): QuantityState {
  return {};
}

export function createQuantitiesByInputState(
  createSlot: () => QuantityState,
): QuantitiesByInputState {
  return inputOrder.reduce((byInput, inputId) => {
    byInput[inputId] = createSlot();
    return byInput;
  }, {} as QuantitiesByInputState);
}

export function getQuantity(
  quantities: QuantityState,
  quantityId: PhysicalQuantityIdType,
): number | undefined {
  return quantities[quantityId];
}

export function setQuantity(
  quantities: QuantityState,
  quantityId: PhysicalQuantityIdType,
  value: number | undefined,
): void {
  if (value === undefined) {
    delete quantities[quantityId];
    return;
  }
  quantities[quantityId] = value;
}

export function applyQuantityPatch(
  quantities: QuantityState,
  patch: QuantityState,
): void {
  for (const [rawId, value] of Object.entries(patch)) {
    if (!isPhysicalQuantityId(rawId) || value === undefined) continue;
    quantities[rawId] = value;
  }
}

export function requireQuantity(
  quantities: QuantityState,
  quantityId: PhysicalQuantityIdType,
): number {
  const value = quantities[quantityId];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Missing quantity ${quantityId}.`);
  }
  return value;
}

export function getDerivedFromQuantities(quantities: QuantityState): DerivedSlotQuantityState {
  return {
    [PhysicalQuantityId.DewPointTemperature]: quantities[PhysicalQuantityId.DewPointTemperature]
      ?? 0,
    [PhysicalQuantityId.HumidityRatio]: quantities[PhysicalQuantityId.HumidityRatio]
      ?? 0,
    [PhysicalQuantityId.WetBulbTemperature]: quantities[PhysicalQuantityId.WetBulbTemperature]
      ?? 0,
    [PhysicalQuantityId.VaporPressure]: quantities[PhysicalQuantityId.VaporPressure]
      ?? 0,
  };
}

export function getDerivedByInput(
  quantitiesByInput: QuantitiesByInputState,
): Record<InputIdType, DerivedSlotQuantityState> {
  return {
    [InputId.Input1]: getDerivedFromQuantities(quantitiesByInput[InputId.Input1]),
    [InputId.Input2]: getDerivedFromQuantities(quantitiesByInput[InputId.Input2]),
    [InputId.Input3]: getDerivedFromQuantities(quantitiesByInput[InputId.Input3]),
  };
}

export function syncDerivedQuantities(
  quantities: QuantityState,
  derived: DerivedSlotQuantityState,
): void {
  quantities[PhysicalQuantityId.DewPointTemperature] = derived[PhysicalQuantityId.DewPointTemperature];
  quantities[PhysicalQuantityId.HumidityRatio] = derived[PhysicalQuantityId.HumidityRatio];
  quantities[PhysicalQuantityId.WetBulbTemperature] = derived[PhysicalQuantityId.WetBulbTemperature];
  quantities[PhysicalQuantityId.VaporPressure] = derived[PhysicalQuantityId.VaporPressure];
}

export function syncAllDerivedQuantities(
  quantitiesByInput: QuantitiesByInputState,
  deriveForQuantities: (quantities: QuantityState) => DerivedSlotQuantityState,
): void {
  for (const inputId of inputOrder) {
    syncDerivedQuantities(quantitiesByInput[inputId], deriveForQuantities(quantitiesByInput[inputId]));
  }
}

export function collectModifierInputsForModifier(
  quantities: QuantityState,
  modifierId: ModifierIdType,
): ModifierInputValues {
  return inputModifierCatalogue[modifierId].modifierInputs.reduce((values, quantityId) => {
    const value = quantities[quantityId];
    if (value !== undefined) {
      values[quantityId] = value;
    }
    return values;
  }, {} as ModifierInputValues);
}

export function collectModifierInputsByModifier(
  quantities: QuantityState,
): Partial<Record<ModifierIdType, ModifierInputValues>> {
  return modifierOrder.reduce((byModifier, modifierId) => {
    byModifier[modifierId] = collectModifierInputsForModifier(quantities, modifierId);
    return byModifier;
  }, {} as Partial<Record<ModifierIdType, ModifierInputValues>>);
}

export function applyQuantityPatchByInput(
  quantitiesByInput: QuantitiesByInputState,
  inputId: InputIdType,
  patch: QuantityState,
): void {
  applyQuantityPatch(quantitiesByInput[inputId], patch);
}

export function omitDerivedHumidity(quantities: QuantityState): QuantityState {
  const wire: QuantityState = {};
  for (const [rawId, value] of Object.entries(quantities)) {
    if (!isPhysicalQuantityId(rawId) || isDerivedHumidityQuantityId(rawId) || value === undefined) {
      continue;
    }
    wire[rawId] = value;
  }
  return wire;
}

export function isModifierQuantityId(value: string): value is PhysicalQuantityIdType {
  return modifierQuantityIds.some((id) => id === value);
}

export function isWritableQuantityId(value: string): value is PhysicalQuantityIdType {
  return isPhysicalQuantityId(value) && !isDerivedHumidityQuantityId(value);
}
