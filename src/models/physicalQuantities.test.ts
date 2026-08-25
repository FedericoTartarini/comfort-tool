import { describe, expect, it } from "vitest";

import { ComfortModel } from "./comfortModels";
import { PhsQuantityId } from "./phs";
import { SiUnit } from "./units";
import {
  PhysicalQuantityId,
  PhysicalQuantityScope,
  QuantityState,
  derivedQuantityIds,
  mergeQuantityCatalog,
  primaryInputOrder,
  systemQuantityMetaById,
} from "./physicalQuantities";

const massExtension = {
  id: "test.bodyMass",
  owner: ComfortModel.Phs2023,
  scope: PhysicalQuantityScope.Model,
  label: "Body mass",
  display: {
    units: { SI: SiUnit.Kilogram, IP: "lb" },
    displayUnits: { SI: "kg", IP: "lb" },
    step: 1,
    decimals: 0,
  },
  defaultSi: 75,
  minSi: 30,
  maxSi: 200,
} as const;

describe("physicalQuantities metadata", () => {
  it("defines system-seed metadata for every system catalog id", () => {
    for (const id of Object.values(PhysicalQuantityId)) {
      expect(systemQuantityMetaById[id].id).toBe(id);
      expect(systemQuantityMetaById[id].scope).toBe(PhysicalQuantityScope.System);
    }
  });

  it("keeps primary order aligned with primary-state metadata", () => {
    expect(primaryInputOrder.every((id) => (
      systemQuantityMetaById[id].state === QuantityState.Primary
    ))).toBe(true);
  });

  it("marks derived slot quantities with derivedFrom sources", () => {
    for (const id of derivedQuantityIds) {
      const meta = systemQuantityMetaById[id];
      expect(meta.state).toBe(QuantityState.Slot);
      expect(meta.derivedFrom?.length).toBeGreaterThan(0);
    }
  });

  it("keeps PHS mass and length out of the system seed and primary order", () => {
    expect(systemQuantityMetaById).not.toHaveProperty(PhsQuantityId.BodyWeight);
    expect(systemQuantityMetaById).not.toHaveProperty(PhsQuantityId.Height);
    expect(primaryInputOrder).not.toContain(PhsQuantityId.BodyWeight);
    expect(primaryInputOrder).not.toContain(PhsQuantityId.Height);
  });

  it("merges model-scoped extensions into one catalog", () => {
    const catalog = mergeQuantityCatalog(systemQuantityMetaById, [massExtension]);
    expect(catalog[massExtension.id]).toMatchObject({
      id: massExtension.id,
      scope: PhysicalQuantityScope.Model,
      state: QuantityState.Model,
      ownerModelId: ComfortModel.Phs2023,
      defaultSi: 75,
    });
    expect(catalog[PhysicalQuantityId.DryBulbTemperature])
      .toEqual(systemQuantityMetaById[PhysicalQuantityId.DryBulbTemperature]);
    expect(primaryInputOrder).not.toContain(massExtension.id);
  });

  it("rejects duplicate, system-colliding, and primary-order extensions", () => {
    expect(() => mergeQuantityCatalog(systemQuantityMetaById, [
      massExtension,
      { ...massExtension },
    ])).toThrow(/Duplicate quantity id/);
    expect(() => mergeQuantityCatalog(systemQuantityMetaById, [{
      ...massExtension,
      id: PhysicalQuantityId.HumidityRatio,
    }])).toThrow(/Duplicate quantity id/);
    expect(() => mergeQuantityCatalog({}, [{
      ...massExtension,
      id: PhysicalQuantityId.DryBulbTemperature,
    }])).toThrow(/must not enter primaryInputOrder/);
    expect(() => mergeQuantityCatalog(systemQuantityMetaById, [{
      ...massExtension,
      id: "test.unknownUnit",
      display: {
        ...massExtension.display,
        units: { SI: "stone" as SiUnit, IP: "lb" },
      },
    }])).toThrow(/unknown SI unit "stone"/);
  });

  it("stores humidity ratio as kg/kg and vapor pressure as Pa", () => {
    expect(systemQuantityMetaById[PhysicalQuantityId.HumidityRatio].display.units.SI)
      .toBe(SiUnit.KilogramPerKilogram);
    expect(systemQuantityMetaById[PhysicalQuantityId.DerivedHumidityRatio].display.units.SI)
      .toBe(SiUnit.KilogramPerKilogram);
    expect(systemQuantityMetaById[PhysicalQuantityId.HumidityRatio].defaultSi).toBe(0.009);
    expect(systemQuantityMetaById[PhysicalQuantityId.VaporPressure].display.units.SI)
      .toBe(SiUnit.Pascal);
    expect(systemQuantityMetaById[PhysicalQuantityId.VaporPressure].defaultSi).toBe(1500);
  });

  it("uses a known SiUnit for every system-seed quantity", () => {
    const knownSiUnits = new Set(Object.values(SiUnit));
    for (const meta of Object.values(systemQuantityMetaById)) {
      expect(knownSiUnits.has(meta.display.units.SI)).toBe(true);
    }
  });
});
