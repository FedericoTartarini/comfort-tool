import type { ModelId as ModelIdType } from "../catalog/modelIds";
import {
  InputId,
  type InputId as InputIdType,
} from "../catalog/inputSlots";
import type { PhysicalQuantityId as PhysicalQuantityIdType } from "../catalog/quantities";
import type { ModifierId as ModifierIdType } from "../catalog/inputModifiers";
import {
  convertQuantityFromSi,
  formatDisplayValue,
} from "../engines/units";
import type { PointSession } from "../state/pointSession/sessionTypes";

/**
 * Test writes go through actions so invalidate/schedule stay on the session path.
 */
export function seedSelectedModel(
  session: PointSession,
  modelId: ModelIdType,
  options?: { validateRanges?: boolean; schedule?: boolean },
): void {
  session.actions.setSelectedModel(modelId, {
    validateRanges: options?.validateRanges ?? false,
    schedule: options?.schedule ?? false,
  });
}

export function seedPrimaryQuantity(
  session: PointSession,
  inputId: InputIdType,
  quantityId: PhysicalQuantityIdType,
  valueSi: number,
): void {
  const accepted = session.actions.updateBuiltinQuantity(inputId, quantityId, valueSi);
  if (!accepted) {
    throw new Error(
      `seedPrimaryQuantity rejected ${quantityId}=${valueSi} on ${inputId}.`,
    );
  }
}

export function seedModifierInput(
  session: PointSession,
  inputId: InputIdType,
  modifierId: ModifierIdType,
  quantityId: PhysicalQuantityIdType,
  valueSi: number,
): void {
  const display = convertQuantityFromSi(quantityId, valueSi, session.setting.unitSystem);
  const accepted = session.actions.updateModifierInput(
    inputId,
    modifierId,
    quantityId,
    formatDisplayValue(display),
  );
  if (!accepted) {
    throw new Error(
      `seedModifierInput rejected ${modifierId}/${quantityId}=${valueSi} on ${inputId}.`,
    );
  }
}

export function seedModifierEnabled(
  session: PointSession,
  inputId: InputIdType,
  modifierId: ModifierIdType,
  enabled: boolean,
): void {
  const accepted = session.actions.setModifierEnabled(inputId, modifierId, enabled);
  if (!accepted) {
    throw new Error(
      `seedModifierEnabled rejected ${modifierId}=${enabled} on ${inputId}.`,
    );
  }
}

export function seedCompareVisibleInputs(
  session: PointSession,
  inputIds: readonly InputIdType[],
): void {
  session.actions.setCompareEnabled(true);
  const wanted = new Set(inputIds);
  for (const inputId of [InputId.Input2, InputId.Input3]) {
    const visible = session.setting.compareInputIds.includes(inputId);
    if (visible !== wanted.has(inputId)) {
      session.actions.toggleCompareInputVisibility(inputId);
    }
  }
}
