import type { AuthoringFieldOverride } from "./controls/fieldInputBehaviors";
import type { InputWidget } from "../../catalog/inputWidgets";
import type { PhysicalQuantityId, QuantityState } from "../../catalog/quantities";

export interface QuantityInputBind extends AuthoringFieldOverride {
  readonly role: "input";
  readonly library: string;
}

export interface QuantityResultBind {
  readonly role: "result";
  readonly library: string;
  readonly quantity: PhysicalQuantityId;
  readonly from?: (si: QuantityState, primaryResult: object) => number;
}

export function inputQuantity(
  library: string,
  quantity: PhysicalQuantityId,
  range: Omit<AuthoringFieldOverride, "quantity"> & { widget?: InputWidget },
): QuantityInputBind {
  return {
    role: "input",
    library,
    quantity,
    ...range,
  };
}

export function resultQuantity(
  library: string,
  quantity: PhysicalQuantityId,
  extras?: { from?: QuantityResultBind["from"] },
): QuantityResultBind {
  return {
    role: "result",
    library,
    quantity,
    ...(extras?.from ? { from: extras.from } : {}),
  };
}

export function quantityRow(quantity: PhysicalQuantityId): PhysicalQuantityId {
  return quantity;
}

export function toAuthoringInputField(
  bind: QuantityInputBind,
): AuthoringFieldOverride {
  const { role: _role, library: _library, ...field } = bind;
  return field;
}
