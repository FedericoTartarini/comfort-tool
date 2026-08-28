import { describe, expect, it } from "vitest";

import { InputId } from "../../catalog/inputSlots";
import { PhysicalQuantityId, createDefaultExtraInputs } from "../../catalog/quantities";
import { ModifierId } from "../../catalog/inputModifiers";
import {
  collectModifierInputsForModifier,
  createAuxiliaryQuantitiesByInput,
  getPrimaryQuantity,
  getSlotQuantity,
  setPrimaryQuantity,
  setSlotQuantity,
  syncAllDerivedQuantities,
} from "./quantityStateRouting";
import { createQuantitiesByInput } from "../../state/pointSession/initialPointSessionState";
import { derivePsychrometricSlots } from "./derivations/psychrometrics";
import { syncDerivedStateForInput } from "./syncState";

describe("quantityStateRouting", () => {
  it("reads and writes primary quantities", () => { const quantitiesByInput = createQuantitiesByInput();
    setPrimaryQuantity(
      quantitiesByInput[InputId.Input1], PhysicalQuantityId.DryBulbTemperature, 27, );
    expect(getPrimaryQuantity(
      quantitiesByInput[InputId.Input1],
      PhysicalQuantityId.DryBulbTemperature,
    )).toBe(27); });

  it("stores modifier slot quantities in auxiliary state", () => {
    const auxiliaryQuantitiesByInput = createAuxiliaryQuantitiesByInput();
    setSlotQuantity(
      auxiliaryQuantitiesByInput[InputId.Input1],
      PhysicalQuantityId.ModifierMeasuredAirSpeed,
      0.6,
    );
    expect(getSlotQuantity(
      auxiliaryQuantitiesByInput[InputId.Input1],
      PhysicalQuantityId.ModifierMeasuredAirSpeed,
    )).toBe(0.6);
    expect(collectModifierInputsForModifier(
      auxiliaryQuantitiesByInput[InputId.Input1],
      ModifierId.MeasuredAirSpeed,
    )).toEqual({
      [PhysicalQuantityId.ModifierMeasuredAirSpeed]: 0.6,
    });
  });

  it("syncs derived psychrometric quantities into auxiliary state", () => {
    const quantitiesByInput = createQuantitiesByInput();
    const auxiliaryQuantitiesByInput = createAuxiliaryQuantitiesByInput();
    syncAllDerivedQuantities(
      quantitiesByInput,
      auxiliaryQuantitiesByInput,
      derivePsychrometricSlots,
    );
    expect(auxiliaryQuantitiesByInput[InputId.Input1][PhysicalQuantityId.DewPoint])
      .toBeTypeOf("number");
  });

  it("aligns auxiliary derived slots with primary RH-mode psychrometrics", () => { const quantitiesByInput = createQuantitiesByInput();
    const auxiliaryQuantitiesByInput = createAuxiliaryQuantitiesByInput();
    syncDerivedStateForInput(InputId.Input1, quantitiesByInput, auxiliaryQuantitiesByInput);
    const derived = derivePsychrometricSlots(quantitiesByInput[InputId.Input1]);
    expect(auxiliaryQuantitiesByInput[InputId.Input1][PhysicalQuantityId.HumidityRatio])
      .toBeCloseTo(derived[PhysicalQuantityId.HumidityRatio], 4);
    expect(auxiliaryQuantitiesByInput[InputId.Input1][PhysicalQuantityId.DewPoint])
      .toBeCloseTo(derived[PhysicalQuantityId.DewPoint], 4); });

  it("seeds extra quantity defaults from catalog ids", () => { const modelInputs = createDefaultExtraInputs([
      PhysicalQuantityId.BodyWeight, PhysicalQuantityId.Height, ]);
    expect(modelInputs[PhysicalQuantityId.BodyWeight]).toBe(75);
    expect(modelInputs[PhysicalQuantityId.Height]).toBe(1.8); });
});
