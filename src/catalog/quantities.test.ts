import { describe, expect, it } from "vitest";

import { SiUnit } from "./units";
import {
  PhysicalQuantityId,
  QuantityState,
  derivedQuantityIds,
  extraQuantityIds,
  physicalQuantityMetaById,
  primaryInputOrder,
  resolveQuantityState,
} from "./quantities";

describe("quantities metadata", () => {
  it("defines catalog metadata for every quantity id", () => {
    for (const id of Object.values(PhysicalQuantityId)) {
      expect(physicalQuantityMetaById[id].id).toBe(id);
    }
  });

  it("keeps primary order aligned with occupancy lists", () => {
    expect(primaryInputOrder.every((id) => (
      resolveQuantityState(id) === QuantityState.Primary
    ))).toBe(true);
  });

  it("marks derived slot quantities with derivedFrom sources", () => {
    for (const id of derivedQuantityIds) {
      const meta = physicalQuantityMetaById[id];
      expect(resolveQuantityState(id)).toBe(QuantityState.Slot);
      expect(meta.derivedFrom?.length).toBeGreaterThan(0);
    }
  });

  it("defines body weight and height as Extra catalog quantities outside primary order", () => {
    expect(resolveQuantityState(PhysicalQuantityId.BodyWeight)).toBe(QuantityState.Extra);
    expect(resolveQuantityState(PhysicalQuantityId.Height)).toBe(QuantityState.Extra);
    expect(primaryInputOrder).not.toContain(PhysicalQuantityId.BodyWeight);
    expect(primaryInputOrder).not.toContain(PhysicalQuantityId.Height);
    expect([...extraQuantityIds]).toEqual([
      PhysicalQuantityId.BodyWeight,
      PhysicalQuantityId.Height,
    ]);
  });

  it("stores humidity ratio as kg/kg and vapor pressure as Pa", () => {
    expect(physicalQuantityMetaById[PhysicalQuantityId.HumidityRatio].display.units.SI)
      .toBe(SiUnit.KilogramPerKilogram);
    expect(physicalQuantityMetaById[PhysicalQuantityId.HumidityRatio].defaultSi).toBe(0.009);
    expect(physicalQuantityMetaById[PhysicalQuantityId.VaporPressure].display.units.SI)
      .toBe(SiUnit.Pascal);
    expect(physicalQuantityMetaById[PhysicalQuantityId.VaporPressure].defaultSi).toBe(1500);
  });

  it("uses a known SiUnit for every catalog quantity", () => {
    const knownSiUnits = new Set(Object.values(SiUnit));
    for (const meta of Object.values(physicalQuantityMetaById)) {
      expect(knownSiUnits.has(meta.display.units.SI)).toBe(true);
    }
  });

  it("includes result quantities in the closed catalog", () => {
    expect(physicalQuantityMetaById[PhysicalQuantityId.Pmv].id).toBe(PhysicalQuantityId.Pmv);
    expect(physicalQuantityMetaById[PhysicalQuantityId.HeatIndex].display.units.SI)
      .toBe(SiUnit.DegreeCelsius);
    expect(physicalQuantityMetaById[PhysicalQuantityId.CoolingEffect].display.units.SI)
      .toBe(SiUnit.KelvinDelta);
    expect(physicalQuantityMetaById[PhysicalQuantityId.PhsLimitingExposureTime].display.units.SI)
      .toBe(SiUnit.Minute);
    expect(resolveQuantityState(PhysicalQuantityId.Pmv)).toBeUndefined();
  });
});
