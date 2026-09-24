import { describe, expect, it } from "vitest";

import { InputId } from "../../catalog/inputSlots";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { ModifierId } from "../../catalog/inputModifiers";
import {
  collectModifierInputsForModifier,
  getQuantity,
  omitDerivedHumidity,
  setQuantity,
} from "./quantityStateRouting";
import { createQuantitiesByInput } from "../../state/pointSession/initialPointSessionState";
import { derivePsychrometricSlots } from "./derivations/psychrometrics";
import { syncDerivedStateForInput } from "./syncState";

describe("quantityStateRouting", () => {
  it("reads and writes quantities in one bag", () => {
    const quantitiesByInput = createQuantitiesByInput();
    setQuantity(
      quantitiesByInput[InputId.Input1],
      PhysicalQuantityId.DryBulbTemperature,
      27,
    );
    expect(getQuantity(
      quantitiesByInput[InputId.Input1],
      PhysicalQuantityId.DryBulbTemperature,
    )).toBe(27);
  });

  it("stores modifier inputs in the same quantity bag", () => {
    const quantitiesByInput = createQuantitiesByInput();
    setQuantity(
      quantitiesByInput[InputId.Input1],
      PhysicalQuantityId.MeasuredAirSpeed,
      0.6,
    );
    expect(getQuantity(
      quantitiesByInput[InputId.Input1],
      PhysicalQuantityId.MeasuredAirSpeed,
    )).toBe(0.6);
    expect(collectModifierInputsForModifier(
      quantitiesByInput[InputId.Input1],
      ModifierId.MeasuredAirSpeed,
    )).toEqual({
      [PhysicalQuantityId.MeasuredAirSpeed]: 0.6,
    });
  });

  it("syncs derived psychrometric quantities into the same bag", () => {
    const quantitiesByInput = createQuantitiesByInput();
    syncDerivedStateForInput(InputId.Input1, quantitiesByInput);
    expect(quantitiesByInput[InputId.Input1][PhysicalQuantityId.DewPointTemperature])
      .toBeTypeOf("number");
    const derived = derivePsychrometricSlots(quantitiesByInput[InputId.Input1]);
    expect(quantitiesByInput[InputId.Input1][PhysicalQuantityId.HumidityRatio])
      .toBeCloseTo(derived[PhysicalQuantityId.HumidityRatio], 4);
  });

  it("omits derived humidity from the share bag", () => {
    const quantitiesByInput = createQuantitiesByInput();
    const wire = omitDerivedHumidity(quantitiesByInput[InputId.Input1]);
    expect(wire[PhysicalQuantityId.HumidityRatio]).toBeUndefined();
    expect(wire[PhysicalQuantityId.DryBulbTemperature]).toBeTypeOf("number");
  });
});
